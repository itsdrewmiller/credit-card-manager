import { initTRPC } from '@trpc/server'
import type { DB } from '../db'

export interface Context {
  db: DB
}

// No transformer: all payloads are JSON-safe (ISO date strings, integer cents,
// plain booleans) so we avoid superjson and any client/server mismatch.
const t = initTRPC.context<Context>().create()

export const router = t.router
export const publicProcedure = t.procedure
export const mergeRouters = t.mergeRouters
export const createCallerFactory = t.createCallerFactory
