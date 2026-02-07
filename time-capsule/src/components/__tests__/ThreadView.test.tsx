import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThreadView } from '../ThreadView'
import type { EmailThread } from '../../types'

const mockThread: EmailThread = {
  id: 't1',
  subject: 'Remember that time?',
  messages: [
    {
      id: 'm1',
      from: 'Alice Smith <alice@example.com>',
      to: 'me@example.com',
      date: '2012-06-15T10:30:00Z',
      body: 'Hey do you remember when we went to the park?',
      isHtml: false,
      isSent: false,
    },
    {
      id: 'm2',
      from: 'Me <me@example.com>',
      to: 'alice@example.com',
      date: '2012-06-15T11:00:00Z',
      body: 'Omg yes! That was so fun',
      isHtml: false,
      isSent: true,
    },
  ],
}

describe('ThreadView', () => {
  it('renders the thread subject', () => {
    render(<ThreadView thread={mockThread} onBack={() => {}} isLoading={false} />)
    expect(screen.getByText('Remember that time?')).toBeInTheDocument()
  })

  it('renders all messages in the thread', () => {
    render(<ThreadView thread={mockThread} onBack={() => {}} isLoading={false} />)
    expect(screen.getByText(/Hey do you remember/)).toBeInTheDocument()
    expect(screen.getByText(/Omg yes/)).toBeInTheDocument()
  })

  it('renders sender names', () => {
    render(<ThreadView thread={mockThread} onBack={() => {}} isLoading={false} />)
    expect(screen.getByText('Alice Smith')).toBeInTheDocument()
    expect(screen.getByText('Me')).toBeInTheDocument()
  })

  it('distinguishes sent and received messages by CSS class', () => {
    const { container } = render(
      <ThreadView thread={mockThread} onBack={() => {}} isLoading={false} />
    )
    const sentMessages = container.querySelectorAll('.message-sent')
    const receivedMessages = container.querySelectorAll('.message-received')
    expect(sentMessages).toHaveLength(1)
    expect(receivedMessages).toHaveLength(1)
  })

  it('shows loading state', () => {
    render(
      <ThreadView
        thread={{ id: '', subject: '', messages: [] }}
        onBack={() => {}}
        isLoading={true}
      />
    )
    expect(screen.getByText('Unfolding this conversation...')).toBeInTheDocument()
  })

  it('calls onBack when back button is clicked', async () => {
    const user = userEvent.setup()
    const onBack = vi.fn()
    render(<ThreadView thread={mockThread} onBack={onBack} isLoading={false} />)
    await user.click(screen.getByLabelText('Back to inbox'))
    expect(onBack).toHaveBeenCalledOnce()
  })

  it('sanitizes HTML email content (XSS prevention)', () => {
    const threadWithHtml: EmailThread = {
      id: 't2',
      subject: 'HTML test',
      messages: [
        {
          id: 'm1',
          from: 'test@example.com',
          to: 'me@example.com',
          date: '2012-01-01T00:00:00Z',
          body: '<p>Hello</p><script>alert("xss")</script>',
          isHtml: true,
          isSent: false,
        },
      ],
    }
    const { container } = render(
      <ThreadView thread={threadWithHtml} onBack={() => {}} isLoading={false} />
    )
    expect(container.querySelector('script')).toBeNull()
    expect(screen.getByText('Hello')).toBeInTheDocument()
  })
})
