/**
 * Serves the interactive daily check-in page.
 * GET /api/checkin?date=2026-04-16
 */
import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).send('Method not allowed')

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).send('Missing Supabase environment variables.')
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  const tz = process.env.TIMEZONE || 'Pacific/Auckland'
  const date = req.query.date || new Date().toLocaleDateString('en-CA', { timeZone: tz })
  const appUrl = process.env.APP_URL

  const { data: habits, error: habitsError } = await supabase
    .from('habits')
    .select('id, name')
    .order('created_at')

  if (habitsError || !habits) {
    return res.status(500).send('Could not load habits.')
  }

  // Load any existing logs for this date so we can pre-select them
  const { data: existingLogs } = await supabase
    .from('habit_logs')
    .select('habit_id, stars')
    .eq('date', date)

  const existing = {}
  for (const log of existingLogs || []) {
    existing[log.habit_id] = log.stars
  }

  const displayDate = (() => {
    const [y, m, d] = date.split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString('en-NZ', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    })
  })()

  // Escape closing script tags to prevent XSS via habit names
  const habitsJson = JSON.stringify(habits).replace(/</g, '\\u003c')
  const existingJson = JSON.stringify(existing).replace(/</g, '\\u003c')

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Habit Check-in</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #111827;
      min-height: 100vh;
      display: flex;
      align-items: flex-start;
      justify-content: center;
      padding: 32px 16px 64px;
    }
    .card {
      background: #1f2937;
      border-radius: 16px;
      padding: 32px;
      width: 100%;
      max-width: 480px;
    }
    .label {
      color: #6b7280;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      margin-bottom: 4px;
    }
    h1 {
      color: #f9fafb;
      font-size: 20px;
      font-weight: 700;
      padding-bottom: 20px;
      border-bottom: 1px solid #374151;
      margin-bottom: 24px;
    }
    .habit { margin-bottom: 24px; }
    .habit-name {
      color: #e5e7eb;
      font-size: 15px;
      font-weight: 600;
      margin-bottom: 10px;
    }
    .stars {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .star-btn {
      padding: 8px 14px;
      border-radius: 8px;
      border: 2px solid #374151;
      background: #111827;
      color: #9ca3af;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s;
    }
    .star-btn:hover { border-color: #6b7280; color: #f9fafb; }
    .star-btn.selected {
      background: #1d4ed8;
      border-color: #1d4ed8;
      color: #fff;
    }
    .star-btn.skip.selected {
      background: #374151;
      border-color: #6b7280;
      color: #f9fafb;
    }
    .divider { border: none; border-top: 1px solid #374151; margin: 8px 0 24px; }
    #submit-btn {
      width: 100%;
      padding: 14px;
      background: #16a34a;
      color: #fff;
      border: none;
      border-radius: 10px;
      font-size: 16px;
      font-weight: 700;
      cursor: pointer;
      transition: background 0.15s;
    }
    #submit-btn:hover { background: #15803d; }
    #submit-btn:disabled { background: #374151; color: #6b7280; cursor: not-allowed; }
    #status {
      margin-top: 16px;
      text-align: center;
      font-size: 14px;
      color: #9ca3af;
      min-height: 20px;
    }
    #status.success { color: #4ade80; }
    #status.error   { color: #f87171; }
  </style>
</head>
<body>
  <div class="card">
    <div class="label">Daily Check-in</div>
    <h1>${displayDate}</h1>
    <div id="habits-container"></div>
    <hr class="divider"/>
    <button id="submit-btn" disabled>Save Check-in</button>
    <div id="status"></div>
  </div>

  <script>
    const habits   = ${habitsJson}
    const existing = ${existingJson}
    const date     = '${date}'
    const appUrl   = '${appUrl}'
    const selected = { ...existing }

    const container = document.getElementById('habits-container')
    const submitBtn = document.getElementById('submit-btn')
    const status    = document.getElementById('status')

    function renderHabits() {
      container.innerHTML = ''
      for (const habit of habits) {
        const div = document.createElement('div')
        div.className = 'habit'

        const nameEl = document.createElement('div')
        nameEl.className = 'habit-name'
        nameEl.textContent = habit.name
        div.appendChild(nameEl)

        const starsEl = document.createElement('div')
        starsEl.className = 'stars'

        const options = [
          { value: 0, label: 'Skip' },
          { value: 1, label: '★' },
          { value: 2, label: '★★' },
          { value: 3, label: '★★★' },
          { value: 4, label: '★★★★' },
          { value: 5, label: '★★★★★' },
        ]

        for (const opt of options) {
          const btn = document.createElement('button')
          btn.className = 'star-btn' + (opt.value === 0 ? ' skip' : '')
          btn.textContent = opt.label
          btn.dataset.habitId = habit.id
          btn.dataset.value = opt.value

          if (selected[habit.id] === opt.value) btn.classList.add('selected')

          btn.addEventListener('click', () => {
            // Deselect all buttons for this habit
            starsEl.querySelectorAll('.star-btn').forEach(b => b.classList.remove('selected'))
            btn.classList.add('selected')
            selected[habit.id] = opt.value
            checkAllSelected()
          })

          starsEl.appendChild(btn)
        }

        div.appendChild(starsEl)
        container.appendChild(div)
      }
    }

    function checkAllSelected() {
      const allDone = habits.every(h => selected[h.id] !== undefined)
      submitBtn.disabled = !allDone
    }

    submitBtn.addEventListener('click', async () => {
      submitBtn.disabled = true
      status.className = ''
      status.textContent = 'Saving...'

      const ratings = habits.map(h => ({ habit_id: h.id, stars: selected[h.id] }))

      try {
        const response = await fetch(appUrl + '/api/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date, ratings }),
        })

        if (response.ok) {
          status.className = 'success'
          status.textContent = 'All saved! You can close this tab.'
          submitBtn.textContent = 'Saved'
        } else {
          throw new Error('Server error')
        }
      } catch {
        status.className = 'error'
        status.textContent = 'Something went wrong. Please try again.'
        submitBtn.disabled = false
      }
    })

    renderHabits()
    checkAllSelected()
  </script>
</body>
</html>`

  res.setHeader('Content-Type', 'text/html')
  return res.status(200).send(html)
}
