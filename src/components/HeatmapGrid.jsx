import HeatmapCell from './HeatmapCell.jsx'
import { getDayOfWeek, DAY_LABELS } from '../utils/dates.js'

// Build a flat cell list for CSS grid with grid-auto-flow: column.
// Cells are ordered col-major: each group of 7 = one week column (Mon→Sun).
// Padding empty cells are added at the start so day 0 lands on the right row.
function buildCells(dates) {
  if (dates.length === 0) return []
  const firstDow = getDayOfWeek(dates[0]) // 0=Mon, 6=Sun

  const cells = []
  // Leading empty cells
  for (let i = 0; i < firstDow; i++) {
    cells.push({ isEmpty: true, date: null, key: `pad-${i}` })
  }
  // Real cells
  for (const date of dates) {
    cells.push({ isEmpty: false, date, key: date })
  }
  // Trailing empty cells to complete the last column
  const remainder = cells.length % 7
  if (remainder !== 0) {
    for (let i = 0; i < 7 - remainder; i++) {
      cells.push({ isEmpty: true, date: null, key: `trail-${i}` })
    }
  }
  return cells
}

// Which day label rows to show (Mon, Wed, Fri)
const SHOW_LABEL = [true, false, true, false, true, false, false]

export default function HeatmapGrid({ habitId, logs, dates, habitType }) {
  const cells = buildCells(dates)
  const numCols = cells.length / 7

  return (
    <div className="overflow-x-auto pb-1">
      <div className="inline-flex gap-2">
        {/* Day-of-week labels column */}
        <div className="flex flex-col gap-0.5 shrink-0" style={{ paddingTop: '1px' }}>
          {DAY_LABELS.map((label, i) => (
            <div key={label} className="h-3.5 flex items-center">
              <span className={`text-[10px] text-gray-400 w-5 text-right pr-0.5 leading-none select-none ${SHOW_LABEL[i] ? '' : 'invisible'}`}>
                {label.slice(0, 1)}
              </span>
            </div>
          ))}
        </div>

        {/* Heatmap grid — column-major auto-flow */}
        <div
          className="grid gap-0.5"
          style={{
            gridTemplateRows: 'repeat(7, 14px)',
            gridTemplateColumns: `repeat(${numCols}, 14px)`,
            gridAutoFlow: 'column',
          }}
        >
          {cells.map(cell =>
            cell.isEmpty ? (
              <div key={cell.key} className="w-3.5 h-3.5" />
            ) : (
              <HeatmapCell
                key={cell.key}
                date={cell.date}
                rating={logs[cell.date]?.[habitId]?.rating ?? 0}
                note={logs[cell.date]?.[habitId]?.note ?? ''}
                habitType={habitType ?? 'rating'}
              />
            )
          )}
        </div>
      </div>
    </div>
  )
}
