// Conductor AI — Traffic Agent Edge Function
// Generates real-time traffic condition reports for Nigerian cities
// Scheduled via pg_cron every 30 minutes during peak hours

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { callOpenRouter, parseJSON, MODELS } from '../_shared/openrouter.ts'
import { getSupabaseAdmin, corsHeaders } from '../_shared/supabase.ts'
import { authorize } from '../_shared/auth.ts'

const SYSTEM_PROMPT = `You are the Conductor AI Traffic Agent — an expert on Nigerian road conditions.
Monitor Lagos, Abuja, Port Harcourt, and Kano traffic in real time.
Use authentic Nigerian route names and Pidgin/local expressions where natural.

Output ONLY valid JSON in this exact format (no preamble, no markdown):
{
  "updates": [
    {
      "city": "Lagos",
      "level": "severe|medium|light",
      "alert": "Brief traffic update in Nigerian style, max 60 words",
      "routes_affected": ["Third Mainland Bridge", "Oshodi Interchange"],
      "estimated_delay_mins": 45,
      "valid_until_mins": 60
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
    const hourWAT = (now.getUTCHours() + 1) % 24 // WAT = UTC+1
    const isPeak = (hourWAT >= 7 && hourWAT <= 10) || (hourWAT >= 16 && hourWAT <= 20)

    const userPrompt = `Generate current traffic reports for all 4 Nigerian cities. 
Time: ${hourWAT}:${now.getUTCMinutes().toString().padStart(2,'0')} WAT. 
${isPeak ? 'It is PEAK RUSH HOUR — expect heavy congestion.' : 'Off-peak hours — moderate traffic.'}`

    const raw = await callOpenRouter(MODELS.llama, SYSTEM_PROMPT, userPrompt)
    const parsed = parseJSON(raw)
    const updates = parsed.updates || []

    // Delete old traffic updates (older than 2 hours)
    await supabase
      .from('traffic_updates')
      .delete()
      .lt('created_at', new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString())

    // Insert new updates
    const inserts = updates.map((u: any) => ({
      city: u.city,
      level: u.level,
      alert: u.alert,
      routes_affected: u.routes_affected || [],
      estimated_delay_mins: u.estimated_delay_mins || null,
      valid_until: new Date(Date.now() + (u.valid_until_mins || 60) * 60 * 1000).toISOString(),
      generated_by: 'traffic-agent-v1',
    }))

    const { error } = await supabase.from('traffic_updates').insert(inserts)
    if (error) throw error

    return new Response(
      JSON.stringify({ success: true, count: inserts.length, timestamp: now.toISOString() }),
      { headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('[traffic-agent]', err)
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } }
    )
  }
})
