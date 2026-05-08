import { getSupabaseAdmin } from './supabase.ts'

export type AuthContext =
  | { kind: 'cron' }
  | { kind: 'admin'; user: { id: string; email: string | null } }

function parseList(name: string): string[] {
  const raw = (Deno.env.get(name) || '').trim()
  if (!raw) return []
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

function getBearerToken(req: Request): string | null {
  const h = req.headers.get('authorization') || ''
  const m = h.match(/^Bearer\s+(.+)$/i)
  return m ? m[1].trim() : null
}

export async function authorize(req: Request): Promise<AuthContext | null> {
  const cronSecret = (Deno.env.get('CRON_SECRET') || '').trim()
  const reqCron = (req.headers.get('x-cron-secret') || '').trim()
  if (cronSecret && reqCron && reqCron === cronSecret) return { kind: 'cron' }

  const token = getBearerToken(req)
  if (!token) return null

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data?.user) return null

  const email = data.user.email ?? null
  const adminEmails = parseList('ADMIN_EMAILS').map((e) => e.toLowerCase())
  const adminUserIds = parseList('ADMIN_USER_IDS')
  const isAdmin =
    (email && adminEmails.includes(email.toLowerCase())) || adminUserIds.includes(data.user.id)

  if (!isAdmin) return null
  return { kind: 'admin', user: { id: data.user.id, email } }
}

