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

export const isFounderName = (name: string) => FOUNDERS.some((f) => normalizeName(f) === normalizeName(name))

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
