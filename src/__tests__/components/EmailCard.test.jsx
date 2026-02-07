import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import EmailCard from '../../components/EmailCard'

const mockEmail = {
  id: 'msg001',
  from: { name: 'John Doe', email: 'john@example.com' },
  to: 'jane@example.com',
  date: 'March 14, 2011 at 3:42 PM',
  subject: 'Hey there!',
  snippet: 'How are you doing? Long time no see.',
}

describe('EmailCard', () => {
  it('renders sender name, subject, date, and snippet', () => {
    render(<EmailCard email={mockEmail} onSelect={() => {}} />)
    expect(screen.getByText('John Doe')).toBeInTheDocument()
    expect(screen.getByText('Hey there!')).toBeInTheDocument()
    expect(screen.getByText('March 14, 2011 at 3:42 PM')).toBeInTheDocument()
    expect(screen.getByText(/How are you doing/)).toBeInTheDocument()
  })

  it('truncates subject lines longer than 80 characters', () => {
    const longSubject = 'A'.repeat(100)
    const email = { ...mockEmail, subject: longSubject }
    render(<EmailCard email={email} onSelect={() => {}} />)
    expect(screen.getByText('A'.repeat(80) + '...')).toBeInTheDocument()
  })

  it('calls onSelect with the email ID when clicked', async () => {
    const onSelect = vi.fn()
    render(<EmailCard email={mockEmail} onSelect={onSelect} />)
    await userEvent.click(screen.getByRole('button'))
    expect(onSelect).toHaveBeenCalledWith('msg001')
  })

  it('shows email address when no display name', () => {
    const email = { ...mockEmail, from: { name: '', email: 'john@example.com' } }
    render(<EmailCard email={email} onSelect={() => {}} />)
    expect(screen.getByText('john@example.com')).toBeInTheDocument()
  })
})
