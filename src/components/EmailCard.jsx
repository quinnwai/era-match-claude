export default function EmailCard({ email, onSelect }) {
  const truncatedSubject =
    email.subject.length > 80 ? email.subject.slice(0, 80) + '...' : email.subject

  return (
    <div
      onClick={() => onSelect(email.id)}
      className="bg-white rounded-xl shadow-md hover:shadow-lg transition-shadow p-5 cursor-pointer border border-gray-100 hover:border-amber-200"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onSelect(email.id)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-gray-800 truncate">
            {email.from.name || email.from.email}
          </p>
          <p className="text-gray-700 font-medium mt-1 truncate">{truncatedSubject}</p>
          <p className="text-gray-400 text-sm mt-2 line-clamp-2">{email.snippet}</p>
        </div>
        <span className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0">
          {email.date}
        </span>
      </div>
    </div>
  )
}
