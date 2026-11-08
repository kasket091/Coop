import { expect, it } from 'vitest'
import { peso } from './format'

it('shows whole pesos without centavos', () => expect(peso(6000)).toBe('₱6,000'))
it('shows centavos when present, rounded to 2 places', () => expect(peso(1474.7649)).toBe('₱1,474.76'))
it('keeps the sign on negatives', () => expect(peso(-500)).toBe('-₱500'))
