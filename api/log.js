/**
 * Vercel Serverless Function — saves a single habit rating.
 * Called when the user clicks a star link in the daily email.
 *
 * GET /api/log?habit_id=xxx&stars=4&date=2026-04-15&name=Exercise
 */
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const STAR_LABELS = ['Skipped', 'Poor', 'Poor', 'Okay', 'Good', 'Great']
const STAR_EMOJIS = ['—', '★', '★★', '★★★', '★★★★', '★★★★★']

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).send('Method not allowed')
  }

  const { habit_id, stars: starsStr, date, name } = req.query

  // Validate
  if (!habit_id || !starsStr || !date) {
    return res.status(400).send(page('Missing parameters', 'The link is missing required information.', '#ef4444'))
  }

  const stars = parseInt(starsStr, 10)
  if (isNaN(stars) || stars < 0 || stars > 5) {
    return res.status(400).send(page('Invalid rating', 'Stars must be between 0 and 5.', '#ef4444'))
  }

  const dateRegex = /^\d{4}-\d{2}-\d{2}$/
  if (!dateRegex.test(date)) {
    return res.status(400).send(page('Invalid date', 'The date format is invalid.', '#ef4444'))
  }

  const { error } = await supabase
    .from('habit_logs')
    .upsert({ habit_id, date, stars, note: null }, { onConflict: 'date,habit_id' })

  if (error) {
    console.error('Supabase error:', error)
    return res.status(500).send(page('Error', 'Could not save your rating. Please try again.', '#ef4444'))
  }

  const habitName = name ? decodeURIComponent(name) : 'Habit'
  const label = STAR_LABELS[stars]
  const emoji = STAR_EMOJIS[stars]

  return res.status(200).send(
    page(
      `${habitName} logged`,
      `${emoji} ${label} — saved for ${formatDate(date)}`,
      '#22c55e'
    )
  )
}

function formatDate(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-NZ', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })
}

function page(title, message, color) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${title}</title>
  <style>
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
           background: #111827; display: flex; align-items: center; justify-content: center;
           min-height: 100vh; }
    .card { background: #1f2937; border-radius: 12px; padding: 40px 48px; text-align: center;
            max-width: 360px; width: 90%; }
    .dot  { width: 48px; height: 48px; border-radius: 50%; background: ${color};
            margin: 0 auto 20px; }
    h1   { color: #f9fafb; font-size: 20px; margin: 0 0 8px; }
    p    { color: #9ca3af; font-size: 15px; margin: 0; }
  </style>
</head>
<body>
  <div class="card">
    <div class="dot"></div>
    <h1>${title}</h1>
    <p>${message}</p>
  </div>
</body>
</html>`
}
