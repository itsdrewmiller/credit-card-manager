import { desc } from 'drizzle-orm'
import { router, publicProcedure } from '../trpc'
import { card } from '../../db/schema'
import { personVelocity, businessVelocity } from '../../domain/velocity'

const withRelations = {
  product: { with: { issuer: true } },
  owner: true,
  business: true
} as const

export const velocityRouter = router({
  /** 5/24 status for every person, plus their contributing cards. */
  byPerson: publicProcedure.query(({ ctx }) => {
    const people = ctx.db.query.person.findMany().sync()
    const cards = ctx.db.query.card.findMany({ with: withRelations }).sync()

    return people.map((p) => {
      const theirs = cards.filter((c) => c.ownerPersonId === p.id)
      const v = personVelocity(theirs)
      return { personId: p.id, name: p.name, ...v }
    })
  }),

  /** Application pace per business: 12-month count + most recent cards. */
  byBusiness: publicProcedure.query(({ ctx }) => {
    const businesses = ctx.db.query.business.findMany({ with: { owner: true } }).sync()
    const cards = ctx.db.query.card.findMany({ with: withRelations }).sync()

    return businesses.map((b) => {
      const theirs = cards.filter((c) => c.businessId === b.id)
      const v = businessVelocity(theirs)
      return { businessId: b.id, name: b.name, ownerName: b.owner?.name ?? null, ...v }
    })
  }),

  /** Rejected applications, most recent first (application strategy view). */
  rejected: publicProcedure.query(({ ctx }) => {
    const rows = ctx.db.query.card
      .findMany({ with: withRelations, orderBy: desc(card.rejectedDate) })
      .sync()
    return rows.filter((c) => c.status === 'rejected')
  })
})
