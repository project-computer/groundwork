import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadState, saveState } from '../persistence'
import { seedState } from '../seed'

afterEach(() => {
  vi.restoreAllMocks()
  window.localStorage.clear()
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

describe('loadState (web adapter)', () => {
  it('returns the stored document', async () => {
    window.localStorage.setItem('clinicbook:state:v1', JSON.stringify(seedState))
    const loaded = await loadState()
    expect(loaded?.clinic.id).toBe(seedState.clinic.id)
    expect(loaded?.patients).toHaveLength(seedState.patients.length)
  })

  it('returns null when nothing is stored', async () => {
    await expect(loadState()).resolves.toBeNull()
  })

  it('returns null for corrupt JSON', async () => {
    window.localStorage.setItem('clinicbook:state:v1', '{not json')
    await expect(loadState()).resolves.toBeNull()
  })

  it('returns null for a foreign payload', async () => {
    window.localStorage.setItem('clinicbook:state:v1', JSON.stringify({ hello: 'world' }))
    await expect(loadState()).resolves.toBeNull()
  })

  it('backfills collections a legacy document is missing', async () => {
    const legacy = {
      clinic: seedState.clinic,
      users: seedState.users,
      owners: seedState.owners,
      patients: seedState.patients,
      appointments: seedState.appointments,
      encounters: seedState.encounters,
      invoices: seedState.invoices,
    }
    window.localStorage.setItem('clinicbook:state:v1', JSON.stringify(legacy))
    const loaded = await loadState()
    expect(loaded?.vaccinations).toEqual([])
    expect(loaded?.outbox).toEqual([])
  })
})
