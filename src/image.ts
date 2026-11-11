const LIMIT = 900_000 // characters of data URL; the paymentProofs rule allows under 900,000

/**
 * A payment screenshot shrunk on the phone to at most `max` px on its long side, as a JPEG data URL small enough to
 * keep in the database (about 100–200 KB). Lowers the quality for a large photo; refuses what still doesn't fit.
 */
export async function shrinkImage(file: File, max = 1000): Promise<string> {
  const unreadable = new Error("That image couldn't be read. Send a screenshot instead.")
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    await new Promise((ok, bad) => { img.onload = ok; img.onerror = bad; img.src = url })
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.naturalWidth * scale)
    canvas.height = Math.round(img.naturalHeight * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx || !canvas.width) throw unreadable
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    for (const q of [0.7, 0.55, 0.4]) {
      const out = canvas.toDataURL('image/jpeg', q)
      if (out.length < LIMIT) return out
    }
    throw new Error('That image is too large. Send a screenshot instead.')
  } catch (e) {
    throw e instanceof Error && e.message.startsWith('That image') ? e : unreadable
  } finally {
    URL.revokeObjectURL(url)
  }
}
