import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { YearPicker } from '../YearPicker'

describe('YearPicker', () => {
  const defaultProps = {
    availableYears: [2024, 2023, 2022, 2021, 2020],
    onSelectYear: vi.fn(),
    onSignOut: vi.fn(),
    isLoading: false,
  }

  it('renders available years as buttons', () => {
    render(<YearPicker {...defaultProps} />)
    for (const year of defaultProps.availableYears) {
      expect(screen.getByText(year.toString())).toBeInTheDocument()
    }
  })

  it('calls onSelectYear when a year is clicked', async () => {
    const user = userEvent.setup()
    const onSelectYear = vi.fn()
    render(<YearPicker {...defaultProps} onSelectYear={onSelectYear} />)
    await user.click(screen.getByText('2022'))
    expect(onSelectYear).toHaveBeenCalledWith(2022)
  })

  it('shows loading state when scanning mailbox', () => {
    render(<YearPicker {...defaultProps} availableYears={[]} isLoading={true} />)
    expect(screen.getByText('Scanning your mailbox...')).toBeInTheDocument()
  })

  it('renders the title', () => {
    render(<YearPicker {...defaultProps} />)
    expect(screen.getByText('Choose a year to revisit')).toBeInTheDocument()
  })

  it('calls onSignOut when sign out button is clicked', async () => {
    const user = userEvent.setup()
    const onSignOut = vi.fn()
    render(<YearPicker {...defaultProps} onSignOut={onSignOut} />)
    await user.click(screen.getByText('Sign Out'))
    expect(onSignOut).toHaveBeenCalledOnce()
  })
})
