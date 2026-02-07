import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryInbox } from '../MemoryInbox'
import type { EmailMessage } from '../../types'

const mockEmails: EmailMessage[] = [
  {
    id: '1',
    threadId: 't1',
    subject: 'Remember that time?',
    from: 'Alice Smith <alice@example.com>',
    to: 'me@example.com',
    date: '2012-06-15T10:30:00Z',
    snippet: 'Hey, do you remember when we went to the park...',
  },
  {
    id: '2',
    threadId: 't2',
    subject: 'Re: Summer plans',
    from: 'Bob Jones <bob@example.com>',
    to: 'me@example.com',
    date: '2012-07-20T14:00:00Z',
    snippet: "Yeah I'm totally down for the road trip!",
  },
]

describe('MemoryInbox', () => {
  const defaultProps = {
    emails: mockEmails,
    year: 2012,
    onSelectEmail: vi.fn(),
    onShuffle: vi.fn(),
    onBack: vi.fn(),
    isLoading: false,
  }

  it('renders the year in the title', () => {
    render(<MemoryInbox {...defaultProps} />)
    expect(screen.getByText('Memories from 2012')).toBeInTheDocument()
  })

  it('renders email rows with sender names', () => {
    render(<MemoryInbox {...defaultProps} />)
    expect(screen.getByText('Alice Smith')).toBeInTheDocument()
    expect(screen.getByText('Bob Jones')).toBeInTheDocument()
  })

  it('renders email subjects', () => {
    render(<MemoryInbox {...defaultProps} />)
    expect(screen.getByText('Remember that time?')).toBeInTheDocument()
    expect(screen.getByText('Re: Summer plans')).toBeInTheDocument()
  })

  it('renders email snippets', () => {
    render(<MemoryInbox {...defaultProps} />)
    expect(screen.getByText(/Hey, do you remember/)).toBeInTheDocument()
  })

  it('calls onSelectEmail with threadId when clicked', async () => {
    const user = userEvent.setup()
    const onSelectEmail = vi.fn()
    render(<MemoryInbox {...defaultProps} onSelectEmail={onSelectEmail} />)
    await user.click(screen.getByText('Remember that time?'))
    expect(onSelectEmail).toHaveBeenCalledWith('t1')
  })

  it('renders shuffle button', () => {
    render(<MemoryInbox {...defaultProps} />)
    expect(screen.getByText('Shuffle')).toBeInTheDocument()
  })

  it('calls onShuffle when shuffle button is clicked', async () => {
    const user = userEvent.setup()
    const onShuffle = vi.fn()
    render(<MemoryInbox {...defaultProps} onShuffle={onShuffle} />)
    await user.click(screen.getByText('Shuffle'))
    expect(onShuffle).toHaveBeenCalledOnce()
  })

  it('shows loading state', () => {
    render(<MemoryInbox {...defaultProps} isLoading={true} />)
    expect(screen.getByText('Digging through your memories...')).toBeInTheDocument()
  })

  it('shows empty state when no emails', () => {
    render(<MemoryInbox {...defaultProps} emails={[]} />)
    expect(screen.getByText(/No personal emails found for 2012/)).toBeInTheDocument()
  })

  it('renders back button', async () => {
    const user = userEvent.setup()
    const onBack = vi.fn()
    render(<MemoryInbox {...defaultProps} onBack={onBack} />)
    await user.click(screen.getByLabelText('Back to year picker'))
    expect(onBack).toHaveBeenCalledOnce()
  })
})
