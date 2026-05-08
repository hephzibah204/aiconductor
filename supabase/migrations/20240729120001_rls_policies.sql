
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
ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;

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
