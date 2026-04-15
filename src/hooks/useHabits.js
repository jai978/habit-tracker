import { useLocalStorage } from './useLocalStorage.js'
import { generateId } from '../utils/ids.js'
import { getTodayISO } from '../utils/dates.js'
import { HABITS_KEY } from '../utils/storage.js'

export function useHabits() {
  const [habits, setHabits] = useLocalStorage(HABITS_KEY, [])

  function addHabit(name) {
    const trimmed = name.trim()
    if (!trimmed) return
    setHabits(prev => [
      ...prev,
      { id: generateId(), name: trimmed, createdAt: getTodayISO() },
    ])
  }

  function renameHabit(id, newName) {
    const trimmed = newName.trim()
    if (!trimmed) return
    setHabits(prev => prev.map(h => h.id === id ? { ...h, name: trimmed } : h))
  }

  function deleteHabit(id) {
    setHabits(prev => prev.filter(h => h.id !== id))
  }

  return { habits, addHabit, renameHabit, deleteHabit }
}
