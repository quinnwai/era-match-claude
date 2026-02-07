import { useState } from 'react'

export default function TimePicker({ onSearch, defaultYears = 15 }) {
  const [yearsAgo, setYearsAgo] = useState(defaultYears)
  const targetYear = new Date().getFullYear() - yearsAgo

  return (
    <div className="bg-white rounded-2xl shadow-lg p-8 max-w-lg w-full mx-4">
      <h2 className="text-xl font-semibold text-gray-800 mb-6 text-center">
        How far back do you want to go?
      </h2>

      <div className="text-center mb-4">
        <span className="text-5xl font-bold text-amber-600">{targetYear}</span>
        <p className="text-gray-500 mt-1">{yearsAgo} years ago</p>
      </div>

      <input
        type="range"
        min="1"
        max="30"
        value={yearsAgo}
        onChange={(e) => setYearsAgo(Number(e.target.value))}
        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-amber-500"
        aria-label="Years ago"
      />
      <div className="flex justify-between text-xs text-gray-400 mt-1 mb-6">
        <span>1 year ago</span>
        <span>30 years ago</span>
      </div>

      <button
        onClick={() => onSearch(yearsAgo)}
        className="w-full bg-amber-500 hover:bg-amber-600 text-white font-semibold py-3 px-6 rounded-lg transition-colors cursor-pointer"
      >
        Explore
      </button>
    </div>
  )
}
