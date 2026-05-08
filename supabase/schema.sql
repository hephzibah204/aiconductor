-- ══════════════════════════════════════════════════════════════════
-- CONDUCTOR AI — Production Database Schema
-- Run this entire file in Supabase Dashboard → SQL Editor
-- ══════════════════════════════════════════════════════════════════

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_cron";
CREATE EXTENSION IF NOT EXISTS "pg_net";

-- ══════════════════════════════════════════════════════════════════
-- 1. USER PROFILES
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS user_profiles (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username        TEXT NOT NULL DEFAULT 'Anonymous',
  city            TEXT NOT NULL DEFAULT 'Lagos'
                  CHECK (city IN ('Lagos','Abuja','Port Harcourt','Kano')),
  points          INTEGER NOT NULL DEFAULT 0 CHECK (points >= 0),
  reports_count   INTEGER NOT NULL DEFAULT 0 CHECK (reports_count >= 0),
  streak          INTEGER NOT NULL DEFAULT 0,
  last_active     DATE,
  verified        BOOLEAN NOT NULL DEFAULT false,
  verification_level INTEGER NOT NULL DEFAULT 0,
  avatar_emoji    TEXT DEFAULT '🚌',
  bio             TEXT CHECK (char_length(bio) <= 200),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view all profiles" ON user_profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON user_profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON user_profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO user_profiles (id, username)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'username', 'Commuter_' || LEFT(NEW.id::TEXT, 6)));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ══════════════════════════════════════════════════════════════════
-- 2. FARE REPORTS (community submissions)
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS fare_reports (
  id              BIGSERIAL PRIMARY KEY,
  city            TEXT NOT NULL CHECK (city IN ('Lagos','Abuja','Port Harcourt','Kano')),
  transport_type  TEXT NOT NULL CHECK (transport_type IN ('danfo','keke','okada','uber','brt','taxi','ferry')),
  route_from      TEXT NOT NULL CHECK (char_length(route_from) <= 100),
  route_to        TEXT NOT NULL CHECK (char_length(route_to) <= 100),
  fare_amount     INTEGER NOT NULL CHECK (fare_amount > 0 AND fare_amount < 50000),
  notes           TEXT CHECK (char_length(notes) <= 300),
  is_surge        BOOLEAN NOT NULL DEFAULT false,
  verified        BOOLEAN NOT NULL DEFAULT false,
  upvotes         INTEGER NOT NULL DEFAULT 0,
  submitted_by    TEXT DEFAULT 'anonymous',
  user_id         UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE fare_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view fare reports" ON fare_reports FOR SELECT USING (true);
CREATE POLICY "Authenticated users can submit fare reports" ON fare_reports
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL OR submitted_by = 'anonymous');

CREATE INDEX idx_fare_reports_city ON fare_reports(city);
CREATE INDEX idx_fare_reports_created ON fare_reports(created_at DESC);

-- ══════════════════════════════════════════════════════════════════
-- 3. FARE INDEX (canonical fare reference)
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS fare_index (
  id              BIGSERIAL PRIMARY KEY,
  city            TEXT NOT NULL CHECK (city IN ('Lagos','Abuja','Port Harcourt','Kano')),
  transport_type  TEXT NOT NULL,
  route_from      TEXT NOT NULL,
  route_to        TEXT NOT NULL,
  min_fare        INTEGER NOT NULL CHECK (min_fare > 0),
  max_fare        INTEGER NOT NULL CHECK (max_fare >= min_fare),
  verified        BOOLEAN NOT NULL DEFAULT false,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(city, transport_type, route_from, route_to)
);

ALTER TABLE fare_index ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view fare index" ON fare_index FOR SELECT USING (true);
CREATE POLICY "Service role can manage fare index" ON fare_index
  FOR ALL USING (auth.role() = 'service_role');

-- Seed data — Lagos
INSERT INTO fare_index (city, transport_type, route_from, route_to, min_fare, max_fare, verified) VALUES
  ('Lagos','danfo','Oshodi','CMS',200,350,true),
  ('Lagos','danfo','Lekki','Victoria Island',500,900,true),
  ('Lagos','danfo','Ikeja','Lagos Island',400,700,true),
  ('Lagos','keke','Yaba','Surulere',150,250,true),
  ('Lagos','okada','Lekki Phase 1','Ajah',400,700,true),
  ('Lagos','uber','Lekki','Victoria Island',900,1600,true),
  ('Lagos','brt','Oshodi','TBS',250,300,true),
  -- Abuja
  ('Abuja','keke','Wuse','Garki',300,500,true),
  ('Abuja','uber','Maitama','Airport',2500,4000,true),
  ('Abuja','keke','Lugbe','City Centre',600,900,true),
  ('Abuja','uber','Gwarinpa','City Centre',1200,2000,true),
  -- Port Harcourt
  ('Port Harcourt','keke','GRA','Mile 1',400,700,true),
  ('Port Harcourt','okada','Trans Amadi','Rumuola',300,500,true),
  ('Port Harcourt','uber','Airport','GRA',1500,2500,true),
  -- Kano
  ('Kano','keke','Bompai','Kofar Wambai',200,400,true),
  ('Kano','keke','Nasarawa','City',300,500,true),
  ('Kano','uber','Airport','City Centre',1200,2000,true)
ON CONFLICT (city, transport_type, route_from, route_to) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════
-- 4. TRAFFIC UPDATES (AI-generated)
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS traffic_updates (
  id              BIGSERIAL PRIMARY KEY,
  city            TEXT NOT NULL CHECK (city IN ('Lagos','Abuja','Port Harcourt','Kano')),
  level           TEXT NOT NULL CHECK (level IN ('severe','medium','light')),
  alert           TEXT NOT NULL CHECK (char_length(alert) <= 400),
  routes_affected TEXT[] DEFAULT '{}',
  estimated_delay_mins INTEGER,
  valid_until     TIMESTAMPTZ,
  generated_by    TEXT DEFAULT 'traffic-agent',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE traffic_updates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view traffic updates" ON traffic_updates FOR SELECT USING (true);
CREATE POLICY "Service role can manage traffic" ON traffic_updates
  FOR ALL USING (auth.role() = 'service_role');

CREATE INDEX idx_traffic_city ON traffic_updates(city);
CREATE INDEX idx_traffic_created ON traffic_updates(created_at DESC);

-- ══════════════════════════════════════════════════════════════════
-- 5. CITY ALERTS
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS city_alerts (
  id              BIGSERIAL PRIMARY KEY,
  city            TEXT NOT NULL CHECK (city IN ('Lagos','Abuja','Port Harcourt','Kano','All')),
  type            TEXT NOT NULL CHECK (type IN ('weather','fuel','accident','closure','safety','general')),
  severity        TEXT NOT NULL CHECK (severity IN ('info','warning','critical')),
  title           TEXT NOT NULL CHECK (char_length(title) <= 100),
  body            TEXT NOT NULL CHECK (char_length(body) <= 500),
  action          TEXT CHECK (char_length(action) <= 200),
  active          BOOLEAN NOT NULL DEFAULT true,
  expires_at      TIMESTAMPTZ,
  generated_by    TEXT DEFAULT 'alerts-agent',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE city_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view active alerts" ON city_alerts FOR SELECT USING (active = true);
CREATE POLICY "Service role can manage alerts" ON city_alerts
  FOR ALL USING (auth.role() = 'service_role');

CREATE INDEX idx_alerts_city ON city_alerts(city);
CREATE INDEX idx_alerts_active ON city_alerts(active, expires_at);

-- ══════════════════════════════════════════════════════════════════
-- 6. COMMUNITY FEED POSTS
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS feed_posts (
  id              BIGSERIAL PRIMARY KEY,
  content         TEXT NOT NULL CHECK (char_length(content) BETWEEN 10 AND 500),
  city            TEXT NOT NULL CHECK (city IN ('Lagos','Abuja','Port Harcourt','Kano')),
  type            TEXT NOT NULL DEFAULT 'general'
                  CHECK (type IN ('traffic','fare','fuel','accident','general')),
  username        TEXT NOT NULL DEFAULT 'Anonymous',
  user_id         UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  likes           INTEGER NOT NULL DEFAULT 0,
  comments        INTEGER NOT NULL DEFAULT 0,
  verified_poster BOOLEAN NOT NULL DEFAULT false,
  moderated       BOOLEAN NOT NULL DEFAULT false,
  removed         BOOLEAN NOT NULL DEFAULT false,
  flagged         BOOLEAN NOT NULL DEFAULT false,
  moderation_reason TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE feed_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view approved posts" ON feed_posts
  FOR SELECT USING (moderated = true AND removed = false AND flagged = false);
CREATE POLICY "Authenticated users can post" ON feed_posts
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Users can update own posts" ON feed_posts
  FOR UPDATE USING (auth.uid() = user_id);

CREATE INDEX idx_feed_city ON feed_posts(city);
CREATE INDEX idx_feed_created ON feed_posts(created_at DESC);
CREATE INDEX idx_feed_type ON feed_posts(type);

-- ══════════════════════════════════════════════════════════════════
-- 7. POST LIKES
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS post_likes (
  post_id     BIGINT REFERENCES feed_posts(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_id, user_id)
);

ALTER TABLE post_likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view likes" ON post_likes FOR SELECT USING (true);
CREATE POLICY "Authenticated users can like" ON post_likes
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can unlike" ON post_likes
  FOR DELETE USING (auth.uid() = user_id);

-- Auto-update likes count
CREATE OR REPLACE FUNCTION update_post_likes()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE feed_posts SET likes = likes + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE feed_posts SET likes = GREATEST(0, likes - 1) WHERE id = OLD.post_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER on_like_change
  AFTER INSERT OR DELETE ON post_likes
  FOR EACH ROW EXECUTE FUNCTION update_post_likes();

-- ══════════════════════════════════════════════════════════════════
-- 8. CHAT LOGS (AI Oracle history)
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS chat_logs (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
  session_id  TEXT NOT NULL,
  role        TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content     TEXT NOT NULL,
  city        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE chat_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own chat logs" ON chat_logs
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own chat logs" ON chat_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_chat_user ON chat_logs(user_id, session_id);
CREATE INDEX idx_chat_created ON chat_logs(created_at DESC);

-- ══════════════════════════════════════════════════════════════════
-- 9. CONTENT QUEUE (AI-generated content pending approval)
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS content_queue (
  id              BIGSERIAL PRIMARY KEY,
  type            TEXT NOT NULL CHECK (type IN ('tip','announcement','safety')),
  city            TEXT NOT NULL DEFAULT 'All Cities',
  title           TEXT NOT NULL,
  body            TEXT NOT NULL,
  cta             TEXT,
  emoji           TEXT DEFAULT '🚌',
  published       BOOLEAN NOT NULL DEFAULT false,
  generated_by    TEXT DEFAULT 'content-agent',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE content_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view published content" ON content_queue
  FOR SELECT USING (published = true);
CREATE POLICY "Service role can manage content" ON content_queue
  FOR ALL USING (auth.role() = 'service_role');

-- ══════════════════════════════════════════════════════════════════
-- 10. REALTIME — Enable for key tables
-- ══════════════════════════════════════════════════════════════════
ALTER PUBLICATION supabase_realtime ADD TABLE fare_reports;
ALTER PUBLICATION supabase_realtime ADD TABLE traffic_updates;
ALTER PUBLICATION supabase_realtime ADD TABLE feed_posts;
ALTER PUBLICATION supabase_realtime ADD TABLE city_alerts;

-- ══════════════════════════════════════════════════════════════════
-- 11. SCHEDULED JOBS (pg_cron)
-- WAT = UTC+1 — adjust all times accordingly
-- ══════════════════════════════════════════════════════════════════

-- Traffic agent: every 30 mins during WAT peak hours (6am–10pm WAT = 5am–9pm UTC)
SELECT cron.schedule(
  'traffic-agent-peak',
  '*/30 5-21 * * *',
  $$SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/traffic-agent',
    headers := jsonb_build_object('X-CRON-SECRET', current_setting('app.cron_secret'),'Content-Type','application/json'),
    body := '{}'::jsonb
  );$$
);

-- Fare agent: every hour 6am–11pm WAT (5am–10pm UTC)
SELECT cron.schedule(
  'fare-agent-hourly',
  '0 5-22 * * *',
  $$SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/fare-agent',
    headers := jsonb_build_object('X-CRON-SECRET', current_setting('app.cron_secret'),'Content-Type','application/json'),
    body := '{}'::jsonb
  );$$
);

-- Alerts agent: every 2 hours
SELECT cron.schedule(
  'alerts-agent-2hr',
  '0 */2 * * *',
  $$SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/alerts-agent',
    headers := jsonb_build_object('X-CRON-SECRET', current_setting('app.cron_secret'),'Content-Type','application/json'),
    body := '{}'::jsonb
  );$$
);

-- Moderator: every 15 minutes
SELECT cron.schedule(
  'moderator-agent-15min',
  '*/15 * * * *',
  $$SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/moderator-agent',
    headers := jsonb_build_object('X-CRON-SECRET', current_setting('app.cron_secret'),'Content-Type','application/json'),
    body := '{}'::jsonb
  );$$
);

-- Content agent: daily at 8am WAT (7am UTC)
SELECT cron.schedule(
  'content-agent-daily',
  '0 7 * * *',
  $$SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/content-agent',
    headers := jsonb_build_object('X-CRON-SECRET', current_setting('app.cron_secret'),'Content-Type','application/json'),
    body := '{}'::jsonb
  );$$
);

-- Daily cleanup: 2am WAT (1am UTC)
SELECT cron.schedule(
  'daily-cleanup',
  '0 1 * * *',
  $$
    DELETE FROM traffic_updates WHERE created_at < NOW() - INTERVAL '24 hours';
    DELETE FROM city_alerts WHERE expires_at < NOW() - INTERVAL '1 hour' AND active = false;
    DELETE FROM chat_logs WHERE created_at < NOW() - INTERVAL '30 days';
  $$
);

-- ══════════════════════════════════════════════════════════════════
-- 12. SET APP CONFIG (replace with your actual values)
-- ══════════════════════════════════════════════════════════════════
-- ALTER DATABASE postgres SET app.supabase_url = 'https://YOUR_REF.supabase.co';
-- ALTER DATABASE postgres SET app.cron_secret = 'YOUR_LONG_RANDOM_SECRET';

-- Verify setup
SELECT 'Schema installed successfully ✓' AS status;
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;
SELECT jobname, schedule FROM cron.job ORDER BY jobname;
