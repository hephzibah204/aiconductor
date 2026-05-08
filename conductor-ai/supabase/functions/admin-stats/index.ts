import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { authorize } from '../_shared/auth.ts'
import { corsHeaders, getSupabaseAdmin } from '../_shared/supabase.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    })
  }

  const auth = await authorize(req)
  if (!auth || auth.kind !== 'admin') {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    })
  }

  try {
    const supabase = getSupabaseAdmin()

    const [pendingContent, activeAlerts, unmoderatedPosts, fareReportsToday, users] =
      await Promise.all([
        supabase.from('content_queue').select('*', { count: 'exact', head: true }).eq('published', false),
        supabase.from('city_alerts').select('*', { count: 'exact', head: true }).eq('active', true),
        supabase.from('feed_posts').select('*', { count: 'exact', head: true }).eq('moderated', false),
        supabase
          .from('fare_reports')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
        supabase.from('user_profiles').select('*', { count: 'exact', head: true }),
      ])

    return new Response(
      JSON.stringify({
        pending_content: pendingContent.count ?? 0,
        active_alerts: activeAlerts.count ?? 0,
        unmoderated_posts: unmoderatedPosts.count ?? 0,
        fare_reports_24h: fareReportsToday.count ?? 0,
        users_total: users.count ?? 0,
      }),
      { headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || 'Server error' }), {
      status: 500,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    })
  }
})

