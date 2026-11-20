// RCSU Student Union Election 2026-2027
// Backend author: Reinhardson Sangma
// Privileged operations are available only after Supabase Auth + election_private.admins validation.
import { createClient } from 'npm:@supabase/supabase-js@2.119.2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
})
const required = (name: string) => {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`Server configuration missing: ${name}`)
  return value
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)
  try {
    const authHeader = req.headers.get('Authorization') || ''
    const bearer = authHeader.replace(/^Bearer\s+/i, '')
    if (!bearer || bearer === authHeader) return json({ error: 'Administrator sign-in required.' }, 401)

    const supabaseUrl = required('SUPABASE_URL')
    const publishable = Deno.env.get('SUPABASE_ANON_KEY') ||
      JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '{}').default
    const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ||
      JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}').default
    if (!publishable || !secret) throw new Error('Supabase keys are not configured in function secrets.')

    const authClient = createClient(supabaseUrl, publishable, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${bearer}` } },
    })
    const { data: authData, error: authError } = await authClient.auth.getUser(bearer)
    if (authError || !authData.user) return json({ error: 'Your admin session is invalid. Sign in again.' }, 401)

    const db = createClient(supabaseUrl, secret, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: isAdmin, error: adminError } = await db.rpc('rcsu_is_admin', { p_user_id: authData.user.id })
    if (adminError || isAdmin !== true) return json({ error: 'This account is not authorised as an election administrator.' }, 403)

    const payload = await req.json().catch(() => ({}))
    const action = String(payload.action || '')
    let data: unknown = null
    let error: { message?: string } | null = null

    switch (action) {
      case 'bootstrap': ({ data, error } = await db.rpc('rcsu_admin_bootstrap')); break
      case 'dashboard': ({ data, error } = await db.rpc('rcsu_admin_dashboard')); break
      case 'verify':
        ({ data, error } = await db.rpc('rcsu_verify_voter', {
          p_identifier: String(payload.identifier || '').slice(0, 120),
          p_confirm_name: String(payload.confirm_name || '').slice(0, 120),
          p_course: String(payload.course || '').slice(0, 80),
        }))
        break
      case 'resume':
        ({ data, error } = await db.rpc('rcsu_resume_vote', { p_ticket: String(payload.ticket || '') }))
        break
      case 'cancel':
        ({ data, error } = await db.rpc('rcsu_cancel_vote', { p_ticket: String(payload.ticket || '') }))
        break
      case 'submit':
        ({ data, error } = await db.rpc('rcsu_submit_ballot', {
          p_ticket: String(payload.ticket || ''),
          p_selections: payload.selections,
        }))
        break
      case 'candidate_save':
        ({ data, error } = await db.rpc('rcsu_admin_upsert_candidate', {
          p_id: payload.id || null,
          p_position_key: String(payload.position_key || ''),
          p_full_name: String(payload.full_name || '').slice(0, 120),
          p_photo_url: String(payload.photo_url || '').slice(0, 500),
          p_group_name: String(payload.group_name || '').slice(0, 120),
          p_active: payload.active !== false,
          p_sort_order: Number.isFinite(Number(payload.sort_order)) ? Number(payload.sort_order) : 0,
        }))
        break
      case 'settings':
        ({ data, error } = await db.rpc('rcsu_admin_set_settings', {
          p_voting_open: payload.voting_open === true,
          p_results_released: payload.results_released === true,
        }))
        break
      case 'import': {
        if (!Array.isArray(payload.rows) || payload.rows.length > 300) return json({ error: 'Upload no more than 300 voter records per batch.' }, 400)
        ({ data, error } = await db.rpc('rcsu_admin_import_voters', { p_rows: payload.rows }))
        break
      }
      case 'reset':
        ({ data, error } = await db.rpc('rcsu_admin_reset_election'))
        break
      default: return json({ error: 'Unknown election action.' }, 400)
    }
    if (error) {
      console.error('Election API database action failed:', action, error.message)
      return json({ error: error.message || 'The election request could not be completed.' }, 400)
    }
    return json({ data })
  } catch (err) {
    console.error('Election API error:', err)
    return json({ error: err instanceof Error ? err.message : 'Unexpected server error.' }, 500)
  }
})
