/**
 * Vercel Serverless Function — triggered daily by Vercel Cron (see vercel.json).
 * Fetches today's habits from Supabase and emails a check-in form via Resend.
 */
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const resend = new Resend(process.env.RESEND_API_KEY)

export default async function handler(req, res) {
  // Allow manual trigger via GET, but only Vercel Cron sends the auth header in production
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Protect against random web requests in production
  const authHeader = req.headers.authorization
  if (process.env.NODE_ENV === 'production' && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
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
    return res.status(200).json({ message: 'No habits to check in' })
  }

  const today = new Date().toLocaleDateString('en-NZ', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    timeZone: process.env.TIMEZONE || 'Pacific/Auckland',
  })

  const habitLines = habits.map(h => `${h.name}: `).join('\n')

  const textBody = `Hi! How did today go?

Reply with a rating (0–5) for each habit. Add a note after a pipe | if you like.

${habitLines}

---
Format: HabitName: rating
        HabitName: rating | optional note

Example:
Exercise: 4 | morning run
Water: 5
Sleep: 3 | went to bed late

Ratings: 0 = skipped, 1–2 = poor, 3 = okay, 4 = good, 5 = great
`

  const htmlBody = `
<p>Hi! How did today go?</p>
<p>Reply with a rating (0–5) for each habit. Add a note after a <code>|</code> if you like.</p>
<pre style="font-family:monospace;background:#f4f4f4;padding:12px;border-radius:4px;line-height:1.8">${habitLines}</pre>
<hr/>
<p style="color:#666;font-size:13px">
  Format: <code>HabitName: rating</code> or <code>HabitName: rating | note</code><br/>
  Example: <code>Exercise: 4 | morning run</code><br/>
  Ratings: 0 = skipped &nbsp; 1–2 = poor &nbsp; 3 = okay &nbsp; 4 = good &nbsp; 5 = great
</p>
`

  const { error: sendError } = await resend.emails.send({
    from: process.env.FROM_EMAIL,
    to: process.env.TO_EMAIL,
    subject: `Habit check-in — ${today}`,
    text: textBody,
    html: htmlBody,
    replyTo: process.env.INBOUND_EMAIL,
  })

  if (sendError) {
    console.error('Resend error:', sendError)
    return res.status(500).json({ error: 'Failed to send email' })
  }

  return res.status(200).json({ message: `Check-in email sent for ${today}` })
}
