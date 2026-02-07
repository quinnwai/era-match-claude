import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import EmailList from '../../components/EmailList'

const mockEmails = [
  {
    id: 'msg001',
    from: { name: 'John', email: 'john@example.com' },
    subject: 'Email 1',
    date: 'Jan 1, 2011',
    snippet: 'Snippet 1',
  },
  {
    id: 'msg002',
    from: { name: 'Jane', email: 'jane@example.com' },
    subject: 'Email 2',
    date: 'Jan 2, 2011',
    snippet: 'Snippet 2',
  },
]

describe('EmailList', () => {
  it('renders the correct number of email cards', () => {
    render(
      <EmailList
        emails={mockEmails}
        onSelect={() => {}}
        onShowMore={() => {}}
        onShuffle={() => {}}
        hasMore={true}
      />
    )
    expect(screen.getByText('Email 1')).toBeInTheDocument()
    expect(screen.getByText('Email 2')).toBeInTheDocument()
  })

  it('Show Me More button calls the handler', async () => {
    const onShowMore = vi.fn()
    render(
      <EmailList
        emails={mockEmails}
        onSelect={() => {}}
        onShowMore={onShowMore}
        onShuffle={() => {}}
        hasMore={true}
      />
    )
    await userEvent.click(screen.getByText('Show Me More'))
    expect(onShowMore).toHaveBeenCalledTimes(1)
  })

  it('Shuffle button calls the handler', async () => {
    const onShuffle = vi.fn()
    render(
      <EmailList
        emails={mockEmails}
        onSelect={() => {}}
        onShowMore={() => {}}
        onShuffle={onShuffle}
        hasMore={true}
      />
    )
    await userEvent.click(screen.getByText('Shuffle'))
    expect(onShuffle).toHaveBeenCalledTimes(1)
  })

  it('renders EmptyState when email array is empty', () => {
    render(
      <EmailList
        emails={[]}
        onSelect={() => {}}
        onShowMore={() => {}}
        onShuffle={() => {}}
        hasMore={false}
      />
    )
    expect(screen.getByText(/no emails found/i)).toBeInTheDocument()
  })

  it('hides Show Me More when hasMore is false', () => {
    render(
      <EmailList
        emails={mockEmails}
        onSelect={() => {}}
        onShowMore={() => {}}
        onShuffle={() => {}}
        hasMore={false}
      />
    )
    expect(screen.queryByText('Show Me More')).not.toBeInTheDocument()
  })
})
