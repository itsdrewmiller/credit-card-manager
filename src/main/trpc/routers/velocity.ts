import { desc } from 'drizzle-orm'
import { router, publicProcedure } from '../trpc'
import { card } from '../../db/schema'
import { personVelocity } from '../../domain/velocity'

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

  /** Rejected applications, most recent first (application strategy view). */
  rejected: publicProcedure.query(({ ctx }) => {
    const rows = ctx.db.query.card
      .findMany({ with: withRelations, orderBy: desc(card.rejectedDate) })
      .sync()
    return rows.filter((c) => c.status === 'rejected')
  })
})
