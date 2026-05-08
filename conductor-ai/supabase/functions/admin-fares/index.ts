import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { authorize } from '../_shared/auth.ts'
import { corsHeaders, getSupabaseAdmin } from '../_shared/supabase.ts'

type FareRow = {
  id?: number
  city: string
  transport_type: string
  route_from: string
  route_to: string
  min_fare: number
  max_fare: number
  verified?: boolean
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })

  const auth = await authorize(req)
  if (!auth || auth.kind !== 'admin') {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    })
  }

  const supabase = getSupabaseAdmin()

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('fare_index')
        .select('id, city, transport_type, route_from, route_to, min_fare, max_fare, verified, updated_at')
        .order('city', { ascending: true })
        .order('transport_type', { ascending: true })
        .order('route_from', { ascending: true })
        .limit(500)
      if (error) throw error
      return new Response(JSON.stringify({ fares: data || [] }), {
        headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      })
    }

    if (req.method === 'POST') {
      const body = await req.json().catch(() => null)
      const rows = (body?.fares || []) as FareRow[]
      if (!Array.isArray(rows) || rows.length === 0) {
        return new Response(JSON.stringify({ error: 'Invalid payload' }), {
          status: 400,
          headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
        })
      }

      const upserts = rows.slice(0, 500).map((r) => ({
        city: r.city,
        transport_type: r.transport_type,
        route_from: r.route_from,
        route_to: r.route_to,
        min_fare: Math.max(1, Math.floor(r.min_fare)),
        max_fare: Math.max(1, Math.floor(r.max_fare)),
        verified: r.verified ?? true,
        updated_at: new Date().toISOString(),
      }))

      const { data, error } = await supabase
        .from('fare_index')
        .upsert(upserts, { onConflict: 'city,transport_type,route_from,route_to' })
        .select('id, city, transport_type, route_from, route_to, min_fare, max_fare, verified, updated_at')

      if (error) throw error

      return new Response(JSON.stringify({ updated: data?.length ?? 0, fares: data || [] }), {
        headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || 'Server error' }), {
      status: 500,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    })
  }
})

