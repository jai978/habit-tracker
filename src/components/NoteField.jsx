import { useState } from 'react'

export default function NoteField({ value, onChange }) {
  const [expanded, setExpanded] = useState(false)

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="text-xs text-indigo-500 hover:text-indigo-700 mt-1"
      >
        {value ? 'Edit note' : '+ Add note'}
      </button>
    )
  }

  return (
    <div className="mt-1 flex gap-2 items-center">
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Add a note…"
        autoFocus
        className="flex-1 text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400"
      />
      <button
        type="button"
        onClick={() => setExpanded(false)}
        className="text-xs text-gray-400 hover:text-gray-600"
      >
        Done
      </button>
    </div>
  )
}
