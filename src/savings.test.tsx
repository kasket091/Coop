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

it('the card: total savings, 20% of it as the fee, the loans paid from savings, and what is left', () => {
  // 18,000 deposited + a 6,000 Savings Loan paid from savings at termination = 24,000 saved
  const t = text([6000, 6000, 6000, 6000, 0, 0, 0, 0, 0, 0, 0, 0])
  expect(t).toContain('Total savings ₱24,000')
  expect(t).toContain('Less 20% termination fee −₱4,800')
  expect(t).toContain('now closed) −₱6,600')
  expect(t).toContain('Termination payout ₱12,600')
})

it("the user's example: 60,000 saved, 12,000 fee", () => {
  const t = text(Array(10).fill(6000).concat([0, 0]))
  expect(t).toContain('Total savings ₱60,000')
  expect(t).toContain('Less 20% termination fee −₱12,000')
  expect(t).toContain('Termination payout ₱41,400')
})
