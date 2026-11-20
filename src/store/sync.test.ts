import { describe, expect, it } from 'vitest'
import { createSeed } from '../data/seed'
import { addClient } from './actions'
import { diffDatabase, hasChanges } from './sync'

describe('diffDatabase', () => {
  it('is empty for the same state', () => {
    const db = createSeed()
    expect(hasChanges(diffDatabase(db, db))).toBe(false)
  })

  it('sends only the rows an action touched', () => {
    const db = createSeed()
    const [next, client] = addClient(db, { name: 'Test Client', type: 'Individual', phone: '1', email: '', address: '', gstin: '' } as never)
    const d = diffDatabase(db, next)
    expect(d.upserts).toEqual({ clients: [client] })
    expect(d.deletes).toEqual({})
  })

  it('detects edits and deletions', () => {
    const db = createSeed()
    const [first, second] = db.expenses
    const next = { ...db, expenses: [{ ...first, amount: first.amount + 1 }, ...db.expenses.slice(2)] }
    const d = diffDatabase(db, next)
    expect(d.upserts.expenses?.map((r) => r.id)).toEqual([first.id])
    expect(d.deletes.expenses).toEqual([second.id])
  })
})
