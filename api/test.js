/**
 * Diagnostic endpoint — shows which env vars are set (not the values, just whether they exist).
 * Visit /api/test in your browser to check your configuration.
 * Delete this file once everything is working.
 */
export default function handler(req, res) {
  const vars = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'VITE_SUPABASE_URL',
    'VITE_SUPABASE_ANON_KEY',
    'RESEND_API_KEY',
    'FROM_EMAIL',
    'TO_EMAIL',
    'APP_URL',
    'TIMEZONE',
    'CRON_SECRET',
  ]

  const status = {}
  for (const v of vars) {
    status[v] = process.env[v] ? 'SET' : 'MISSING'
  }

  return res.status(200).json(status)
}
