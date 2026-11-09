// The coop handbook PDF in Firebase Storage: one file, replaced by each upload. Loaded only when a screen needs it.
import { getDownloadURL, getMetadata, getStorage, ref, uploadBytes } from 'firebase/storage'
import { app } from './firebase'
import { handbookProblem, type HandbookInfo } from './handbook'

const storage = getStorage(app)
storage.maxOperationRetryTime = 10_000 // give up after 10 s instead of 2 minutes, so the screen can say so
const file = () => ref(storage, 'handbook/handbook.pdf')

/** The current handbook, or null when none has been uploaded. */
export async function handbookInfo(): Promise<HandbookInfo | null> {
  try {
    const r = file()
    const [url, meta] = await Promise.all([getDownloadURL(r), getMetadata(r)])
    return { url, name: meta.customMetadata?.originalName ?? 'handbook.pdf', size: meta.size, updated: Date.parse(meta.updated) }
  } catch (e) {
    if ((e as { code?: string }).code === 'storage/object-not-found') return null
    throw e
  }
}

export async function uploadHandbook(f: File): Promise<void> {
  const problem = handbookProblem(f)
  if (problem) throw new Error(problem)
  if (!navigator.onLine) throw new Error("You're offline, so nothing was uploaded. Try again when you're connected.")
  await uploadBytes(file(), f, {
    contentType: 'application/pdf',
    // tapping the link saves the file under a clear name instead of opening "handbook.pdf"
    contentDisposition: 'attachment; filename="HILAS-Coop-Handbook.pdf"',
    customMetadata: { originalName: f.name },
  })
}
