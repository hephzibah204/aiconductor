import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { callOpenRouterMessages } from '../_shared/openrouter.ts'
import { corsHeaders, getSupabaseAdmin } from '../_shared/supabase.ts'

type Msg = { role: 'user' | 'assistant'; content: string }

function getBearerToken(req: Request): string | null {
  const h = req.headers.get('authorization') || ''
  const m = h.match(/^Bearer\s+(.+)$/i)
  return m ? m[1].trim() : null
}

const SYSTEM = `You are "Conductor AI" — a witty Nigerian transport fare assistant. Speak Pidgin/English mix.
Be concise and practical.
If you estimate fares, show ranges and explain assumptions briefly.
If the user is reporting a fare, ask only the minimum follow-up questions needed.
Avoid unsafe advice.`

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    })
  }

  try {
    const token = getBearerToken(req)
    if (!token) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      })
    }

    const supabase = getSupabaseAdmin()
    const { data: userData, error: userErr } = await supabase.auth.getUser(token)
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json().catch(() => null)
    const messages = (body?.messages || []) as Msg[]
    const sessionId = (body?.session_id || crypto.randomUUID()) as string
    const city = typeof body?.city === 'string' ? body.city : null
    const maxTokens = typeof body?.max_tokens === 'number' ? body.max_tokens : 600
    const model = (Deno.env.get('CHAT_MODEL') || 'meta-llama/llama-3.1-8b-instruct:free').trim()

    const trimmed = messages
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .slice(-12)
      .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }))

    if (trimmed.length === 0 || trimmed[trimmed.length - 1].role !== 'user') {
      return new Response(JSON.stringify({ error: 'Invalid messages' }), {
        status: 400,
        headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      })
    }

    const sys = city ? `${SYSTEM}\nUser city context: ${city}` : SYSTEM
    const promptMessages = [{ role: 'system' as const, content: sys }, ...trimmed]
    const reply = await callOpenRouterMessages(model, promptMessages, maxTokens)

    const userId = userData.user.id
    const userMsg = trimmed[trimmed.length - 1]
    await supabase.from('chat_logs').insert([
      { user_id: userId, session_id: sessionId, role: 'user', content: userMsg.content, city },
      { user_id: userId, session_id: sessionId, role: 'assistant', content: reply, city },
    ])

    return new Response(JSON.stringify({ reply, session_id: sessionId }), {
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || 'Server error' }), {
      status: 500,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    })
  }
})

