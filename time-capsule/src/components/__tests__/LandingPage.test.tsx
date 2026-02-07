import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LandingPage } from '../LandingPage'

describe('LandingPage', () => {
  it('renders the title and subtitle', () => {
    render(<LandingPage onSignIn={() => {}} isLoading={false} error={null} />)
    expect(screen.getByText('Time Capsule')).toBeInTheDocument()
    expect(screen.getByText('Unlock your email memories')).toBeInTheDocument()
  })

  it('renders the CTA button', () => {
    render(<LandingPage onSignIn={() => {}} isLoading={false} error={null} />)
    expect(screen.getByText('Unlock Your Memories')).toBeInTheDocument()
  })

  it('calls onSignIn when CTA is clicked', async () => {
    const user = userEvent.setup()
    const onSignIn = vi.fn()
    render(<LandingPage onSignIn={onSignIn} isLoading={false} error={null} />)
    await user.click(screen.getByText('Unlock Your Memories'))
    expect(onSignIn).toHaveBeenCalledOnce()
  })

  it('shows loading state', () => {
    render(<LandingPage onSignIn={() => {}} isLoading={true} error={null} />)
    expect(screen.getByText('Connecting...')).toBeInTheDocument()
    expect(screen.getByText('Connecting...')).toBeDisabled()
  })

  it('displays error message', () => {
    render(<LandingPage onSignIn={() => {}} isLoading={false} error="Something went wrong" />)
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong')
  })

  it('renders privacy statement', () => {
    render(<LandingPage onSignIn={() => {}} isLoading={false} error={null} />)
    expect(screen.getByText('Your privacy is absolute')).toBeInTheDocument()
    expect(screen.getByText(/read-only access/)).toBeInTheDocument()
    expect(screen.getByText(/No email data is ever stored/)).toBeInTheDocument()
    expect(screen.getByText(/Everything happens in your browser/)).toBeInTheDocument()
    expect(screen.getByText(/Close the tab and everything disappears/)).toBeInTheDocument()
  })
})
