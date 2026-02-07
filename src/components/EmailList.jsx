import EmailCard from './EmailCard'
import EmptyState from './EmptyState'

export default function EmailList({ emails, onSelect, onShowMore, onShuffle, hasMore }) {
  if (emails.length === 0) {
    return <EmptyState />
  }

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="space-y-4">
        {emails.map((email) => (
          <EmailCard key={email.id} email={email} onSelect={onSelect} />
        ))}
      </div>

      <div className="flex gap-3 justify-center mt-8">
        {hasMore && (
          <button
            onClick={onShowMore}
            className="bg-amber-500 hover:bg-amber-600 text-white font-semibold py-2 px-6 rounded-lg transition-colors cursor-pointer"
          >
            Show Me More
          </button>
        )}
        <button
          onClick={onShuffle}
          className="bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold py-2 px-6 rounded-lg transition-colors cursor-pointer"
        >
          Shuffle
        </button>
      </div>
    </div>
  )
}
