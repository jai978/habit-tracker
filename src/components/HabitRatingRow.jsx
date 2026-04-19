import StarRating from './StarRating.jsx'
import YesNoRating from './YesNoRating.jsx'
import NoteField from './NoteField.jsx'

export default function HabitRatingRow({ habit, rating, note, streak, onRatingChange, onNoteChange }) {
  return (
    <div className="py-4 border-b border-gray-100 last:border-0">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium text-gray-800 truncate">{habit.name}</span>
          {streak >= 3 && (
            <span className="shrink-0 text-xs font-semibold text-orange-500">
              🔥 {streak}d
            </span>
          )}
        </div>
        {habit.type === 'boolean'
          ? <YesNoRating value={rating} onChange={onRatingChange} />
          : <StarRating value={rating} onChange={onRatingChange} />
        }
      </div>
      <NoteField value={note} onChange={onNoteChange} />
    </div>
  )
}
