import { formatDisplay } from '../utils/dates.js'

const RATING_LABELS = ['', '1/5', '2/5', '3/5', '4/5', '5/5']

function ratingLabel(rating, habitType) {
  if (habitType === 'boolean') {
    if (rating === 5) return 'Yes'
    if (rating === 1) return 'No'
    return null
  }
  return rating > 0 ? RATING_LABELS[rating] : null
}

export default function Tooltip({ date, rating, note, visible, habitType }) {
  if (!visible) return null
  const label = ratingLabel(rating, habitType)
  return (
    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-10 pointer-events-none">
      <div className="bg-gray-900 text-white text-xs rounded px-2.5 py-1.5 shadow-lg whitespace-nowrap min-w-max">
        <div className="font-medium">{formatDisplay(date)}</div>
        {label ? (
          <div className="text-gray-300 mt-0.5">{habitType === 'boolean' ? label : `Rating: ${label}`}</div>
        ) : (
          <div className="text-gray-500 mt-0.5">No log</div>
        )}
        {note && <div className="text-gray-400 mt-0.5 max-w-40 truncate">{note}</div>}
      </div>
      <div className="w-2 h-2 bg-gray-900 rotate-45 mx-auto -mt-1" />
    </div>
  )
}
