import { z } from 'zod'
import { eq, asc } from 'drizzle-orm'
import { router, publicProcedure } from '../trpc'
import { issuer, cardProduct } from '../../db/schema'

const productInput = z.object({
  issuerId: z.number().int(),
  name: z.string().min(1),
  network: z.string().nullish(),
  isBusiness: z.boolean().default(false),
  defaultAnnualFeeCents: z.number().int().nullish(),
  defaultCashbackPct: z.number().nullish(),
  reportsToPersonal: z.boolean().optional(),
  notes: z.string().nullish()
})

export const issuersRouter = router({
  list: publicProcedure.query(({ ctx }) =>
    ctx.db.select().from(issuer).orderBy(asc(issuer.name)).all()
  ),
  create: publicProcedure
    .input(z.object({ name: z.string().min(1) }))
    .mutation(({ ctx, input }) =>
      ctx.db.insert(issuer).values(input).returning().get()
    )
})

export const productsRouter = router({
  list: publicProcedure.query(({ ctx }) =>
    ctx.db.query.cardProduct.findMany({
      with: { issuer: true },
      orderBy: asc(cardProduct.name)
    }).sync()
  ),

  /** Flattened { id, label, issuerId, isBusiness } for dropdowns. */
  listForSelect: publicProcedure.query(({ ctx }) => {
    const rows = ctx.db.query.cardProduct.findMany({ with: { issuer: true } }).sync()
    return rows
      .map((p) => ({
        id: p.id,
        label: `${p.issuer?.name ?? '?'} — ${p.name}`,
        issuerId: p.issuerId,
        isBusiness: p.isBusiness,
        network: p.network,
        defaultAnnualFeeCents: p.defaultAnnualFeeCents
      }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }),

  create: publicProcedure.input(productInput).mutation(({ ctx, input }) =>
    ctx.db.insert(cardProduct).values(input).returning().get()
  ),

  update: publicProcedure
    .input(productInput.partial().extend({ id: z.number().int() }))
    .mutation(({ ctx, input }) => {
      const { id, ...rest } = input
      return ctx.db
        .update(cardProduct)
        .set({ ...rest, updatedAt: Date.now() })
        .where(eq(cardProduct.id, id))
        .returning()
        .get()
    }),

  delete: publicProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(({ ctx, input }) => {
      ctx.db.delete(cardProduct).where(eq(cardProduct.id, input.id)).run()
      return { id: input.id }
    })
})
