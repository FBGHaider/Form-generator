export type ShareOutcome = 'shared' | 'downloaded' | 'cancelled'

/**
 * Hand files to the user. On iPhone this opens the share sheet, so they can
 * be emailed (Mail), saved to Files / iCloud Drive, printed or sent on. Where
 * sharing files is not supported, they are downloaded instead.
 */
export async function shareFiles(files: { blob: Blob; name: string }[], title?: string): Promise<ShareOutcome> {
  const list = files.map((f) => new File([f.blob], f.name, { type: f.blob.type }))
  if (navigator.canShare?.({ files: list })) {
    try {
      await navigator.share({ files: list, title: title ?? list[0]?.name })
      return 'shared'
    } catch (e) {
      // Closing the share sheet is not an error.
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled'
      // Otherwise fall through to a plain download.
    }
  }
  for (const f of list) {
    const url = URL.createObjectURL(f)
    const a = document.createElement('a')
    a.href = url
    a.download = f.name
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }
  return 'downloaded'
}

export async function shareFile(blob: Blob, fileName: string): Promise<ShareOutcome> {
  return shareFiles([{ blob, name: fileName }])
}
