import HeatmapCell from './HeatmapCell.jsx'

function toISO(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}


export default function CombinedHabitGrid({ habits, logs, year, month }) {
  const daysInMonth = new Date(year, month, 0).getDate()
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1)

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 overflow-x-auto">
      <div className="inline-flex flex-col gap-1">
        {/* Header: day numbers */}
        <div className="flex gap-0.5 items-end mb-0.5">
          <div className="w-32 shrink-0" />
          {days.map(d => (
            <div key={d} className="w-3.5 flex items-center justify-center shrink-0">
              <span className="text-[9px] text-gray-400 leading-none select-none">{d}</span>
            </div>
          ))}
        </div>

        {/* Habit rows */}
        {habits.map(habit => (
          <div key={habit.id} className="flex gap-0.5 items-center">
            <div className="w-32 shrink-0 text-xs text-gray-700 truncate pr-2 leading-none">
              {habit.name}
            </div>
            {days.map(d => {
              const iso = toISO(year, month, d)
              return (
                <HeatmapCell
                  key={d}
                  date={iso}
                  rating={logs[iso]?.[habit.id]?.rating ?? 0}
                  note={logs[iso]?.[habit.id]?.note ?? ''}
                />
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
