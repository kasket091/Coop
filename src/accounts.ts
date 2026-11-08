// Who can log in, and how a typed name finds an account. No Firebase here.

export const ADMIN_EMAIL = 'admin@hilas-coop.app'
const MEMBER_DOMAIN = 'members.hilas-coop.app'

/** The 10 founding members who can be co-makers (handbook board minus Bryan, the admin, and Vincent, who left). */
export const FOUNDERS = [
  'Mark Anthony Ampo', 'Jeram Rey Tejano', 'Peter John Jose', 'Israil Parajes', 'Mark Dave Tumanda',
  'Dawn Hope Tejano', 'Maricris Jose', 'Mary Joy Tabuan', 'Chariz Parajes', 'Joyma Tumanda',
]

export const normalizeName = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase()

export const startingPassword = (name: string) => name.replace(/\s+/g, '')

/** True when the typed password is the member's starting password, ignoring capitals and spaces. */
export const looksLikeStartingPassword = (name: string, typed: string) =>
  typed.replace(/\s+/g, '').toLowerCase() === startingPassword(name).toLowerCase()

/**
 * The exact-case starting password Firebase stored. Uses the saved spelling of the name when known;
 * otherwise capitalises each word part (all 2026 names are written that way, e.g. "Era Tejano-Estremos").
 */
export function startingPasswordFor(typedName: string, savedName?: string): string {
  const name = savedName ?? typedName.trim().toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase())
  return startingPassword(name)
}

export const isFounderName =(name: string) => FOUNDERS.some((f) => normalizeName(f) === normalizeName(name))

/** Doc id in `logins/`: a hash, so the collection never lists names. */
export async function loginKey(name: string): Promise<string> {
  const bytes = new TextEncoder().encode(normalizeName(name))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Sign-in emails are random so a renamed or re-added member never collides with an old account. */
export function randomMemberEmail(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
  const bytes = crypto.getRandomValues(new Uint8Array(20))
  return `m-${[...bytes].map((b) => alphabet[b % alphabet.length]).join('')}@${MEMBER_DOMAIN}`
}

/** Bryan is the admin and a board member; he recruits, but never co-makes an over-limit loan (handbook). */
export const ADMIN_MEMBER_NAME = 'Bryan Kevin Tabuan'

/** The 11 active board members: the 10 founding co-makers plus Bryan. */
export const BOARD = [...FOUNDERS, ADMIN_MEMBER_NAME]

/** Who recruited whom (2026). Each recruit's co-maker is their recruiter. */
export const RECRUITS: Record<string, string[]> = {
  'Bryan Kevin Tabuan': ['Leobardo Tabuan', 'Isabel Tabuan'],
  'Mary Joy Tabuan': ['Kyle Kent Tabuan', 'April Rose Salo'],
  'Mark Anthony Ampo': ['Rosly Ampo', 'Evangeline Ampo'],
  'Dawn Hope Tejano': ['Susan Cabangisan', 'Ren Mark Cabangisan', 'Sarah Jean Cabangisan'],
  'Jeram Rey Tejano': ['Era Tejano-Estremos', 'Aida Tejano'],
  'Maricris Jose': ['Alexander Arcayena', 'Mary Nicole Arcayena'],
  'Peter John Jose': [],
  'Chariz Parajes': ['Nico Sabio', 'Aljem Aviola'],
  'Israil Parajes': ['Ingrid Suson', 'Paul John Suson'],
  'Mark Dave Tumanda': ['Mary Henzel Tumanda'],
  'Joyma Tumanda': ['Felipe Rebosura', 'Marifel Atkinson', 'Marc Rebosura', 'Chai Rebosura'],
}

export const recruiterOf = (name: string) =>
  Object.keys(RECRUITS).find((r) => RECRUITS[r].some((n) => normalizeName(n) === normalizeName(name)))

export const isBoardName = (name: string) => BOARD.some((b) => normalizeName(b) === normalizeName(name))
