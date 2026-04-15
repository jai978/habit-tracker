import { getTodayISO, toISO } from './dates.js'

/**
 * Calculates the current streak for a single habit.
 * Rules:
 *   - A day counts if rating >= 4
 *   - A streak is only shown after 3+ consecutive qualifying days
 *   - Today is included if it has a qualifying rating; otherwise we start
 *     counting from yesterday (so the streak isn't broken mid-day)
 *
 * @param {string} habitId
 * @param {Object} logs  - { [date]: { [habitId]: { rating, stars, note } } }
 * @returns {number} streak length, or 0 if streak < 3
 */
export function calculateStreak(habitId, logs) {
  const today = getTodayISO()
  const todayRating = logs[today]?.[habitId]?.rating ?? logs[today]?.[habitId]?.stars ?? 0

  // Start from today if it qualifies, otherwise start from yesterday
  const startDate = new Date()
  if (todayRating < 4) startDate.setDate(startDate.getDate() - 1)

  let streak = 0
  const cursor = new Date(startDate)

  while (true) {
    const iso = toISO(cursor)
    const rating = logs[iso]?.[habitId]?.rating ?? logs[iso]?.[habitId]?.stars ?? 0
    if (rating >= 4) {
      streak++
      cursor.setDate(cursor.getDate() - 1)
    } else {
      break
    }
  }

  return streak >= 3 ? streak : 0
}
