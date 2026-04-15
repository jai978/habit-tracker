import { useState, useEffect } from 'react'
import { getItem, setItem } from '../utils/storage.js'

export function useLocalStorage(key, initialValue) {
  const [value, setValue] = useState(() => {
    const stored = getItem(key)
    return stored !== null ? stored : initialValue
  })

  useEffect(() => {
    setItem(key, value)
  }, [key, value])

  // Sync across tabs
  useEffect(() => {
    function handleStorage(e) {
      if (e.key === key) {
        try {
          const updated = e.newValue ? JSON.parse(e.newValue) : initialValue
          setValue(updated)
        } catch {
          // ignore
        }
      }
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [key, initialValue])

  return [value, setValue]
}
