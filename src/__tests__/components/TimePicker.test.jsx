import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TimePicker from '../../components/TimePicker'

describe('TimePicker', () => {
  it('renders with default value of 15', () => {
    render(<TimePicker onSearch={() => {}} />)
    const expectedYear = new Date().getFullYear() - 15
    expect(screen.getByText(String(expectedYear))).toBeInTheDocument()
    expect(screen.getByText('15 years ago')).toBeInTheDocument()
  })

  it('displays the correct calculated year based on slider value', () => {
    render(<TimePicker onSearch={() => {}} defaultYears={10} />)
    const expectedYear = new Date().getFullYear() - 10
    expect(screen.getByText(String(expectedYear))).toBeInTheDocument()
  })

  it('calls onSearch with the correct yearsAgo value when button is clicked', async () => {
    const onSearch = vi.fn()
    render(<TimePicker onSearch={onSearch} defaultYears={20} />)
    await userEvent.click(screen.getByText('Explore'))
    expect(onSearch).toHaveBeenCalledWith(20)
  })

  it('updates the year label when slider changes', () => {
    render(<TimePicker onSearch={() => {}} />)
    const slider = screen.getByRole('slider')
    fireEvent.change(slider, { target: { value: '5' } })
    const expectedYear = new Date().getFullYear() - 5
    expect(screen.getByText(String(expectedYear))).toBeInTheDocument()
  })
})
