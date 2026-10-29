import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseClinicState } from './store'
import { CLINIC_STATE_COLLECTIONS } from './types'

// fixtures/clinic-document.json is the single source of truth for the clinic
// document shape; the Go sidecar and Rust fallback guards run against the
// same file, so a collection added here without the others fails CI.
const fixture = JSON.parse(readFileSync(resolve(process.cwd(), '../../fixtures/clinic-document.json'), 'utf8'))

describe('clinic document shape', () => {
  it('fixture keys match CLINIC_STATE_COLLECTIONS exactly', () => {
    const keys = Object.keys(fixture)
      .filter((key) => key !== 'clinic' && key !== 'lastSyncedAt' && key !== '$comment')
      .toSorted()
    expect(keys).toEqual([...CLINIC_STATE_COLLECTIONS].toSorted())
  })

  it('accepts the canonical fixture document', () => {
    expect(parseClinicState(fixture)).not.toBeNull()
  })

  it('backfills a document missing any collection (legacy tolerance)', () => {
    for (const key of CLINIC_STATE_COLLECTIONS) {
      const legacy = { ...fixture }
      delete legacy[key]
      const parsed = parseClinicState(legacy)
      expect(parsed, `missing ${key} must backfill to []`).not.toBeNull()
      expect(parsed?.[key]).toEqual([])
    }
  })

  it('rejects a collection that is not an array', () => {
    expect(parseClinicState({ ...fixture, patients: 'nope' })).toBeNull()
  })

  it('rejects a document without a clinic', () => {
    const broken = { ...fixture }
    delete broken.clinic
    expect(parseClinicState(broken)).toBeNull()
  })

  it('rejects a non-object payload', () => {
    expect(parseClinicState(null)).toBeNull()
    expect(parseClinicState('state')).toBeNull()
    expect(parseClinicState(42)).toBeNull()
  })

  it('normalises a legacy document to the current shape', () => {
    const legacy: Record<string, unknown> = { clinic: fixture.clinic }
    for (const key of ['users', 'owners', 'patients', 'appointments', 'encounters', 'invoices']) legacy[key] = []
    const parsed = parseClinicState(legacy)
    expect(parsed).not.toBeNull()
    for (const key of CLINIC_STATE_COLLECTIONS) expect(parsed?.[key]).toEqual([])
  })
})
