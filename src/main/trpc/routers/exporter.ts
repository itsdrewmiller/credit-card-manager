import { z } from 'zod'
import { createInsertSchema } from 'drizzle-zod'
import { router, publicProcedure } from '../trpc'
import {
  person,
  business,
  issuer,
  cardProduct,
  issuerAlias,
  pointProgram,
  productOffer,
  productBenefit,
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
  ['issuerAlias', issuerAlias],
  ['pointProgram', pointProgram],
  ['productOffer', productOffer],
  ['productBenefit', productBenefit],
  ['card', card],
  ['signupBonus', signupBonus],
  ['benefit', benefit],
  ['referral', referral]
] as const

export const SNAPSHOT_VERSION = 1

/**
 * Snapshot payload schema, derived from the Drizzle tables so it can't drift:
 * each table key maps to rows matching that table's insert shape (ids and
 * timestamps included, so relationships survive the round-trip). `.strict()`
 * makes an unknown table name a loud error instead of silently dropped data.
 */
const snapshotDataSchema = z
  .object({
    person: z.array(createInsertSchema(person)).optional(),
    business: z.array(createInsertSchema(business)).optional(),
    issuer: z.array(createInsertSchema(issuer)).optional(),
    cardProduct: z.array(createInsertSchema(cardProduct)).optional(),
    issuerAlias: z.array(createInsertSchema(issuerAlias)).optional(),
    pointProgram: z.array(createInsertSchema(pointProgram)).optional(),
    productOffer: z.array(createInsertSchema(productOffer)).optional(),
    productBenefit: z.array(createInsertSchema(productBenefit)).optional(),
    card: z.array(createInsertSchema(card)).optional(),
    signupBonus: z.array(createInsertSchema(signupBonus)).optional(),
    benefit: z.array(createInsertSchema(benefit)).optional(),
    referral: z.array(createInsertSchema(referral)).optional()
  })
  .strict()

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
    .input(z.object({ version: z.number().int(), data: snapshotDataSchema }))
    .mutation(({ ctx, input }) => {
      if (input.version !== SNAPSHOT_VERSION) {
        throw new Error(
          `Unsupported backup version ${input.version} (this app restores version ${SNAPSHOT_VERSION})`
        )
      }
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
            // Rows are validated against this table's insert schema above; the
            // cast only bridges the heterogeneous table loop.
            tx.insert(table).values(rows as never).run()
            inserted += rows.length
          }
        }
      })
      return { inserted }
    })
})
