import { createCallerFactory } from '../main/trpc/trpc'
import { appRouter } from '../main/trpc/router'
import type { TrpcRequest } from '../preload'
import { openWebDatabase } from './db'

/**
 * Browser entry: build the whole backend in-process (sql.js + the same tRPC
 * router the Electron main process serves over IPC), expose it as
 * window.trpcIpc so the renderer is byte-for-byte identical, then mount the
 * app. Mutations persist the database to IndexedDB.
 */
// In the browser, pdfjs needs an explicit worker (the Electron main process
// runs it workerless). Configured lazily before the first importer call so
// the ~1 MB worker never loads unless a report is parsed.
let pdfWorkerReady: Promise<void> | undefined
function ensurePdfWorker(): Promise<void> {
  pdfWorkerReady ??= (async () => {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const workerUrl = (await import('pdfjs-dist/legacy/build/pdf.worker.mjs?url')).default
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  })()
  return pdfWorkerReady
}

async function bootstrap(): Promise<void> {
  const { db, persist } = await openWebDatabase()
  const createCaller = createCallerFactory(appRouter)

  window.trpcIpc = {
    request: async (op: TrpcRequest) => {
      if (op.path.startsWith('importer.')) await ensurePdfWorker()
      const caller = createCaller({ db }) as Record<string, unknown>
      const fn = op.path
        .split('.')
        .reduce<unknown>((obj, key) => (obj as Record<string, unknown>)?.[key], caller)
      if (typeof fn !== 'function') throw new Error(`Unknown procedure: ${op.path}`)
      const result = await (fn as (input: unknown) => Promise<unknown>)(op.input)
      if (op.type === 'mutation') persist()
      return result
    }
  }

  await import('../renderer/src/main')
}

void bootstrap()
