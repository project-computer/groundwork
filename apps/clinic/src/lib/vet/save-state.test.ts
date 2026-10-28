import { afterEach, describe, expect, it, vi } from 'vitest'
import { saveState } from './store'
import { seedState } from './seed'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('saveState error reporting', () => {
  it('reports when the browser store refuses the write', () => {
    const onResult = vi.fn()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })
    saveState(seedState, onResult)
    expect(onResult).toHaveBeenCalledWith('quota exceeded')
  })

  it('reports success with null', () => {
    const onResult = vi.fn()
    saveState(seedState, onResult)
    expect(onResult).toHaveBeenCalledWith(null)
  })
})
