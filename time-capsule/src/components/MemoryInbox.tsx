import { motion } from 'framer-motion'
import type { EmailMessage } from '../types'
import { parseFromHeader, formatDate } from '../services/parser'

interface MemoryInboxProps {
  emails: EmailMessage[]
  year: number
  onSelectEmail: (threadId: string) => void
  onShuffle: () => void
  onBack: () => void
  isLoading: boolean
}

export function MemoryInbox({ emails, year, onSelectEmail, onShuffle, onBack, isLoading }: MemoryInboxProps) {
  return (
    <div className="inbox">
      <div className="inbox-header">
        <button className="back-button" onClick={onBack} aria-label="Back to year picker">
          &larr; Back
        </button>
        <h2 className="inbox-title">Memories from {year}</h2>
        <button
          className="shuffle-button"
          onClick={onShuffle}
          disabled={isLoading}
        >
          {isLoading ? 'Loading...' : 'Shuffle'}
        </button>
      </div>

      {isLoading ? (
        <div className="inbox-loading">
          <div className="spinner" />
          <p>Digging through your memories...</p>
        </div>
      ) : emails.length === 0 ? (
        <div className="inbox-empty">
          <p>No personal emails found for {year}.</p>
          <button className="back-button" onClick={onBack}>Try another year</button>
        </div>
      ) : (
        <div className="email-list" role="list">
          {emails.map((email, index) => {
            const { name } = parseFromHeader(email.from)
            return (
              <motion.button
                key={email.id}
                className="email-row"
                onClick={() => onSelectEmail(email.threadId)}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.06, duration: 0.4 }}
                role="listitem"
              >
                <div className="email-row-top">
                  <span className="email-from">{name}</span>
                  <span className="email-date">{formatDate(email.date)}</span>
                </div>
                <div className="email-subject">{email.subject}</div>
                <div className="email-snippet">{email.snippet}</div>
              </motion.button>
            )
          })}
        </div>
      )}
    </div>
  )
}
