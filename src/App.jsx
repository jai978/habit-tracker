import { useState } from 'react'
import { HabitProvider } from './context/HabitContext.jsx'
import Nav from './components/Nav.jsx'
import DailyCheckIn from './components/DailyCheckIn.jsx'
import Progress from './components/Progress.jsx'
import ManageHabits from './components/ManageHabits.jsx'

export default function App() {
  const [activeView, setActiveView] = useState('checkin')
  const [prevView, setPrevView] = useState('checkin')

  function handleChangeView(view) {
    if (view !== 'manage') setPrevView(view)
    setActiveView(view)
  }

  function handleBackFromManage() {
    setActiveView(prevView)
  }

  return (
    <HabitProvider>
      <div className="bg-gray-900 min-h-screen">
        <Nav activeView={activeView} onChangeView={handleChangeView} />
        <main className="pb-12">
          {activeView === 'checkin' && (
            <DailyCheckIn onManage={() => handleChangeView('manage')} />
          )}
          {activeView === 'progress' && <Progress />}
          {activeView === 'manage' && <ManageHabits onBack={handleBackFromManage} />}
        </main>
      </div>
    </HabitProvider>
  )
}
