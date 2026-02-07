import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import EmailViewer from '../../components/EmailViewer'

const mockEmailHtml = {
  id: 'msg001',
  from: { name: 'John Doe', email: 'john@example.com' },
  to: 'jane@example.com',
  date: 'March 14, 2011 at 3:42 PM',
  subject: 'Hey there!',
  bodyHtml: '<h1>Hello!</h1>',
  bodyText: 'Hello!',
}

const mockEmailText = {
  id: 'msg002',
  from: { name: 'Alice', email: 'alice@example.com' },
  to: 'bob@example.com',
  date: 'Jul 20, 2011',
  subject: 'Plain text only',
  bodyHtml: null,
  bodyText: 'This is plain text content.',
}

describe('EmailViewer', () => {
  it('renders all metadata fields', () => {
    render(<EmailViewer email={mockEmailHtml} onClose={() => {}} />)
    expect(screen.getByText('Hey there!')).toBeInTheDocument()
    expect(screen.getByText(/John Doe/)).toBeInTheDocument()
    expect(screen.getByText(/jane@example.com/)).toBeInTheDocument()
    expect(screen.getByText(/March 14, 2011/)).toBeInTheDocument()
  })

  it('creates an iframe with srcdoc set to HTML body', () => {
    render(<EmailViewer email={mockEmailHtml} onClose={() => {}} />)
    const iframe = screen.getByTitle('Email content')
    expect(iframe).toBeInTheDocument()
    expect(iframe).toHaveAttribute('srcdoc', '<h1>Hello!</h1>')
  })

  it('iframe has the correct sandbox attribute', () => {
    render(<EmailViewer email={mockEmailHtml} onClose={() => {}} />)
    const iframe = screen.getByTitle('Email content')
    expect(iframe).toHaveAttribute('sandbox', 'allow-same-origin')
  })

  it('falls back to plain text when bodyHtml is null', () => {
    render(<EmailViewer email={mockEmailText} onClose={() => {}} />)
    expect(screen.queryByTitle('Email content')).not.toBeInTheDocument()
    expect(screen.getByText('This is plain text content.')).toBeInTheDocument()
  })

  it('back button calls the close handler', async () => {
    const onClose = vi.fn()
    render(<EmailViewer email={mockEmailHtml} onClose={onClose} />)
    await userEvent.click(screen.getByText(/back to list/i))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
