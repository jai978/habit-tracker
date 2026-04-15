import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'
import { generateId } from '../utils/ids.js'
import { getTodayISO } from '../utils/dates.js'

export function useHabits() {
  const [habits, setHabits] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('habits')
      .select('*')
      .order('created_at')
      .then(({ data, error }) => {
        if (!error && data) setHabits(data)
        setLoading(false)
      })
  }, [])

  async function addHabit(name) {
    const trimmed = name.trim()
    if (!trimmed) return
    const habit = { id: generateId(), name: trimmed, created_at: getTodayISO() }
    const { error } = await supabase.from('habits').insert(habit)
    if (!error) setHabits(prev => [...prev, habit])
  }

  async function renameHabit(id, newName) {
    const trimmed = newName.trim()
    if (!trimmed) return
    const { error } = await supabase.from('habits').update({ name: trimmed }).eq('id', id)
    if (!error) setHabits(prev => prev.map(h => h.id === id ? { ...h, name: trimmed } : h))
  }

  async function deleteHabit(id) {
    const { error } = await supabase.from('habits').delete().eq('id', id)
    if (!error) setHabits(prev => prev.filter(h => h.id !== id))
  }

  return { habits, loading, addHabit, renameHabit, deleteHabit }
}
