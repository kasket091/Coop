import { expect, it } from 'vitest'
import { BACKUP_COLLECTIONS, backupSummary, makeBackup, parseBackup } from './backup'

const sample = makeBackup({
  members: [{ id: 'u1', data: { name: 'Ana', paid: [6000], terminated: { at: 1, reason: 'x' } } }],
  loanRequests: [{ id: 'r1', data: { amount: 5000, comakers: { u2: { name: 'B', status: 'pending' } } } }],
  transactions: [{ id: 't1', data: { kind: 'savings', amount: 6000 } }, { id: 't2', data: { kind: 'interest', amount: 80 } }],
}, 1000)

it('covers every collection the app uses', () => {
  expect(BACKUP_COLLECTIONS).toEqual(['members', 'founders', 'logins', 'loanRequests', 'transactions', 'settings', 'coop', 'counters', 'notes'])
})

it('a backup round-trips through a file unchanged', () => {
  const back = parseBackup(JSON.stringify(sample))
  expect(back).toEqual(sample)
})

it('summarises what a backup holds', () => {
  expect(backupSummary(sample)).toEqual({ members: 1, loanRequests: 1, transactions: 2, total: 4, exportedAt: 1000 })
})

it('refuses a file that is not a Hilas backup', () => {
  expect(parseBackup('not json')).toMatchObject({ error: expect.stringMatching(/not a backup/i) })
  expect(parseBackup(JSON.stringify({ hello: 1 }))).toMatchObject({ error: expect.stringMatching(/not a Hilas Coop backup/i) })
  expect(parseBackup(JSON.stringify({ ...sample, collections: { members: [{ nope: 1 }] } }))).toMatchObject({ error: expect.stringMatching(/damaged/i) })
})
