/** Extract text items from a PDF buffer using pdfjs (Node, no worker). */
export async function extractTextItems(data: Uint8Array): Promise<string[]> {
  // Dynamic import so this works whether the main bundle is CJS or ESM.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true, isEvalSupported: false }).promise
  const items: string[] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const tc = await page.getTextContent()
    for (const it of tc.items as Array<{ str?: string }>) {
      const s = (it.str ?? '').trim()
      if (s) items.push(s)
    }
  }
  return items
}
