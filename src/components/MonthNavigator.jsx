import { getMonthLabel } from '../utils/dates.js'

export default function MonthNavigator({ year, month, onPrev, onNext, onReset, isCurrentMonth }) {
  return (
    <div className="flex items-center gap-2 mb-6">
      <button
        onClick={onPrev}
        className="p-1.5 text-gray-400 hover:text-gray-700 rounded hover:bg-gray-100 transition-colors"
        aria-label="Previous month"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      <span className="text-sm font-medium text-gray-700 min-w-28 text-center">
        {getMonthLabel(year, month)}
      </span>

      <button
        onClick={onNext}
        disabled={isCurrentMonth}
        className="p-1.5 text-gray-400 hover:text-gray-700 rounded hover:bg-gray-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        aria-label="Next month"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {!isCurrentMonth && (
        <button
          onClick={onReset}
          className="ml-1 text-xs text-indigo-500 hover:text-indigo-700 font-medium"
        >
          Today
        </button>
      )}
    </div>
  )
}
