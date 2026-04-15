import { useState } from 'react'
import { HabitProvider, useHabitContext } from './context/HabitContext.jsx'
import Nav from './components/Nav.jsx'
import DailyCheckIn from './components/DailyCheckIn.jsx'
import Progress from './components/Progress.jsx'
import ManageHabits from './components/ManageHabits.jsx'

function AppContent() {
  const { loading } = useHabitContext()
  const [activeView, setActiveView] = useState('checkin')
  const [prevView, setPrevView] = useState('checkin')

  function handleChangeView(view) {
    if (view !== 'manage') setPrevView(view)
    setActiveView(view)
  }

  function handleBackFromManage() {
    setActiveView(prevView)
  }

  if (loading) {
    return (
      <div className="bg-gray-900 min-h-screen flex items-center justify-center">
        <p className="text-gray-400 text-sm">Loading...</p>
      </div>
    )
  }

  return (
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
  )
}

export default function App() {
  return (
    <HabitProvider>
      <AppContent />
    </HabitProvider>
  )
}
