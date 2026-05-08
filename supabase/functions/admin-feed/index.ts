import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { authorize } from '../_shared/auth.ts'
import { corsHeaders, getSupabaseAdmin } from '../_shared/supabase.ts'

type ListBody = {
  action: 'list'
  q?: string
  city?: string
  type?: string
  moderated?: boolean
  limit?: number
}

type UpdateBody = {
  id: number
  moderated?: boolean
  removed?: boolean
  flagged?: boolean
  moderation_reason?: string | null
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
      const url = new URL(req.url)
      const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '100', 10)))
      const city = (url.searchParams.get('city') || '').trim()
      const type = (url.searchParams.get('type') || '').trim()
      const q = (url.searchParams.get('q') || '').trim()
      const moderated = url.searchParams.get('moderated')
      const isModerated = moderated === null ? null : moderated === 'true'

      let query = supabase
        .from('feed_posts')
        .select('id, content, city, type, username, user_id, moderated, removed, flagged, moderation_reason, created_at')
        .order('created_at', { ascending: false })
        .limit(limit)

      if (city && city !== 'all') query = query.eq('city', city)
      if (type && type !== 'all') query = query.eq('type', type)
      if (q) query = query.ilike('content', `%${q}%`)
      if (isModerated !== null) query = query.eq('moderated', isModerated)

      const { data, error } = await query
      if (error) throw error
      return new Response(JSON.stringify({ posts: data || [] }), {
        headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      })
    }

    if (req.method === 'POST') {
      const body = (await req.json().catch(() => null)) as (ListBody | UpdateBody) | null
      if (!body) {
        return new Response(JSON.stringify({ error: 'Invalid payload' }), {
          status: 400,
          headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
        })
      }

      if ((body as ListBody).action === 'list') {
        const b = body as ListBody
        const limit = Math.min(200, Math.max(1, Math.floor(b.limit ?? 100)))
        const city = (b.city || '').trim()
        const type = (b.type || '').trim()
        const q = (b.q || '').trim()
        const isModerated = typeof b.moderated === 'boolean' ? b.moderated : null

        let query = supabase
          .from('feed_posts')
          .select('id, content, city, type, username, user_id, moderated, removed, flagged, moderation_reason, created_at')
          .order('created_at', { ascending: false })
          .limit(limit)

        if (city && city !== 'all') query = query.eq('city', city)
        if (type && type !== 'all') query = query.eq('type', type)
        if (q) query = query.ilike('content', `%${q}%`)
        if (isModerated !== null) query = query.eq('moderated', isModerated)

        const { data, error } = await query
        if (error) throw error
        return new Response(JSON.stringify({ posts: data || [] }), {
          headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
        })
      }

      const b = body as UpdateBody
      if (typeof b.id !== 'number') {
        return new Response(JSON.stringify({ error: 'Invalid payload' }), {
          status: 400,
          headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
        })
      }

      const patch: Record<string, unknown> = {}
      if (typeof b.moderated === 'boolean') patch.moderated = b.moderated
      if (typeof b.removed === 'boolean') patch.removed = b.removed
      if (typeof b.flagged === 'boolean') patch.flagged = b.flagged
      if (typeof b.moderation_reason === 'string') patch.moderation_reason = b.moderation_reason.slice(0, 200)
      if (b.moderation_reason === null) patch.moderation_reason = null

      const { data, error } = await supabase
        .from('feed_posts')
        .update(patch)
        .eq('id', b.id)
        .select('id, content, city, type, username, user_id, moderated, removed, flagged, moderation_reason, created_at')
        .single()

      if (error) throw error
      return new Response(JSON.stringify({ post: data }), {
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

