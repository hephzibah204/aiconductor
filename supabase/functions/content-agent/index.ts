// Conductor AI — Content Agent Edge Function
// Generates transport tips, announcements, and educational content
// Scheduled via pg_cron daily at 8am WAT

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { callOpenRouter, parseJSON, MODELS } from '../_shared/openrouter.ts'
import { getSupabaseAdmin, corsHeaders } from '../_shared/supabase.ts'
import { authorize } from '../_shared/auth.ts'

const SYSTEM_PROMPT = `You are the Conductor AI Content Writer creating helpful transport content for Nigerian commuters.
Write naturally — use Nigerian expressions, Pidgin where appropriate, and practical local knowledge.
Content must be directly useful for Lagos, Abuja, Port Harcourt, or Kano commuters.

Types:
- tip: Practical travel advice (BRT routes, okada safety, avoiding go-slow etc)
- announcement: Platform feature update or news
- safety: Safety reminder (road safety, weather, night travel etc)

Output ONLY valid JSON (no preamble, no markdown):
{
  "content": [
    {
      "type": "tip|announcement|safety",
      "city": "Lagos|Abuja|Port Harcourt|Kano|All Cities",
      "title": "Short punchy title (max 8 words)",
      "body": "Content (max 70 words, conversational Nigerian tone)",
      "cta": "Call to action text (max 8 words)",
      "emoji": "1-2 relevant emojis"
    }
  ]
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
    const now = new Date()
    const dayOfWeek = now.toLocaleDateString('en-NG', { weekday: 'long', timeZone: 'Africa/Lagos' })

    const userPrompt = `Create 3 pieces of transport content for Nigerian commuters.
Today is ${dayOfWeek}. 
Mix types: include 2 tips and 1 safety reminder.
Make them specific to actual Nigerian routes, landmarks, and experiences.`

    const raw = await callOpenRouter(MODELS.gemma, SYSTEM_PROMPT, userPrompt)
    const parsed = parseJSON(raw)
    const items = parsed.content || []

    const inserts = items.map((c: any) => ({
      type: c.type,
      city: c.city,
      title: c.title,
      body: c.body,
      cta: c.cta || null,
      emoji: c.emoji || '🚌',
      published: false, // requires admin approval
      generated_by: 'content-agent-v1',
    }))

    if (inserts.length > 0) {
      const { error } = await supabase.from('content_queue').insert(inserts)
      if (error) throw error
    }

    return new Response(
      JSON.stringify({ success: true, count: inserts.length, items }),
      { headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('[content-agent]', err)
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } }
    )
  }
})
