import { sql } from 'drizzle-orm'
import { router, publicProcedure } from '../trpc'
import { issuer, cardProduct, person, card } from '../../db/schema'

export const systemRouter = router({
  /** Liveness + a quick snapshot to verify the DB and IPC are wired up. */
  health: publicProcedure.query(({ ctx }) => {
    const issuers = ctx.db.select({ n: sql<number>`count(*)` }).from(issuer).get()?.n ?? 0
    const products = ctx.db.select({ n: sql<number>`count(*)` }).from(cardProduct).get()?.n ?? 0
    const people = ctx.db.select({ n: sql<number>`count(*)` }).from(person).get()?.n ?? 0
    const cards = ctx.db.select({ n: sql<number>`count(*)` }).from(card).get()?.n ?? 0
    return {
      ok: true,
      counts: { issuers, products, people, cards }
    }
  })
})
