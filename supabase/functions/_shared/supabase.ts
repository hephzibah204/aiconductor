// Conductor AI — Shared Supabase Admin Client
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export function getSupabaseAdmin() {
  const url = Deno.env.get('SUPABASE_URL')!
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  return createClient(url, key, {
    auth: { persistSession: false },
  })
}

function parseAllowedOrigins(): string[] {
  const raw = (Deno.env.get('ALLOWED_ORIGINS') || '').trim()
  if (!raw) return []
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

function pickOrigin(req?: Request): string | null {
  if (!req) return null
  const origin = req.headers.get('origin')
  if (!origin) return null
  const allowed = parseAllowedOrigins()
  if (allowed.length === 0) return null
  return allowed.includes(origin) ? origin : null
}

export function corsHeaders(req?: Request) {
  const origin = pickOrigin(req)
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  }
  if (origin) headers['Access-Control-Allow-Origin'] = origin
  return headers
}
