import { describe, expect, it } from 'vitest'
import {
  ADMIN_EMAIL, FOUNDERS, isFounderName, loginKey, looksLikeStartingPassword, normalizeName, randomMemberEmail, startingPassword,
  startingPasswordFor,
} from './accounts'

describe('names and passwords', () => {
  it('starting password is the name with no spaces, case kept', () => {
    expect(startingPassword('Mark Dave  Tumanda')).toBe('MarkDaveTumanda')
  })
  it('normalizes names for lookup', () => {
    expect(normalizeName(' Mark  Dave TUMANDA ')).toBe('mark dave tumanda')
  })
  it('login key is the same for differently typed names', async () => {
    const a = await loginKey('Mark Dave Tumanda')
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(await loginKey('  mark   dave TUMANDA')).toBe(a)
    expect(await loginKey('Joyma Tumanda')).not.toBe(a)
  })
  it('member sign-in emails are random, not built from names', () => {
    const e = randomMemberEmail()
    expect(e).toMatch(/^m-[a-z0-9]{20}@members\.hilas-coop\.app$/)
    expect(randomMemberEmail()).not.toBe(e)
  })
  it('admin email is fixed', () => expect(ADMIN_EMAIL).toBe('admin@hilas-coop.app'))
})

describe('starting password in any letter case', () => {
  it('recognises the starting password typed in lowercase or with spaces', () => {
    expect(looksLikeStartingPassword('Mark Dave Tumanda', 'markdavetumanda')).toBe(true)
    expect(looksLikeStartingPassword('mark dave tumanda', 'Mark Dave Tumanda')).toBe(true)
    expect(looksLikeStartingPassword('Mark Dave Tumanda', 'something-else')).toBe(false)
  })
  it('rebuilds the exact starting password from a typed name', () => {
    expect(startingPasswordFor('mark dave tumanda')).toBe('MarkDaveTumanda')
    expect(startingPasswordFor('era tejano-estremos')).toBe('EraTejano-Estremos')
    expect(startingPasswordFor('mark dave tumanda', 'Mark Dave Tumanda')).toBe('MarkDaveTumanda')
    expect(startingPasswordFor('juan dela cruz', 'Juan dela Cruz')).toBe('JuandelaCruz')
  })
})

describe('founding co-makers', () => {
  it('has the 10 founding members (Bryan and Vincent excluded)', () => {
    expect(FOUNDERS).toHaveLength(10)
    expect(isFounderName('jeram rey tejano')).toBe(true)
    expect(isFounderName('Bryan Kevin Tabuan')).toBe(false)
    expect(isFounderName('Vincent Batutay')).toBe(false)
  })
})
