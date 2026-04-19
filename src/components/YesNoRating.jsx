export default function YesNoRating({ value, onChange }) {
  // value: 0=unset, 1=No, 5=Yes
  return (
    <div className="flex gap-2" role="group" aria-label="Yes or No">
      <button
        type="button"
        onClick={() => onChange(value === 5 ? 0 : 5)}
        className={`px-3 py-1 rounded-md text-sm font-medium border-2 transition-all ${
          value === 5
            ? 'bg-green-500 text-white border-green-500'
            : 'bg-white text-gray-500 border-gray-300 hover:border-green-400'
        }`}
      >
        Yes
      </button>
      <button
        type="button"
        onClick={() => onChange(value === 1 ? 0 : 1)}
        className={`px-3 py-1 rounded-md text-sm font-medium border-2 transition-all ${
          value === 1
            ? 'bg-red-400 text-white border-red-400'
            : 'bg-white text-gray-500 border-gray-300 hover:border-red-400'
        }`}
      >
        No
      </button>
    </div>
  )
}
