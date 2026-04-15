/**
 * Saves all habit ratings for a given date in one request.
 * POST /api/submit
 * Body: { date: "2026-04-16", ratings: [{ habit_id, stars }] }
 */
import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Missing Supabase environment variables.' })
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  const { date, ratings } = req.body

  if (!date || !Array.isArray(ratings) || ratings.length === 0) {
    return res.status(400).json({ error: 'Missing date or ratings' })
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'Invalid date format' })
  }

  const invalid = ratings.find(r =>
    !r.habit_id ||
    !Number.isInteger(r.stars) ||
    r.stars < 0 ||
    r.stars > 5
  )
  if (invalid) {
    return res.status(400).json({ error: 'Invalid rating value' })
  }

  const rows = ratings.map(({ habit_id, stars }) => ({
    date,
    habit_id,
    stars,
    note: null,
  }))

  const { error } = await supabase
    .from('habit_logs')
    .upsert(rows, { onConflict: 'date,habit_id' })

  if (error) {
    console.error('Supabase error:', error)
    return res.status(500).json({ error: 'Failed to save' })
  }

  return res.status(200).json({ message: `Saved ${rows.length} habits for ${date}` })
}
