// Conductor AI — Alerts Agent Edge Function
// Generates city-wide emergency alerts for weather, fuel, accidents, closures
// Scheduled via pg_cron every 2 hours

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { callOpenRouter, parseJSON, MODELS } from '../_shared/openrouter.ts'
import { getSupabaseAdmin, corsHeaders } from '../_shared/supabase.ts'
import { authorize } from '../_shared/auth.ts'

const SYSTEM_PROMPT = `You are the Conductor AI Alerts Agent monitoring Nigerian cities for transport emergencies.
Generate relevant city alerts for commuters. Only generate alerts that are realistically plausible.
Types: weather (rain, flooding), fuel (scarcity, price spike), accident (major road incident), 
       closure (bridge/road closure), safety (general advisory).

Output ONLY valid JSON (no preamble, no markdown):
{
  "alerts": [
    {
      "city": "Lagos",
      "type": "weather|fuel|accident|closure|safety",
      "severity": "info|warning|critical",
      "title": "Short alert title (max 8 words)",
      "body": "Alert details in plain Nigerian context, max 80 words",
      "expires_hours": 4,
      "action": "What commuters should do (max 20 words)"
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

    // Remove expired alerts first
    await supabase
      .from('city_alerts')
      .update({ active: false })
      .lt('expires_at', new Date().toISOString())

    const userPrompt = `Generate 1-2 relevant city alerts for Nigerian commuters right now.
Only generate alerts that make contextual sense. Do not generate alerts for all cities every time.
Vary the cities and types to keep it realistic.`

    const raw = await callOpenRouter(MODELS.mistral, SYSTEM_PROMPT, userPrompt)
    const parsed = parseJSON(raw)
    const alerts = parsed.alerts || []

    const inserts = alerts.map((a: any) => ({
      city: a.city,
      type: a.type,
      severity: a.severity,
      title: a.title,
      body: a.body,
      action: a.action || null,
      active: true,
      expires_at: new Date(Date.now() + (a.expires_hours || 4) * 60 * 60 * 1000).toISOString(),
      generated_by: 'alerts-agent-v1',
    }))

    if (inserts.length > 0) {
      const { error } = await supabase.from('city_alerts').insert(inserts)
      if (error) throw error
    }

    return new Response(
      JSON.stringify({ success: true, count: inserts.length }),
      { headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('[alerts-agent]', err)
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } }
    )
  }
})
