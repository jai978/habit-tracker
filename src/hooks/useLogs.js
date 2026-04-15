import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'

// Converts flat DB rows → { [date]: { [habitId]: { stars, note } } }
function normalize(rows) {
  const out = {}
  for (const row of rows) {
    if (!out[row.date]) out[row.date] = {}
    out[row.date][row.habit_id] = { stars: row.stars, note: row.note ?? '' }
  }
  return out
}

export function useLogs() {
  const [logs, setLogs] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('habit_logs')
      .select('date, habit_id, stars, note')
      .then(({ data, error }) => {
        if (!error && data) setLogs(normalize(data))
        setLoading(false)
      })
  }, [])

  function getLogForDate(date) {
    return logs[date] || {}
  }

  // dayLogs = { [habitId]: { stars, note } }
  async function saveDay(date, dayLogs) {
    const rows = Object.entries(dayLogs).map(([habit_id, { stars, note }]) => ({
      date,
      habit_id,
      stars,
      note: note || null,
    }))

    const { error } = await supabase
      .from('habit_logs')
      .upsert(rows, { onConflict: 'date,habit_id' })

    if (!error) setLogs(prev => ({ ...prev, [date]: dayLogs }))
  }

  async function deleteHabitLogs(habitId) {
    // Cascade delete on habits table handles DB side; clean up local state here
    setLogs(prev => {
      const cleaned = {}
      for (const [date, dayLogs] of Object.entries(prev)) {
        const { [habitId]: _removed, ...rest } = dayLogs
        if (Object.keys(rest).length > 0) cleaned[date] = rest
      }
      return cleaned
    })
  }

  return { logs, loading, getLogForDate, saveDay, deleteHabitLogs }
}
