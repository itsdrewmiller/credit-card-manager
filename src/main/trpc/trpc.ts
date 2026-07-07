import { initTRPC } from '@trpc/server'
import type { DB } from '../db'

export interface Context {
  db: DB
}

// No transformer: all payloads are JSON-safe (ISO date strings, integer cents,
// plain booleans) so we avoid superjson and any client/server mismatch.
// allowOutsideOfServer: the web/mobile build runs this "server" inside the
// browser by design (sql.js backend, same router, no network).
const t = initTRPC.context<Context>().create({ allowOutsideOfServer: true })

export const router = t.router
export const publicProcedure = t.procedure
export const createCallerFactory = t.createCallerFactory
