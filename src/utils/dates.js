export function getTodayISO() {
  const d = new Date()
  return toISO(d)
}

export function toISO(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function formatDisplay(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number)
  const d = new Date(year, month - 1, day)
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

export function getMonthLabel(year, month) {
  const d = new Date(year, month - 1, 1)
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long' })
}

// Returns array of ISO date strings for the last numDays days ending today
export function getDateRange(endISO, numDays) {
  const [y, m, d] = endISO.split('-').map(Number)
  const end = new Date(y, m - 1, d)
  const dates = []
  for (let i = numDays - 1; i >= 0; i--) {
    const date = new Date(end)
    date.setDate(end.getDate() - i)
    dates.push(toISO(date))
  }
  return dates
}

// Returns 112 ISO date strings ending today (last 16 weeks)
export function get16WeekRange() {
  return getDateRange(getTodayISO(), 112)
}

// Returns { dates: string[], paddingStart: number } for a calendar month grid.
// paddingStart = number of empty cells before the 1st of month (week starts Monday).
export function getWeeksForMonth(year, month) {
  const firstDay = new Date(year, month - 1, 1)
  const lastDay = new Date(year, month, 0)

  // Day of week: 0=Sun, 1=Mon...6=Sat → convert to Mon-based (0=Mon, 6=Sun)
  const startDow = (firstDay.getDay() + 6) % 7

  const dates = []
  for (let d = 1; d <= lastDay.getDate(); d++) {
    dates.push(toISO(new Date(year, month - 1, d)))
  }

  return { dates, paddingStart: startDow }
}

// 0=Mon ... 6=Sun
export function getDayOfWeek(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number)
  return (new Date(y, m - 1, d).getDay() + 6) % 7
}

export const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
