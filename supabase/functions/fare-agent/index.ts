// Conductor AI — Fare Agent Edge Function
// Updates the fare index across all Nigerian cities and transport types
// Scheduled via pg_cron every hour

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { callOpenRouter, parseJSON, MODELS } from '../_shared/openrouter.ts'
import { getSupabaseAdmin, corsHeaders } from '../_shared/supabase.ts'
import { authorize } from '../_shared/auth.ts'

const SYSTEM_PROMPT = `You are the Conductor AI Fare Agent tracking Nigerian transport fares.
Monitor fare changes for Danfo, Keke, Okada, BRT, and Uber in Lagos, Abuja, Port Harcourt, and Kano.
Consider: fuel price changes, time of day, weather, traffic, holidays, events.

Output ONLY valid JSON (no preamble, no markdown):
{
  "updates": [
    {
      "city": "Lagos",
      "transport": "danfo|keke|okada|uber|brt",
      "route_from": "Oshodi",
      "route_to": "CMS",
      "old_fare": 300,
      "new_fare": 400,
      "change_pct": 33,
      "reason": "Brief reason in local Nigerian context",
      "surge": false,
      "valid_hours": 4
    }
  ],
  "summary": "One sentence summary of overall fare situation"
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

    // Fetch current fare index for context
    const { data: currentFares } = await supabase
      .from('fare_index')
      .select('city, transport_type, route_from, route_to, min_fare, max_fare')
      .limit(20)

    const fareContext = currentFares
      ? `Current fares for context: ${JSON.stringify(currentFares.slice(0, 5))}`
      : 'No current fare data available.'

    const userPrompt = `Check fare levels across Nigerian cities now. ${fareContext}
Generate 3-5 fare updates reflecting current conditions (fuel prices, traffic, time of day).`

    const raw = await callOpenRouter(MODELS.gemma, SYSTEM_PROMPT, userPrompt)
    const parsed = parseJSON(raw)
    const updates = parsed.updates || []

    // Upsert fare changes into fare_reports
    for (const u of updates) {
      await supabase.from('fare_reports').insert({
        city: u.city,
        transport_type: u.transport,
        route_from: u.route_from,
        route_to: u.route_to,
        fare_amount: u.new_fare,
        notes: u.reason,
        is_surge: u.surge || false,
        submitted_by: 'fare-agent-v1',
        verified: true,
      })
    }

    return new Response(
      JSON.stringify({ success: true, count: updates.length, summary: parsed.summary }),
      { headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('[fare-agent]', err)
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } }
    )
  }
})
