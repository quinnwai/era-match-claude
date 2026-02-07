import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { registerSessionCleanup, endSession, removeBeforeUnloadListener } from '../session'

// Mock the gmail module's revokeToken
vi.mock('../gmail', () => ({
  revokeToken: vi.fn().mockResolvedValue(undefined),
}))

describe('Session Manager', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    removeBeforeUnloadListener()
  })

  it('registers a beforeunload listener', () => {
    const addSpy = vi.spyOn(window, 'addEventListener')
    const cleanup = vi.fn()
    registerSessionCleanup('test-token', cleanup)
    expect(addSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function))
  })

  it('endSession calls cleanup callback', async () => {
    const cleanup = vi.fn()
    registerSessionCleanup('test-token', cleanup)
    await endSession('test-token')
    expect(cleanup).toHaveBeenCalledOnce()
  })

  it('endSession removes beforeunload listener', async () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const cleanup = vi.fn()
    registerSessionCleanup('test-token', cleanup)
    await endSession('test-token')
    expect(removeSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function))
  })

  it('removeBeforeUnloadListener cleans up', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const cleanup = vi.fn()
    registerSessionCleanup('test-token', cleanup)
    removeBeforeUnloadListener()
    expect(removeSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function))
  })
})
