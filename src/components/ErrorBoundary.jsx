import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="text-center py-16">
          <div className="text-5xl mb-4">😵</div>
          <h3 className="text-xl font-semibold text-gray-700 mb-2">Something went wrong</h3>
          <p className="text-gray-400 mb-4">
            {this.state.error?.message || 'An unexpected error occurred.'}
          </p>
          <button
            onClick={this.handleRetry}
            className="bg-amber-500 hover:bg-amber-600 text-white font-semibold py-2 px-6 rounded-lg transition-colors cursor-pointer"
          >
            Try Again
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
