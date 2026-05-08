
-- ═══════════════════════════════════════════
-- CRON JOBS (pg_cron)
-- ═══════════════════════════════════════════

-- NOTE: You must set the app.supabase_url and app.cron_secret variables in your database.
-- See bottom of this file for instructions.

-- Traffic agent: every 30 minutes
SELECT cron.schedule(
  'traffic-agent-30min',
  '*/30 * * * *', -- Every 30 minutes
  $$
    SELECT net.http_post(
      url := current_setting('app.supabase_url') || '/functions/v1/traffic-agent',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
        'X-CRON-SECRET', current_setting('app.cron_secret')
      ),
      body := '{}'::jsonb
    );
  $$
);

-- Fare agent: every 2 hours
SELECT cron.schedule(
  'fare-agent-2hr',
  '0 */2 * * *', -- Every 2 hours at the start of the hour
  $$
    SELECT net.http_post(
      url := current_setting('app.supabase_url') || '/functions/v1/fare-agent',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
        'X-CRON-SECRET', current_setting('app.cron_secret')
      ),
      body := '{}'::jsonb
    );
  $$
);

-- Alert + moderation agent: every hour
SELECT cron.schedule(
  'alerts-agent-1hr',
  '0 * * * *', -- Every hour at the start of the hour
  $$
    SELECT net.http_post(
      url := current_setting('app.supabase_url') || '/functions/v1/alerts-agent',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
        'X-CRON-SECRET', current_setting('app.cron_secret')
      ),
      body := '{}'::jsonb
    );
  $$
);

-- Clean up old data: daily at 2am WAT (1am UTC)
SELECT cron.schedule(
  'daily-cleanup',
  '0 1 * * *', -- Daily at 1am UTC
  $$
    DELETE FROM traffic_updates WHERE created_at < now() - INTERVAL '24 hours';
    DELETE FROM city_alerts WHERE expires_at < now() - INTERVAL '1 hour';
    DELETE FROM chat_logs WHERE created_at < now() - INTERVAL '30 days';
  $$
);

-- ═══════════════════════════════════════════
-- CONFIGURATION (IMPORTANT)
-- Run these commands in the SQL Editor to set the required variables for cron jobs.
-- Replace the placeholder values with your actual Supabase URL, service key, and a cron secret.
-- ═══════════════════════════════════════════

/*
ALTER DATABASE postgres SET app.supabase_url = 'YOUR_SUPABASE_URL';
ALTER DATABASE postgres SET app.service_role_key = 'YOUR_SERVICE_ROLE_KEY';
ALTER DATABASE postgres SET app.cron_secret = 'A_VERY_STRONG_RANDOM_SECRET';
*/

-- To view all scheduled jobs:
-- SELECT * FROM cron.job;

-- To unschedule a job:
-- SELECT cron.unschedule('traffic-agent-30min');
