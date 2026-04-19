import { useState } from 'react'
import ConfirmDialog from './ConfirmDialog.jsx'

export default function HabitListItem({ habit, onRename, onDelete, onChangeType }) {
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(habit.name)
  const [confirmOpen, setConfirmOpen] = useState(false)

  function handleSave() {
    if (editName.trim()) {
      onRename(habit.id, editName.trim())
    }
    setEditing(false)
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') handleSave()
    if (e.key === 'Escape') { setEditName(habit.name); setEditing(false) }
  }

  return (
    <>
      <div className="flex items-center gap-2 py-2.5 border-b border-gray-100 last:border-0">
        {editing ? (
          <>
            <input
              type="text"
              value={editName}
              onChange={e => setEditName(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
              className="flex-1 text-sm border border-indigo-400 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
            <button onClick={handleSave} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">Save</button>
            <button onClick={() => { setEditName(habit.name); setEditing(false) }} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
          </>
        ) : (
          <>
            <span className="flex-1 text-sm text-gray-800">{habit.name}</span>
            <button
              type="button"
              onClick={() => onChangeType(habit.id, habit.type === 'boolean' ? 'rating' : 'boolean')}
              title={`Switch to ${habit.type === 'boolean' ? 'star rating' : 'yes/no'}`}
              className="text-xs px-2 py-0.5 rounded border border-gray-200 text-gray-400 hover:border-indigo-400 hover:text-indigo-600 transition-colors shrink-0"
            >
              {habit.type === 'boolean' ? '✓ Yes/No' : '★ Rating'}
            </button>
            <button
              onClick={() => { setEditName(habit.name); setEditing(true) }}
              className="p-1 text-gray-400 hover:text-indigo-600 transition-colors"
              aria-label="Rename habit"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </button>
            <button
              onClick={() => setConfirmOpen(true)}
              className="p-1 text-gray-400 hover:text-red-600 transition-colors"
              aria-label="Delete habit"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </>
        )}
      </div>
      <ConfirmDialog
        open={confirmOpen}
        title="Delete habit"
        message={`Delete "${habit.name}"? All logged data for this habit will also be deleted.`}
        onConfirm={() => { setConfirmOpen(false); onDelete(habit.id) }}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  )
}
