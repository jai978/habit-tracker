import { useState } from 'react'
import { useHabitContext } from '../context/HabitContext.jsx'
import HabitListItem from './HabitListItem.jsx'

export default function ManageHabits({ onBack }) {
  const { habits, addHabit, renameHabit, deleteHabit, updateHabitType } = useHabitContext()
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState('rating')

  function handleAdd() {
    if (newName.trim()) {
      addHabit(newName.trim(), newType)
      setNewName('')
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') handleAdd()
  }

  return (
    <div className="max-w-2xl mx-auto px-4">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={onBack}
          className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Go back"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </button>
        <h1 className="text-xl font-semibold text-gray-900">Manage Habits</h1>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="New habit name…"
            className="flex-1 text-sm border border-gray-200 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-400"
          />
          <button
            onClick={handleAdd}
            disabled={!newName.trim()}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-sm font-medium px-4 py-2 rounded-md transition-colors"
          >
            Add
          </button>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-500 mr-1">Type:</span>
          <button
            type="button"
            onClick={() => setNewType('rating')}
            className={`text-xs px-2.5 py-1 rounded-md border transition-colors ${newType === 'rating' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-500 border-gray-300 hover:border-indigo-400'}`}
          >
            ★ Rating
          </button>
          <button
            type="button"
            onClick={() => setNewType('boolean')}
            className={`text-xs px-2.5 py-1 rounded-md border transition-colors ${newType === 'boolean' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-500 border-gray-300 hover:border-indigo-400'}`}
          >
            ✓ Yes/No
          </button>
        </div>
      </div>

      {habits.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-8">No habits yet. Add one above.</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg px-4">
          {habits.map(habit => (
            <HabitListItem
              key={habit.id}
              habit={habit}
              onRename={renameHabit}
              onDelete={deleteHabit}
              onChangeType={updateHabitType}
            />
          ))}
        </div>
      )}
    </div>
  )
}
