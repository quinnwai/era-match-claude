import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import LoginScreen from '../../components/LoginScreen'

describe('LoginScreen', () => {
  it('renders the sign-in button', () => {
    render(<LoginScreen onLogin={() => {}} />)
    expect(screen.getByText('Sign in with Google')).toBeInTheDocument()
  })

  it('calls onLogin when sign-in button is clicked', async () => {
    const onLogin = vi.fn()
    render(<LoginScreen onLogin={onLogin} />)
    await userEvent.click(screen.getByText('Sign in with Google'))
    expect(onLogin).toHaveBeenCalledTimes(1)
  })

  it('displays the privacy notice', () => {
    render(<LoginScreen onLogin={() => {}} />)
    expect(
      screen.getByText(/your emails never leave your browser/i)
    ).toBeInTheDocument()
  })

  it('displays the app title', () => {
    render(<LoginScreen onLogin={() => {}} />)
    expect(screen.getByText('Email Time Capsule')).toBeInTheDocument()
  })

  it('shows an error message when error prop is provided', () => {
    render(<LoginScreen onLogin={() => {}} error="Auth failed" />)
    expect(screen.getByText('Auth failed')).toBeInTheDocument()
  })
})
