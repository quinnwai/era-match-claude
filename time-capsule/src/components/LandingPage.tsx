import { motion } from 'framer-motion'

interface LandingPageProps {
  onSignIn: () => void
  isLoading: boolean
  error: string | null
}

export function LandingPage({ onSignIn, isLoading, error }: LandingPageProps) {
  return (
    <div className="landing">
      <motion.div
        className="landing-content"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
      >
        <h1 className="landing-title">Time Capsule</h1>
        <p className="landing-subtitle">Unlock your email memories</p>
        <p className="landing-description">
          Rediscover old Gmail conversations from your past. Pick a year and
          uncover forgotten messages, inside jokes, and the way you used to talk.
        </p>

        <button
          className="landing-cta"
          onClick={onSignIn}
          disabled={isLoading}
        >
          {isLoading ? 'Connecting...' : 'Unlock Your Memories'}
        </button>

        {error && <p className="landing-error" role="alert">{error}</p>}

        <div className="landing-privacy">
          <h3>Your privacy is absolute</h3>
          <ul>
            <li>We only request read-only access to your Gmail</li>
            <li>No email data is ever stored, sent, or shared</li>
            <li>Everything happens in your browser</li>
            <li>Close the tab and everything disappears</li>
          </ul>
        </div>
      </motion.div>
    </div>
  )
}
