import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { authorize } from '../_shared/auth.ts'
import { corsHeaders, getSupabaseAdmin } from '../_shared/supabase.ts'

type ListBody = { action: 'list'; q?: string; city?: string; limit?: number }
type UpdateBody = { id: string; username?: string; city?: string; verified?: boolean; verification_level?: number; avatar_emoji?: string; bio?: string | null }

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
      const q = (url.searchParams.get('q') || '').trim().toLowerCase()
      const city = (url.searchParams.get('city') || '').trim()
      const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '100', 10)))

      let query = supabase
        .from('user_profiles')
        .select('id, username, city, points, reports_count, streak, verified, verification_level, avatar_emoji, created_at, updated_at')
        .order('created_at', { ascending: false })
        .limit(limit)

      if (city && city !== 'all') query = query.eq('city', city)
      if (q) query = query.ilike('username', `%${q}%`)

      const { data, error } = await query
      if (error) throw error
      return new Response(JSON.stringify({ users: data || [] }), {
        headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      })
    }

    if (req.method === 'POST') {
      const body = (await req.json().catch(() => null)) as (ListBody | UpdateBody) | null
      if (body && (body as ListBody).action === 'list') {
        const b = body as ListBody
        const q = (b.q || '').trim().toLowerCase()
        const city = (b.city || '').trim()
        const limit = Math.min(200, Math.max(1, Math.floor(b.limit ?? 100)))

        let query = supabase
          .from('user_profiles')
          .select('id, username, city, points, reports_count, streak, verified, verification_level, avatar_emoji, created_at, updated_at')
          .order('created_at', { ascending: false })
          .limit(limit)

        if (city && city !== 'all') query = query.eq('city', city)
        if (q) query = query.ilike('username', `%${q}%`)

        const { data, error } = await query
        if (error) throw error
        return new Response(JSON.stringify({ users: data || [] }), {
          headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
        })
      }

      const b = body as UpdateBody | null
      if (!b?.id) {
        return new Response(JSON.stringify({ error: 'Invalid payload' }), {
          status: 400,
          headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
        })
      }

      const patch: Record<string, unknown> = {}
      if (typeof b.username === 'string') patch.username = b.username.slice(0, 60)
      if (typeof b.city === 'string') patch.city = b.city
      if (typeof b.verified === 'boolean') patch.verified = b.verified
      if (typeof b.verification_level === 'number') patch.verification_level = Math.max(0, Math.min(10, Math.floor(b.verification_level)))
      if (typeof b.avatar_emoji === 'string') patch.avatar_emoji = b.avatar_emoji.slice(0, 8)
      if (typeof b.bio === 'string') patch.bio = b.bio.slice(0, 200)
      if (b.bio === null) patch.bio = null
      patch.updated_at = new Date().toISOString()

      const { data, error } = await supabase.from('user_profiles').update(patch).eq('id', b.id).select().single()
      if (error) throw error

      return new Response(JSON.stringify({ user: data }), {
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

