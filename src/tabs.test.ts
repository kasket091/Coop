import { expect, it } from 'vitest'
import { quoteText, termOptions } from './tabs'

it('loan months stop at December 15 (8 Nov → 1 month; regular closed)', () => {
  expect(termOptions('flex', new Date(2026, 10, 8), 2026)).toEqual([1])
  expect(termOptions('regular', new Date(2026, 10, 8), 2026)).toEqual([])
})
it('in March every regular term fits; appliance starts at 2 months', () => {
  expect(termOptions('regular', new Date(2026, 2, 3), 2026)).toEqual([2, 3, 6])
  expect(termOptions('appliance', new Date(2026, 8, 1), 2026)).toEqual([2, 3])
})
it('after the deadline nothing is offered', () => {
  expect(termOptions('flex', new Date(2026, 10, 20), 2026)).toEqual([])
})
it('quotes read in pesos', () => {
  expect(quoteText('regular', 20000, 3)).toBe('₱7,766.67 a month for 3 months, ₱23,300 total')
  expect(quoteText('flex', 5000, 1)).toBe('₱5,400 total if interest is paid monthly (1 month)')
})
