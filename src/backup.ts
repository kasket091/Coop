// Whole-database backups: one JSON file the admin keeps, used to restore after a clear or a mistake.

export const BACKUP_COLLECTIONS = ['members', 'founders', 'logins', 'loanRequests', 'transactions', 'settings', 'coop', 'counters'] as const
export type BackupCollection = (typeof BACKUP_COLLECTIONS)[number]
export type BackupDoc = { id: string; data: Record<string, unknown> }
export type Backup = { app: 'hilas-coop'; version: 1; exportedAt: number; collections: Partial<Record<BackupCollection, BackupDoc[]>> }

export const makeBackup = (collections: Backup['collections'], exportedAt: number): Backup =>
  ({ app: 'hilas-coop', version: 1, exportedAt, collections })

/** Reads a backup file; returns an error message instead of throwing so the screen can show it. */
export function parseBackup(text: string): Backup | { error: string } {
  let b: Backup
  try { b = JSON.parse(text) } catch { return { error: 'That file is not a backup (it could not be read).' } }
  if (b?.app !== 'hilas-coop' || b.version !== 1 || typeof b.collections !== 'object') return { error: 'That file is not a Hilas Coop backup.' }
  for (const [name, docs] of Object.entries(b.collections)) {
    const known = (BACKUP_COLLECTIONS as readonly string[]).includes(name)
    const ok = Array.isArray(docs) && docs.every((d) => typeof d?.id === 'string' && d.id && typeof d.data === 'object' && d.data)
    if (!known || !ok) return { error: 'The backup file is damaged, so it was not used.' }
  }
  return b
}

export function backupSummary(b: Backup) {
  const n = (c: BackupCollection) => b.collections[c]?.length ?? 0
  return {
    members: n('members'), loanRequests: n('loanRequests'), transactions: n('transactions'),
    total: BACKUP_COLLECTIONS.reduce((t, c) => t + n(c), 0), exportedAt: b.exportedAt,
  }
}
