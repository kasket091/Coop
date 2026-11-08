import { expect, it } from 'vitest'
import { importRows, publicSummary } from './summary'

const zeros = () => Array(12).fill(0)
const m = (uid: string, name: string, heads: number, interest = 0) => {
  const i = zeros(); i[0] = interest
  return { uid, id: 1, name, heads, paid: zeros(), interest: i }
}

it('the public summary never identifies the top borrower', () => {
  const { summary } = publicSummary([m('a', 'Ana Cruz', 12, 1000), m('b', 'Ben Uy', 2, 100)])
  expect(summary).not.toHaveProperty('topBorrowerId')
  expect(summary).not.toHaveProperty('topInterest')
  expect(JSON.stringify(summary)).not.toMatch(/Ana|Ben/)
  expect(summary.rebate).toBeCloseTo(30, 5)
  expect(summary.members).toBe(2)
})

it('the rebate goes to the top borrower only, and is cleared on everyone else', () => {
  const { rebates } = publicSummary([m('a', 'Ana Cruz', 12, 1000), m('b', 'Ben Uy', 2, 100)])
  expect(rebates).toEqual({ a: 30, b: 0 })
})

it('no interest means no rebate for anyone', () => {
  expect(publicSummary([m('a', 'Ana Cruz', 2)]).rebates).toEqual({ a: 0 })
})

it('import resumes: rows already in Firebase are skipped by name', () => {
  const sheet = [m('', 'Ana Cruz', 12), m('', 'Ben  Uy', 2), m('', 'Vincent Batutay', 0)]
  expect(importRows(sheet, ['ana cruz', 'vincent batutay']).map((r) => r.name)).toEqual(['Ben  Uy'])
})

it('terminated members are not counted as members or heads', () => {
  const { summary } = publicSummary([{ ...m('a', 'Ana Cruz', 12, 1000), terminated: { at: 1, reason: 'x' } }, m('b', 'Ben Uy', 2, 100)])
  expect(summary.members).toBe(1)
  expect(summary.totalHeads).toBe(2)
})
