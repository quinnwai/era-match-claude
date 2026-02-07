import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import LoadingState from '../../components/LoadingState'

describe('LoadingState', () => {
  it('renders 3 skeleton placeholders', () => {
    const { container } = render(<LoadingState />)
    const skeletons = container.querySelectorAll('.animate-pulse')
    expect(skeletons).toHaveLength(3)
  })
})
