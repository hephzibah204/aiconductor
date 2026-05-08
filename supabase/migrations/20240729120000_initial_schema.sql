
-- ═══════════════════════════════════════════
-- CONDUCTOR AI · SUPABASE SCHEMA
-- ═══════════════════════════════════════════

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_cron";
CREATE EXTENSION IF NOT EXISTS "pg_net";

-- ─── FARE REPORTS ───
-- Stores crowdsourced fare data from users
CREATE TABLE fare_reports (
  id            uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  city          text NOT NULL,
  from_area     text NOT NULL,
  to_area       text NOT NULL,
  transport_mode text NOT NULL,
  fare_amount   integer NOT NULL,
  time_slot     text,
  duration_label text,
  duration_mins integer,
  travel_date   date,
  note          text,
  user_id       uuid REFERENCES auth.users(id),
  username      text,
  verified      boolean DEFAULT false,
  created_at    timestamptz DEFAULT now()
);

-- ─── TRAFFIC UPDATES ───
-- AI-generated and crowdsourced traffic data
CREATE TABLE traffic_updates (
  id          uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  city        text NOT NULL,
  level       text NOT NULL CHECK (level IN ('low', 'medium', 'high', 'severe')),
  alert       text,
  routes_affected text[],
  source      text DEFAULT 'ai',
  expires_at  timestamptz DEFAULT now() + INTERVAL '2 hours',
  created_at  timestamptz DEFAULT now()
);

-- ─── CITY ALERTS ───
-- Persistent alerts shown on homepage
CREATE TABLE city_alerts (
  id          uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  city        text NOT NULL,
  type        text,
  severity    text DEFAULT 'info',
  title       text,
  body        text,
  active      boolean DEFAULT true,
  expires_at  timestamptz,
  created_at  timestamptz DEFAULT now()
);

-- ─── FEED POSTS ───
-- Community road updates
CREATE TABLE feed_posts (
  id          bigserial PRIMARY KEY,
  content     text NOT NULL,
  city        text NOT NULL,
  type        text DEFAULT 'general',
  username    text,
  user_id     uuid REFERENCES auth.users(id),
  likes       integer DEFAULT 0,
  moderated   boolean DEFAULT false,
  approved    boolean DEFAULT true,
  created_at  timestamptz DEFAULT now()
);

-- ─── POST LIKES ───
CREATE TABLE post_likes (
  user_id   uuid REFERENCES auth.users(id),
  post_id   bigint REFERENCES feed_posts(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, post_id)
);

-- ─── FARE INDEX ───
-- Aggregated fare data per route (updated by AI agent)
CREATE TABLE fare_index (
  id              uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  city            text NOT NULL,
  from_area       text NOT NULL,
  to_area         text NOT NULL,
  transport_mode  text NOT NULL,
  avg_fare        integer,
  min_fare        integer,
  max_fare        integer,
  sample_count    integer DEFAULT 0,
  trend           text DEFAULT 'same',
  last_updated    timestamptz DEFAULT now(),
  UNIQUE(city, from_area, to_area, transport_mode)
);

-- ─── USER PROFILES ───
CREATE TABLE user_profiles (
  id           uuid REFERENCES auth.users(id) PRIMARY KEY,
  username     text,
  home_city    text DEFAULT 'Lagos',
  points       integer DEFAULT 0,
  reports_count integer DEFAULT 0,
  streak_days  integer DEFAULT 0,
  last_active  date DEFAULT CURRENT_DATE,
  created_at   timestamptz DEFAULT now()
);

-- ─── CHAT LOGS ───
CREATE TABLE chat_logs (
  id         bigserial PRIMARY KEY,
  user_id    uuid REFERENCES auth.users(id),
  message    text,
  response   text,
  created_at timestamptz DEFAULT now()
);

-- ─── AGENT RUNS LOG ───
CREATE TABLE agent_runs (
  id          bigserial PRIMARY KEY,
  agent_name  text,
  model       text,
  tokens_used integer,
  status      text,
  output      jsonb,
  created_at  timestamptz DEFAULT now()
);

-- ─── USEFUL VIEWS ───
CREATE VIEW fare_summary AS
SELECT
  city,
  from_area,
  to_area,
  transport_mode,
  ROUND(AVG(fare_amount)) AS avg_fare,
  MIN(fare_amount) AS min_fare,
  MAX(fare_amount) AS max_fare,
  COUNT(*) AS sample_count
FROM fare_reports
WHERE created_at > now() - INTERVAL '30 days'
GROUP BY city, from_area, to_area, transport_mode
ORDER BY sample_count DESC;

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, username)
  VALUES (NEW.id, SPLIT_PART(NEW.email, '@', 1));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE handle_new_user();

-- Award points on fare report
CREATE OR REPLACE FUNCTION award_report_points()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.user_id IS NOT NULL THEN
    UPDATE user_profiles
    SET
      points = points + 50,
      reports_count = reports_count + 1
    WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_fare_report_created
  AFTER INSERT ON fare_reports
  FOR EACH ROW EXECUTE PROCEDURE award_report_points();

-- Indexes for performance
CREATE INDEX idx_fare_reports_city ON fare_reports(city);
CREATE INDEX idx_fare_reports_route ON fare_reports(from_area, to_area);
CREATE INDEX idx_traffic_city ON traffic_updates(city, created_at DESC);
CREATE INDEX idx_feed_city ON feed_posts(city, created_at DESC);

-- ═══════════════════════════════════════════
-- RLS POLICIES
-- ═══════════════════════════════════════════

-- Enable RLS on all tables
ALTER TABLE fare_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE traffic_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE city_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE feed_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE fare_index ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY; -- Also protect agent logs

-- fare_reports: anyone can read, authenticated users can insert
CREATE POLICY "Public read fare_reports" ON fare_reports
  FOR SELECT USING (true);
CREATE POLICY "Auth users insert fare_reports" ON fare_reports
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- traffic_updates: public read
CREATE POLICY "Public read traffic" ON traffic_updates
  FOR SELECT USING (true);

-- city_alerts: public read active alerts
CREATE POLICY "Public read alerts" ON city_alerts
  FOR SELECT USING (active = true);

-- feed_posts: public read approved, auth users insert
CREATE POLICY "Public read feed" ON feed_posts
  FOR SELECT USING (approved = true);
CREATE POLICY "Users insert feed" ON feed_posts
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Users update own feed" ON feed_posts
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own feed" ON feed_posts
  FOR DELETE USING (auth.uid() = user_id);

-- post_likes: users manage their own likes
CREATE POLICY "Anyone can view likes" ON post_likes
  FOR SELECT USING (true);
CREATE POLICY "Authenticated users can like" ON post_likes
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can unlike" ON post_likes
  FOR DELETE USING (auth.uid() = user_id);

-- fare_index: public read
CREATE POLICY "Public read fare index" ON fare_index
  FOR SELECT USING (true);

-- user_profiles: public read, users manage own
CREATE POLICY "Users can view all profiles" ON user_profiles
  FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON user_profiles
  FOR UPDATE USING (auth.uid() = id);

-- chat_logs: users read/write own logs
CREATE POLICY "Users read/write own chats" ON chat_logs
  FOR ALL USING (auth.uid() = user_id);

-- agent_runs: service roles can do everything
CREATE POLICY "Allow full access to service_role" ON agent_runs
  FOR ALL USING (auth.role() = 'service_role');
