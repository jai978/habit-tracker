/**
 * Vercel Serverless Function — triggered daily by Vercel Cron (see vercel.json).
 * Fetches habits from Supabase and sends a check-in email with one-click rating links.
 */
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const resend = new Resend(process.env.RESEND_API_KEY)

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Protect against random web requests in production
  // Allow direct browser access if ?secret= query param matches CRON_SECRET
  const authHeader = req.headers.authorization
  const querySecret = req.query.secret
  const validAuth = authHeader === `Bearer ${process.env.CRON_SECRET}` || querySecret === process.env.CRON_SECRET
  if (process.env.NODE_ENV === 'production' && !validAuth) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { data: habits, error } = await supabase
    .from('habits')
    .select('id, name')
    .order('created_at')

  if (error) {
    console.error('Supabase error:', error)
    return res.status(500).json({ error: 'Failed to fetch habits' })
  }

  if (!habits || habits.length === 0) {
    return res.status(200).json({ message: 'No habits configured' })
  }

  const tz = process.env.TIMEZONE || 'Pacific/Auckland'
  const appUrl = process.env.APP_URL

  const today = new Date().toLocaleDateString('en-NZ', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: tz,
  })

  // ISO date in the configured timezone
  const date = new Date().toLocaleDateString('en-CA', { timeZone: tz })

  // Build one row of buttons per habit
  const habitRows = habits.map(habit => {
    const encodedName = encodeURIComponent(habit.name)

    const buttons = [0, 1, 2, 3, 4, 5].map(stars => {
      const url = `${appUrl}/api/log?habit_id=${habit.id}&stars=${stars}&date=${date}&name=${encodedName}`
      const label = stars === 0 ? 'Skip' : '★'.repeat(stars)
      const bg = stars === 0 ? '#374151' : '#1d4ed8'
      return `<a href="${url}" style="display:inline-block;margin:0 4px;padding:8px 14px;background:${bg};color:#fff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600">${label}</a>`
    }).join('')

    return `
      <tr>
        <td style="padding:14px 0 6px;color:#f9fafb;font-size:16px;font-weight:600">${habit.name}</td>
      </tr>
      <tr>
        <td style="padding-bottom:20px">${buttons}</td>
      </tr>`
  }).join('')

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#111827;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#111827;padding:40px 0">
    <tr>
      <td align="center">
        <table width="520" cellpadding="0" cellspacing="0" style="background:#1f2937;border-radius:12px;padding:32px 40px;max-width:520px;width:90%">
          <tr>
            <td style="color:#9ca3af;font-size:13px;padding-bottom:4px">DAILY CHECK-IN</td>
          </tr>
          <tr>
            <td style="color:#f9fafb;font-size:22px;font-weight:700;padding-bottom:24px;border-bottom:1px solid #374151">${today}</td>
          </tr>
          <tr>
            <td style="padding-top:8px">
              <table width="100%" cellpadding="0" cellspacing="0">
                ${habitRows}
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding-top:16px;border-top:1px solid #374151">
              <p style="color:#6b7280;font-size:12px;margin:12px 0 0">
                ★ = 1 poor &nbsp;·&nbsp; ★★ = 2 &nbsp;·&nbsp; ★★★ = 3 okay &nbsp;·&nbsp; ★★★★ = 4 good &nbsp;·&nbsp; ★★★★★ = 5 great
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  const text = habits.map(habit => {
    const links = [0,1,2,3,4,5].map(stars => {
      const label = stars === 0 ? 'Skip' : `${stars}★`
      const url = `${appUrl}/api/log?habit_id=${habit.id}&stars=${stars}&date=${date}&name=${encodeURIComponent(habit.name)}`
      return `  ${label}: ${url}`
    }).join('\n')
    return `${habit.name}\n${links}`
  }).join('\n\n')

  const { error: sendError } = await resend.emails.send({
    from: process.env.FROM_EMAIL,
    to: process.env.TO_EMAIL,
    subject: `Habit check-in — ${today}`,
    html,
    text,
  })

  if (sendError) {
    console.error('Resend error:', sendError)
    return res.status(500).json({ error: 'Failed to send email' })
  }

  return res.status(200).json({ message: `Check-in email sent for ${today}` })
}
