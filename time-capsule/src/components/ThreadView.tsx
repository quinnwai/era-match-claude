import { motion } from 'framer-motion'
import type { EmailThread } from '../types'
import { sanitizeHtml, plainTextToHtml, parseFromHeader, formatDateTime } from '../services/parser'

interface ThreadViewProps {
  thread: EmailThread
  onBack: () => void
  isLoading: boolean
}

export function ThreadView({ thread, onBack, isLoading }: ThreadViewProps) {
  if (isLoading) {
    return (
      <div className="thread-view">
        <div className="thread-loading">
          <div className="spinner" />
          <p>Unfolding this conversation...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="thread-view">
      <div className="thread-header">
        <button className="back-button" onClick={onBack} aria-label="Back to inbox">
          &larr; Back
        </button>
        <h2 className="thread-subject">{thread.subject}</h2>
      </div>

      <div className="thread-messages">
        {thread.messages.map((msg, index) => {
          const { name } = parseFromHeader(msg.from)
          const htmlContent = msg.isHtml
            ? sanitizeHtml(msg.body)
            : plainTextToHtml(msg.body)

          return (
            <motion.div
              key={msg.id}
              className={`message ${msg.isSent ? 'message-sent' : 'message-received'}`}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1, duration: 0.5, ease: 'easeOut' }}
            >
              <div className="message-header">
                <span className="message-from">{name}</span>
                <span className="message-date">{formatDateTime(msg.date)}</span>
              </div>
              <div
                className="message-body"
                dangerouslySetInnerHTML={{ __html: htmlContent }}
              />
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
