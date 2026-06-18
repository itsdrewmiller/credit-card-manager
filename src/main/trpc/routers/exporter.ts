import { z } from 'zod'
import { router, publicProcedure } from '../trpc'
import {
  person,
  business,
  issuer,
  cardProduct,
  cardProductAlias,
  pointProgram,
  card,
  signupBonus,
  benefit,
  referral
} from '../../db/schema'

/** Parent-first order so inserts satisfy FKs; reverse it to delete. */
const TABLES = [
  ['person', person],
  ['business', business],
  ['issuer', issuer],
  ['cardProduct', cardProduct],
  ['cardProductAlias', cardProductAlias],
  ['pointProgram', pointProgram],
  ['card', card],
  ['signupBonus', signupBonus],
  ['benefit', benefit],
  ['referral', referral]
] as const

export const SNAPSHOT_VERSION = 1

export const exporterRouter = router({
  /** Full database snapshot: every row of every table, plus metadata. */
  snapshot: publicProcedure.query(({ ctx }) => {
    const data: Record<string, unknown[]> = {}
    for (const [name, table] of TABLES) {
      data[name] = ctx.db.select().from(table).all()
    }
    return { version: SNAPSHOT_VERSION, exportedAt: new Date().toISOString(), data }
  }),

  /**
   * Restore from a JSON snapshot: wipes all tables and re-inserts the snapshot
   * rows (preserving ids/relationships). Destructive — the UI confirms first.
   */
  restore: publicProcedure
    .input(z.object({ version: z.number(), data: z.record(z.array(z.record(z.any()))) }))
    .mutation(({ ctx, input }) => {
      let inserted = 0
      ctx.db.transaction((tx) => {
        // Delete children first.
        for (const [name, table] of [...TABLES].reverse()) {
          void name
          tx.delete(table).run()
        }
        // Insert parents first.
        for (const [name, table] of TABLES) {
          const rows = input.data[name]
          if (rows && rows.length > 0) {
            tx.insert(table).values(rows as never).run()
            inserted += rows.length
          }
        }
      })
      return { inserted }
    })
})
