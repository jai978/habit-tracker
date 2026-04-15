import StarRating from './StarRating.jsx'
import NoteField from './NoteField.jsx'

export default function HabitRatingRow({ habit, rating, note, onRatingChange, onNoteChange }) {
  return (
    <div className="py-4 border-b border-gray-100 last:border-0">
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm font-medium text-gray-800 min-w-0 truncate">{habit.name}</span>
        <StarRating value={rating} onChange={onRatingChange} />
      </div>
      <NoteField value={note} onChange={onNoteChange} />
    </div>
  )
}
