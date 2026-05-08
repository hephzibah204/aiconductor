import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { authorize } from '../_shared/auth.ts'
import { corsHeaders, getSupabaseAdmin } from '../_shared/supabase.ts'

type CreateBody = {
  city: string
  type: string
  severity: string
  title: string
  body: string
  action?: string | null
  expires_hours?: number
}

type DeactivateBody = { id: number; active: boolean }

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
      const url = new URL(req.url)
      const active = url.searchParams.get('active')
      const isActive = active === null ? null : active === 'true'

      let q = supabase
        .from('city_alerts')
        .select('id, city, type, severity, title, body, action, active, expires_at, generated_by, created_at')
        .order('created_at', { ascending: false })
        .limit(200)

      if (isActive !== null) q = q.eq('active', isActive)

      const { data, error } = await q
      if (error) throw error
      return new Response(JSON.stringify({ alerts: data || [] }), {
        headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      })
    }

    if (req.method === 'POST') {
      const body = await req.json().catch(() => null)
      if (!body) {
        return new Response(JSON.stringify({ error: 'Invalid payload' }), {
          status: 400,
          headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
        })
      }

      if (typeof body.id === 'number' && typeof body.active === 'boolean') {
        const b = body as DeactivateBody
        const { data, error } = await supabase
          .from('city_alerts')
          .update({ active: b.active })
          .eq('id', b.id)
          .select('id, city, type, severity, title, body, action, active, expires_at, generated_by, created_at')
          .single()
        if (error) throw error
        return new Response(JSON.stringify({ alert: data }), {
          headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
        })
      }

      const b = body as CreateBody
      if (!b.city || !b.type || !b.severity || !b.title || !b.body) {
        return new Response(JSON.stringify({ error: 'Missing fields' }), {
          status: 400,
          headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
        })
      }

      const expiresHours = typeof b.expires_hours === 'number' ? Math.max(1, Math.min(24, Math.floor(b.expires_hours))) : 4
      const expiresAt = new Date(Date.now() + expiresHours * 60 * 60 * 1000).toISOString()

      const { data, error } = await supabase
        .from('city_alerts')
        .insert({
          city: b.city,
          type: b.type,
          severity: b.severity,
          title: String(b.title).slice(0, 100),
          body: String(b.body).slice(0, 500),
          action: b.action ? String(b.action).slice(0, 200) : null,
          active: true,
          expires_at: expiresAt,
          generated_by: 'admin',
        })
        .select('id, city, type, severity, title, body, action, active, expires_at, generated_by, created_at')
        .single()

      if (error) throw error
      return new Response(JSON.stringify({ alert: data }), {
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

