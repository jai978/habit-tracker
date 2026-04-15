export default function Nav({ activeView, onChangeView }) {
  return (
    <nav className="bg-white border-b border-gray-200 mb-8">
      <div className="max-w-2xl mx-auto px-4 flex items-center justify-between h-14">
        <div className="flex gap-1">
          <button
            onClick={() => onChangeView('checkin')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeView === 'checkin'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Daily Check-in
          </button>
          <button
            onClick={() => onChangeView('progress')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeView === 'progress'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Progress
          </button>
        </div>
        <button
          onClick={() => onChangeView('manage')}
          className={`p-2 rounded-md transition-colors ${
            activeView === 'manage'
              ? 'text-indigo-600 bg-indigo-50'
              : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
          }`}
          title="Manage habits"
          aria-label="Manage habits"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
            />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </div>
    </nav>
  )
}
