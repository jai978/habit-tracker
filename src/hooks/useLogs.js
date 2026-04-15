import { useLocalStorage } from './useLocalStorage.js'
import { LOGS_KEY } from '../utils/storage.js'

export function useLogs() {
  const [logs, setLogs] = useLocalStorage(LOGS_KEY, {})

  function getLogForDate(date) {
    return logs[date] || {}
  }

  function saveDay(date, dayLogs) {
    setLogs(prev => ({ ...prev, [date]: dayLogs }))
  }

  function deleteHabitLogs(habitId) {
    setLogs(prev => {
      const cleaned = {}
      for (const [date, dayLogs] of Object.entries(prev)) {
        const { [habitId]: _removed, ...rest } = dayLogs
        if (Object.keys(rest).length > 0) cleaned[date] = rest
      }
      return cleaned
    })
  }

  return { logs, getLogForDate, saveDay, deleteHabitLogs }
}
