import { motion } from 'framer-motion'

interface YearPickerProps {
  availableYears: number[]
  onSelectYear: (year: number) => void
  onSignOut: () => void
  isLoading: boolean
}

export function YearPicker({ availableYears, onSelectYear, onSignOut, isLoading }: YearPickerProps) {
  return (
    <div className="year-picker">
      <motion.div
        className="year-picker-content"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        <h2 className="year-picker-title">Choose a year to revisit</h2>
        <p className="year-picker-subtitle">Pick a year and discover forgotten conversations</p>

        {isLoading ? (
          <div className="year-picker-loading">
            <div className="spinner" />
            <p>Scanning your mailbox...</p>
          </div>
        ) : (
          <div className="year-grid" role="list">
            {availableYears.map((year, index) => (
              <motion.button
                key={year}
                className="year-button"
                onClick={() => onSelectYear(year)}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.03, duration: 0.3 }}
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.95 }}
                role="listitem"
              >
                {year}
              </motion.button>
            ))}
          </div>
        )}

        <button className="sign-out-button" onClick={onSignOut}>
          Sign Out
        </button>
      </motion.div>
    </div>
  )
}
