import { authorize } from './auth.ts'
import { corsHeaders } from './supabase.ts'
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/assert_equals.ts'
import { assert } from 'https://deno.land/std@0.224.0/assert/assert.ts'

Deno.test('authorize allows cron secret', async () => {
  Deno.env.set('CRON_SECRET', 'secret123')
  const req = new Request('https://example.com', { headers: { 'x-cron-secret': 'secret123' } })
  const res = await authorize(req)
  assert(res && res.kind === 'cron')
})

Deno.test('corsHeaders only allows configured origins', () => {
  Deno.env.set('ALLOWED_ORIGINS', 'https://a.example,https://b.example')
  const okReq = new Request('https://example.com', { headers: { origin: 'https://a.example' } })
  const badReq = new Request('https://example.com', { headers: { origin: 'https://c.example' } })
  const ok = corsHeaders(okReq)
  const bad = corsHeaders(badReq)
  assertEquals(ok['Access-Control-Allow-Origin'], 'https://a.example')
  assertEquals(bad['Access-Control-Allow-Origin'], undefined)
})

