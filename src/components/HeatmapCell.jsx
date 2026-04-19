import { useState } from 'react'
import Tooltip from './Tooltip.jsx'

const RATING_COLORS = {
  0: 'bg-gray-100',
  1: 'bg-indigo-100',
  2: 'bg-indigo-200',
  3: 'bg-indigo-400',
  4: 'bg-indigo-500',
  5: 'bg-indigo-700',
}

const BOOLEAN_COLORS = {
  0: 'bg-gray-100',
  1: 'bg-red-200',
  5: 'bg-green-500',
}

export default function HeatmapCell({ date, rating, note, isEmpty, habitType }) {
  const [hovered, setHovered] = useState(false)

  if (isEmpty) {
    return <div className="w-3.5 h-3.5" />
  }

  const r = rating ?? 0
  const colorClass = habitType === 'boolean'
    ? (BOOLEAN_COLORS[r] ?? 'bg-gray-100')
    : (RATING_COLORS[r] ?? 'bg-gray-100')

  return (
    <div
      className="relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className={`w-3.5 h-3.5 rounded-sm cursor-default ${colorClass}`} />
      <Tooltip date={date} rating={r} note={note ?? ''} visible={hovered} habitType={habitType} />
    </div>
  )
}
