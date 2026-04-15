import { createContext, useContext } from 'react'
import { useHabits } from '../hooks/useHabits.js'
import { useLogs } from '../hooks/useLogs.js'

const HabitContext = createContext(null)

export function HabitProvider({ children }) {
  const { habits, loading: habitsLoading, addHabit, renameHabit, deleteHabit: _deleteHabit } = useHabits()
  const { logs, loading: logsLoading, getLogForDate, saveDay, deleteHabitLogs } = useLogs()

  const loading = habitsLoading || logsLoading

  function deleteHabit(id) {
    _deleteHabit(id)
    deleteHabitLogs(id)
  }

  return (
    <HabitContext.Provider value={{ habits, logs, loading, addHabit, renameHabit, deleteHabit, getLogForDate, saveDay }}>
      {children}
    </HabitContext.Provider>
  )
}

export function useHabitContext() {
  const ctx = useContext(HabitContext)
  if (!ctx) throw new Error('useHabitContext must be used within HabitProvider')
  return ctx
}
