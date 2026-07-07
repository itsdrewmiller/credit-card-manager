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
async function bootstrap(): Promise<void> {
  const { db, persist } = await openWebDatabase()
  const createCaller = createCallerFactory(appRouter)

  window.trpcIpc = {
    request: async (op: TrpcRequest) => {
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
