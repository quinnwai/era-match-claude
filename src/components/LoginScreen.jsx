export default function LoginScreen({ onLogin, error }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-amber-50 to-orange-100">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full mx-4 text-center">
        <div className="text-6xl mb-4">💌</div>
        <h1 className="text-3xl font-bold text-gray-800 mb-2">Email Time Capsule</h1>
        <p className="text-gray-500 mb-6">
          Rediscover funny, nostalgic, and forgotten emails from years ago.
        </p>

        <button
          onClick={onLogin}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors cursor-pointer"
        >
          Sign in with Google
        </button>

        {error && (
          <p className="mt-4 text-red-500 text-sm">{error}</p>
        )}

        <div className="mt-6 pt-6 border-t border-gray-100">
          <p className="text-xs text-gray-400">
            Your emails never leave your browser. We don't store, send, or log anything.
          </p>
        </div>
      </div>
    </div>
  )
}
