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

export default function HeatmapCell({ date, rating, note, isEmpty }) {
  const [hovered, setHovered] = useState(false)

  if (isEmpty) {
    return <div className="w-3.5 h-3.5" />
  }

  return (
    <div
      className="relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        className={`w-3.5 h-3.5 rounded-sm cursor-default ${RATING_COLORS[rating ?? 0]}`}
      />
      <Tooltip date={date} rating={rating ?? 0} note={note ?? ''} visible={hovered} />
    </div>
  )
}
