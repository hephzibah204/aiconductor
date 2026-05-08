import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { authorize } from '../_shared/auth.ts'
import { corsHeaders, getSupabaseAdmin } from '../_shared/supabase.ts'

type PublishBody = { id: number; published: boolean }

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
      const published = url.searchParams.get('published')
      const isPublished = published === null ? null : published === 'true'

      let q = supabase
        .from('content_queue')
        .select('id, type, city, title, body, cta, emoji, published, generated_by, created_at')
        .order('created_at', { ascending: false })
        .limit(200)

      if (isPublished !== null) q = q.eq('published', isPublished)

      const { data, error } = await q
      if (error) throw error
      return new Response(JSON.stringify({ content: data || [] }), {
        headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      })
    }

    if (req.method === 'POST') {
      const body = (await req.json().catch(() => null)) as PublishBody | null
      if (!body || typeof body.id !== 'number' || typeof body.published !== 'boolean') {
        return new Response(JSON.stringify({ error: 'Invalid payload' }), {
          status: 400,
          headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
        })
      }

      const { data, error } = await supabase
        .from('content_queue')
        .update({ published: body.published })
        .eq('id', body.id)
        .select('id, type, city, title, body, cta, emoji, published, generated_by, created_at')
        .single()

      if (error) throw error

      return new Response(JSON.stringify({ item: data }), {
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

