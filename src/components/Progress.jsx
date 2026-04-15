import { useState } from 'react'
import { useHabitContext } from '../context/HabitContext.jsx'
import CombinedHabitGrid from './CombinedHabitGrid.jsx'
import MonthNavigator from './MonthNavigator.jsx'

function getCurrentMonthYear() {
  const now = new Date()
  return { month: now.getMonth() + 1, year: now.getFullYear() }
}

export default function Progress() {
  const { habits, logs } = useHabitContext()
  const current = getCurrentMonthYear()
  const [year, setYear] = useState(current.year)
  const [month, setMonth] = useState(current.month)

  const isCurrentMonth = year === current.year && month === current.month

  function handlePrev() {
    const d = new Date(year, month - 2, 1)
    setYear(d.getFullYear())
    setMonth(d.getMonth() + 1)
  }

  function handleNext() {
    if (!isCurrentMonth) {
      const d = new Date(year, month, 1)
      setYear(d.getFullYear())
      setMonth(d.getMonth() + 1)
    }
  }

  function handleReset() {
    setYear(current.year)
    setMonth(current.month)
  }

  if (habits.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4">
        <div className="bg-white border border-gray-200 rounded-lg p-10 text-center">
          <p className="text-gray-500">No habits yet. Add some and start logging to see your progress.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4">
      <MonthNavigator
        year={year}
        month={month}
        onPrev={handlePrev}
        onNext={handleNext}
        onReset={handleReset}
        isCurrentMonth={isCurrentMonth}
      />

      <CombinedHabitGrid habits={habits} logs={logs} year={year} month={month} />

      {/* Legend */}
      <div className="mt-4 flex items-center gap-2 justify-end">
        <span className="text-xs text-gray-400">Less</span>
        {['bg-gray-100', 'bg-indigo-100', 'bg-indigo-200', 'bg-indigo-400', 'bg-indigo-500', 'bg-indigo-700'].map(cls => (
          <div key={cls} className={`w-3.5 h-3.5 rounded-sm ${cls}`} />
        ))}
        <span className="text-xs text-gray-400">More</span>
      </div>
    </div>
  )
}
