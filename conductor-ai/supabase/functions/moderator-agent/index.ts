// Conductor AI — Moderator Agent Edge Function
// Reviews community feed posts for spam, scams, and inappropriate content
// Scheduled via pg_cron every 15 minutes

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { callOpenRouter, parseJSON, MODELS } from '../_shared/openrouter.ts'
import { getSupabaseAdmin, corsHeaders } from '../_shared/supabase.ts'
import { authorize } from '../_shared/auth.ts'

const SYSTEM_PROMPT = `You are the Conductor AI Moderator reviewing Nigerian transport community posts.
Flag: investment scams, "make money" schemes, spam, hate speech, misinformation, off-topic content.
Approve: genuine fare reports, traffic updates, route tips, weather alerts, safety warnings.
Be lenient with informal Pidgin English — that is the platform's natural language.

Output ONLY valid JSON (no preamble, no markdown):
{
  "reviewed": [
    {
      "post_id": 123,
      "decision": "approve|remove|flag",
      "reason": "Brief reason (max 15 words)",
      "confidence": 0.95
    }
  ],
  "stats": {
    "approved": 0,
    "removed": 0,
    "flagged": 0
  }
}`

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req) })
  }

  try {
    const auth = await authorize(req)
    if (!auth) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      })
    }

    const supabase = getSupabaseAdmin()

    // Fetch unreviewed posts from the last hour
    const { data: posts, error: fetchErr } = await supabase
      .from('feed_posts')
      .select('id, content, city, type')
      .eq('moderated', false)
      .gt('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())
      .limit(20)

    if (fetchErr) throw fetchErr
    if (!posts || posts.length === 0) {
      return new Response(
        JSON.stringify({ success: true, count: 0, message: 'No posts to moderate' }),
        { headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } }
      )
    }

    const postsForReview = posts.map(p => ({
      post_id: p.id,
      content: p.content,
      city: p.city,
      type: p.type,
    }))

    const userPrompt = `Review these community posts from a Nigerian transport app:
${JSON.stringify(postsForReview, null, 2)}

Approve legitimate transport reports. Remove scams and spam. Flag borderline content for human review.`

    const raw = await callOpenRouter(MODELS.llama, SYSTEM_PROMPT, userPrompt)
    const parsed = parseJSON(raw)
    const reviewed = parsed.reviewed || []

    // Apply moderation decisions
    for (const r of reviewed) {
      const updates: any = { moderated: true, moderation_reason: r.reason }
      if (r.decision === 'remove') updates.removed = true
      if (r.decision === 'flag') updates.flagged = true

      await supabase.from('feed_posts').update(updates).eq('id', r.post_id)
    }

    return new Response(
      JSON.stringify({ success: true, count: reviewed.length, stats: parsed.stats }),
      { headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('[moderator-agent]', err)
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } }
    )
  }
})
