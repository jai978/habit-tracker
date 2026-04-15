export default function StarRating({ value, onChange }) {
  return (
    <div className="flex gap-1.5" role="group" aria-label="Rating">
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(value === n ? 0 : n)}
          aria-label={`Rate ${n}`}
          className={`w-7 h-7 rounded-full border-2 transition-all ${
            n <= value
              ? 'bg-indigo-500 border-indigo-500'
              : 'bg-white border-gray-300 hover:border-indigo-400'
          }`}
        />
      ))}
    </div>
  )
}
