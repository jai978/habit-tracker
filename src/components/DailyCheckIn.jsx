import { useState, useEffect } from 'react'
import { useHabitContext } from '../context/HabitContext.jsx'
import { getTodayISO, formatDisplay } from '../utils/dates.js'
import { calculateStreak } from '../utils/streaks.js'
import HabitRatingRow from './HabitRatingRow.jsx'

export default function DailyCheckIn({ onManage }) {
  const { habits, logs, getLogForDate, saveDay } = useHabitContext()
  const today = getTodayISO()
  const [dayRatings, setDayRatings] = useState({})
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const existing = getLogForDate(today)
    const initial = {}
    habits.forEach(h => {
      initial[h.id] = existing[h.id] || { rating: 0, note: '' }
    })
    setDayRatings(initial)
  }, [habits]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleRatingChange(id, rating) {
    setDayRatings(prev => ({ ...prev, [id]: { ...prev[id], rating } }))
  }

  function handleNoteChange(id, note) {
    setDayRatings(prev => ({ ...prev, [id]: { ...prev[id], note } }))
  }

  function handleSave() {
    saveDay(today, dayRatings)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (habits.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4">
        <div className="bg-white border border-gray-200 rounded-lg p-10 text-center">
          <p className="text-gray-500 mb-4">No habits yet. Add some to get started.</p>
          <button
            onClick={onManage}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-md transition-colors"
          >
            Manage Habits
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4">
      <h1 className="text-xl font-semibold text-gray-900 mb-6">{formatDisplay(today)}</h1>
      <div className="bg-white border border-gray-200 rounded-lg px-6">
        {habits.map(habit => (
          <HabitRatingRow
            key={habit.id}
            habit={habit}
            rating={dayRatings[habit.id]?.rating ?? 0}
            note={dayRatings[habit.id]?.note ?? ''}
            streak={calculateStreak(habit.id, logs)}
            onRatingChange={r => handleRatingChange(habit.id, r)}
            onNoteChange={n => handleNoteChange(habit.id, n)}
          />
        ))}
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={handleSave}
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-5 py-2 rounded-md transition-colors"
        >
          Save
        </button>
        {saved && (
          <span className="text-sm text-green-600 font-medium">Saved!</span>
        )}
      </div>
    </div>
  )
}
