import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { coopSummary, type Member } from './rules'
import { MySavings } from './savings'

const text = (paid: number[]) => {
  const m: Member = { id: 1, name: 'A', heads: 12, paid, interest: Array(12).fill(0), terminated: { at: 1, reason: 'x' } }
  const html = renderToStaticMarkup(<MySavings m={m} coop={coopSummary([m])} year={2026}
    termination={{ reason: 'x', unpaid: 0, saved: 18000, fee: 3600, loansDeducted: 6600, payout: 7800, stillOwed: 0 }} />)
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
}

it('a Savings Loan paid at termination shows in total savings; the payout math stays on what was deposited', () => {
  const t = text([6000, 6000, 6000, 6000, 0, 0, 0, 0, 0, 0, 0, 0])
  expect(t).toContain('Total savings ₱24,000')
  expect(t).toContain('Savings Loan paid off, now saved −₱6,000')
  expect(t).toContain('Savings at termination ₱18,000')
  expect(t).toContain('Termination payout ₱7,800')
})

it('with nothing settled the card is unchanged', () => {
  const t = text([6000, 6000, 6000, 0, 0, 0, 0, 0, 0, 0, 0, 0])
  expect(t).toContain('Total savings ₱18,000')
  expect(t).not.toContain('now saved')
})
