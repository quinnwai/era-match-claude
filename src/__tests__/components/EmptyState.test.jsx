import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import EmptyState from '../../components/EmptyState'

describe('EmptyState', () => {
  it('shows the correct message', () => {
    render(<EmptyState />)
    expect(screen.getByText(/no emails found from that era/i)).toBeInTheDocument()
  })

  it('suggests adjusting the slider', () => {
    render(<EmptyState />)
    expect(screen.getByText(/adjust/i)).toBeInTheDocument()
  })
})
