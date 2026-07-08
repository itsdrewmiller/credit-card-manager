import type { DbLike } from '../db'
import { person, business } from '../db/schema'

/**
 * Every person is implicitly a sole proprietor (they can open business cards
 * under their own name), so creating a person also creates their sole
 * proprietorship, named "<Name> Sole Proprietor" to stay distinguishable from
 * the person in pickers. Applies to manual adds and CSV import alike; the
 * business can be renamed or deleted afterwards.
 */
export function createPersonWithSoleProp(
  db: DbLike,
  input: { name: string; notes?: string | null }
): typeof person.$inferSelect {
  const created = db.insert(person).values(input).returning().get()
  db.insert(business)
    .values({
      name: `${created.name} Sole Proprietor`,
      ownerPersonId: created.id,
      type: 'Sole Proprietor'
    })
    .run()
  return created
}
