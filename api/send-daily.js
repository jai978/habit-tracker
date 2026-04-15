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

  const checkinUrl = `${appUrl}/api/daily?date=${date}`
  const habitList = habits.map(h => `• ${h.name}`).join('\n')

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
            <td style="color:#f9fafb;font-size:22px;font-weight:700;padding-bottom:20px">${today}</td>
          </tr>
          <tr>
            <td style="color:#9ca3af;font-size:14px;line-height:1.8;padding-bottom:28px">
              ${habits.map(h => h.name).join('<br/>')}
            </td>
          </tr>
          <tr>
            <td>
              <a href="${checkinUrl}" style="display:inline-block;padding:14px 32px;background:#1d4ed8;color:#fff;text-decoration:none;border-radius:10px;font-size:16px;font-weight:700">
                Do Today's Check-in →
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding-top:24px;color:#4b5563;font-size:12px">
              Tap the button, rate each habit, then hit Save. Takes about 10 seconds.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  const text = `Daily habit check-in for ${today}\n\nHabits today:\n${habitList}\n\nOpen your check-in here:\n${checkinUrl}`

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
