/**
 * Vercel Serverless Function — receives inbound email webhook from Resend.
 * Parses the reply text and writes habit log entries to Supabase.
 *
 * Resend inbound webhook POST body (JSON):
 *   { from, to, subject, text, html, ... }
 */
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

/**
 * Extracts only the user's new reply text, stripping quoted history.
 * Looks for the first line that starts with '>' or '---' or 'On ... wrote:'.
 */
function extractReplyText(text) {
  const lines = text.split('\n')
  const quoteMarkers = [/^>/, /^---/, /^On .+ wrote:$/i, /^_{5,}/, /^-{5,}/]
  const cutoff = lines.findIndex(line =>
    quoteMarkers.some(rx => rx.test(line.trim()))
  )
  return (cutoff === -1 ? lines : lines.slice(0, cutoff))
    .join('\n')
    .trim()
}

/**
 * Parses reply text into an array of { name, stars, note }.
 * Accepts lines like:
 *   Exercise: 4
 *   Exercise: 4 | went for a run
 *   exercise:4|went for a run   (flexible whitespace/case)
 */
function parseReply(text) {
  const results = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) continue

    // Match: "HabitName: rating" or "HabitName: rating | note"
    const match = line.match(/^(.+?)\s*:\s*(\d)\s*(?:\|\s*(.+))?$/)
    if (!match) continue

    const [, name, starsStr, note] = match
    const stars = parseInt(starsStr, 10)
    if (stars < 0 || stars > 5) continue

    results.push({ name: name.trim(), stars, note: note?.trim() ?? '' })
  }
  return results
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { text, subject } = req.body

  if (!text) {
    return res.status(400).json({ error: 'No text body in request' })
  }

  // Extract the date from the subject line, or fall back to today
  const dateMatch = subject?.match(/(\d{4}-\d{2}-\d{2})/)
  let date
  if (dateMatch) {
    date = dateMatch[1]
  } else {
    // Use Auckland date
    date = new Date().toLocaleDateString('en-CA', {
      timeZone: process.env.TIMEZONE || 'Pacific/Auckland',
    })
  }

  const replyText = extractReplyText(text)
  const parsed = parseReply(replyText)

  if (parsed.length === 0) {
    return res.status(200).json({ message: 'No habit ratings found in reply' })
  }

  // Fetch habits to map name → id (case-insensitive)
  const { data: habits, error: fetchError } = await supabase
    .from('habits')
    .select('id, name')

  if (fetchError) {
    console.error('Supabase fetch error:', fetchError)
    return res.status(500).json({ error: 'Failed to fetch habits' })
  }

  const habitMap = new Map(habits.map(h => [h.name.toLowerCase(), h.id]))

  const rows = []
  const unmatched = []

  for (const { name, stars, note } of parsed) {
    const habitId = habitMap.get(name.toLowerCase())
    if (!habitId) {
      unmatched.push(name)
      continue
    }
    rows.push({ date, habit_id: habitId, stars, note: note || null })
  }

  if (rows.length === 0) {
    return res.status(200).json({
      message: 'No matching habits found',
      unmatched,
    })
  }

  const { error: upsertError } = await supabase
    .from('habit_logs')
    .upsert(rows, { onConflict: 'date,habit_id' })

  if (upsertError) {
    console.error('Supabase upsert error:', upsertError)
    return res.status(500).json({ error: 'Failed to save logs' })
  }

  console.log(`Saved ${rows.length} habit log(s) for ${date}`, { unmatched })

  return res.status(200).json({
    message: `Saved ${rows.length} habit(s) for ${date}`,
    saved: rows.map(r => r.habit_id),
    unmatched,
  })
}
