import { useRef, useEffect } from 'react'

export default function EmailViewer({ email, onClose }) {
  const iframeRef = useRef(null)

  useEffect(() => {
    if (iframeRef.current && email.bodyHtml && typeof ResizeObserver !== 'undefined') {
      const iframe = iframeRef.current
      const resizeObserver = new ResizeObserver(() => {
        try {
          const doc = iframe.contentDocument || iframe.contentWindow?.document
          if (doc?.body) {
            iframe.style.height = doc.body.scrollHeight + 40 + 'px'
          }
        } catch {
          // cross-origin restrictions, ignore
        }
      })

      iframe.onload = () => {
        try {
          const doc = iframe.contentDocument || iframe.contentWindow?.document
          if (doc?.body) {
            iframe.style.height = doc.body.scrollHeight + 40 + 'px'
            resizeObserver.observe(doc.body)
          }
        } catch {
          // ignore
        }
      }

      return () => resizeObserver.disconnect()
    }
  }, [email.bodyHtml])

  return (
    <div className="w-full max-w-3xl mx-auto">
      <button
        onClick={onClose}
        className="mb-4 text-gray-500 hover:text-gray-800 font-medium cursor-pointer"
      >
        ← Back to list
      </button>

      <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
        <div className="p-6 border-b border-gray-100">
          <h2 className="text-xl font-bold text-gray-800 mb-3">{email.subject}</h2>
          <div className="space-y-1 text-sm text-gray-600">
            <p>
              <span className="font-medium text-gray-500">From:</span>{' '}
              {email.from.name ? `${email.from.name} <${email.from.email}>` : email.from.email}
            </p>
            <p>
              <span className="font-medium text-gray-500">To:</span> {email.to}
            </p>
            <p>
              <span className="font-medium text-gray-500">Date:</span> {email.date}
            </p>
          </div>
        </div>

        <div className="p-6">
          {email.bodyHtml ? (
            <iframe
              ref={iframeRef}
              srcDoc={email.bodyHtml}
              sandbox="allow-same-origin"
              title="Email content"
              className="w-full min-h-[200px] border-0"
              style={{ height: '400px' }}
            />
          ) : (
            <pre className="whitespace-pre-wrap font-sans text-gray-700 text-sm leading-relaxed">
              {email.bodyText || 'No content available.'}
            </pre>
          )}
        </div>
      </div>
    </div>
  )
}
