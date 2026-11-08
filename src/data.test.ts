import { describe, expect, it } from 'vitest'
import { loadMembers, parseCsv, parseMembers, toNumber } from './data'

const months = (v: string) => Array(12).fill(`"${v}"`).join(',')
const monthHeads = '"Jan","Feb","Mar","Apr","May","June","July","Aug","Sept","Oct","Nov","Dec"'
const savingsCsv = [
  `"ID","Share Holders","# Heads","Monthly Savings","Share %",${monthHeads},"TOTAL SAVINGS"`,
  `"1","Bryan Kevin Tabuan","14","7,000","4.61",${months('7,000').replace(/"7,000"$/, '""')},"77,000"`,
  `"2"," Mary Joy Tabuan ","12","6,000","3.95",${months('6,000')},"72,000"`,
  `"","","304","152,000","100",${months('152,000')},"1,678,000"`,
].join('\n')
const interestCsv = [
  `"Member Interest Collections","",${monthHeads}`,
  `"1","bryan kevin tabuan","","5,322.48","-",${Array(9).fill('""').join(',')}`,
  `"12","Vincent Batutay","","9,440",${Array(10).fill('""').join(',')}`,
  `"","MONTHLY TOTAL","","17,245.00",${Array(10).fill('""').join(',')}`,
  `"","17,245.00",${Array(12).fill('""').join(',')}`,
].join('\n')

describe('parseCsv', () => {
  it('splits quoted fields with commas inside', () => {
    expect(parseCsv('"a","1,000"\n"b",""')).toEqual([['a', '1,000'], ['b', '']])
  })
  it('unescapes doubled quotes', () => {
    expect(parseCsv('"say ""hi""","x"')).toEqual([['say "hi"', 'x']])
  })
})

describe('toNumber', () => {
  it('reads thousands separators and decimals', () => {
    expect(toNumber('6,000')).toBe(6000)
    expect(toNumber('5,322.48')).toBe(5322.48)
  })
  it('treats blank, dash and missing as 0', () => {
    expect(toNumber('')).toBe(0)
    expect(toNumber('-')).toBe(0)
    expect(toNumber(undefined)).toBe(0)
  })
})

describe('parseMembers', () => {
  const members = parseMembers(savingsCsv, interestCsv)
  it('keeps interest from people no longer on the savings tab, with 0 heads', () => {
    // their interest was collected, so it still counts toward the dividend
    expect(members[2]).toMatchObject({ name: 'Vincent Batutay', heads: 0 })
    expect(members[2].interest[1]).toBe(9440)
    expect(members[2].paid).toEqual(Array(12).fill(0))
  })
  it('reads heads and Jan–Dec payments, skipping blank rows', () => {
    expect(members.filter((m) => m.heads > 0)).toHaveLength(2)
    expect(members[0]).toMatchObject({ id: 1, name: 'Bryan Kevin Tabuan', heads: 14 })
    expect(members[0].paid[0]).toBe(7000)
    expect(members[0].paid[11]).toBe(0)
  })
  it('matches interest by name ignoring case and spaces', () => {
    expect(members[0].interest.slice(0, 3)).toEqual([0, 5322.48, 0])
    expect(members[1].name).toBe('Mary Joy Tabuan')
  })
  it('a member missing from InterestPaid has zero interest', () => {
    expect(members[1].interest).toEqual(Array(12).fill(0))
  })
  it('skips total and label rows below the table (no numeric ID)', () => {
    expect(members.map((m) => m.name)).toEqual(['Bryan Kevin Tabuan', 'Mary Joy Tabuan', 'Vincent Batutay'])
  })
  it('refuses a savings tab that is not the members table', () => {
    // gviz answers a renamed/missing tab with the FIRST tab's content, HTTP 200
    expect(() => parseMembers('"","","Mission","","SUMMARY"\n"","","x","","TOTAL HEADS"', interestCsv)).toThrow(/layout/)
  })
  it('refuses an interest tab without Jan–Dec columns', () => {
    expect(() => parseMembers(savingsCsv, '"","","Mission"\n"1","x","5"')).toThrow(/layout/)
  })
  it('refuses a members table with nobody holding heads', () => {
    expect(() => parseMembers(savingsCsv.split('\n')[0], interestCsv)).toThrow(/layout/)
  })
})

describe('loadMembers', () => {
  it('fetches both sheets and parses them', async () => {
    const fake = (async (url: string) =>
      new Response(url.includes('InterestPaid') ? interestCsv : savingsCsv)) as unknown as typeof fetch
    expect(await loadMembers(fake)).toHaveLength(3)
  })
  it('reads room for new members (rows to 80), pins one header row, and times out', async () => {
    const calls: { url: string; init?: RequestInit }[] = []
    const fake = (async (url: string, init?: RequestInit) => {
      calls.push({ url, init })
      return new Response(url.includes('InterestPaid') ? interestCsv : savingsCsv)
    }) as unknown as typeof fetch
    await loadMembers(fake)
    expect(calls.map((c) => c.url.match(/range=([^&]+)/)?.[1]).sort()).toEqual(['A1:N80', 'A1:R80'])
    expect(calls.every((c) => c.url.includes('headers=1'))).toBe(true)
    expect(calls.every((c) => c.init?.signal instanceof AbortSignal)).toBe(true)
  })
  it('throws when the sheet is unreachable', async () => {
    const fake = (async () => new Response('nope', { status: 500 })) as unknown as typeof fetch
    await expect(loadMembers(fake)).rejects.toThrow()
  })
})
