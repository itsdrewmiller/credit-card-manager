import { eq, and, sql, isNull } from 'drizzle-orm'
import type { DB } from '../db'
import { card, person, business } from '../db/schema'
import { CARD_STATUSES, type CardStatus } from '@shared/constants'
import { parseCsv } from './csv'
import { stripIssuerPrefix, cleanCardName, canonicalProductName } from './naming'
import { centsOrNull, normalizeNetwork, findOrCreateIssuer, findOrCreateProduct } from './shared'

function findOrCreatePerson(db: DB, name: string): number {
  const existing = db
    .select({ id: person.id })
    .from(person)
    .where(sql`lower(${person.name}) = ${name.toLowerCase()}`)
    .get()
  if (existing) return existing.id
  return db.insert(person).values({ name }).returning({ id: person.id }).get().id
}

function findOrCreateBusiness(db: DB, name: string, ownerPersonId: number): number {
  const existing = db
    .select({ id: business.id })
    .from(business)
    .where(
      and(eq(business.ownerPersonId, ownerPersonId), sql`lower(${business.name}) = ${name.toLowerCase()}`)
    )
    .get()
  if (existing) return existing.id
  return db.insert(business).values({ name, ownerPersonId }).returning({ id: business.id }).get().id
}

/** Parse a CSV status into a known CardStatus; unknown/blank -> 'open'. */
function parseStatus(s: string | undefined): CardStatus {
  const v = (s ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_')
  return (CARD_STATUSES as readonly string[]).includes(v) ? (v as CardStatus) : 'open'
}

/**
 * Find an existing held card to update rather than duplicate. A person can hold
 * several cards of the same product, so we key on the product + owner plus the
 * distinguishing detail the row carries (last4 if present, else the open date).
 * Rows without either always insert a fresh card.
 */
function findExistingCard(
  db: DB,
  productId: number,
  ownerPersonId: number | null,
  last4: string | null,
  openedDate: string | null
): number | null {
  if (last4 == null && openedDate == null) return null
  const owner = ownerPersonId == null ? isNull(card.ownerPersonId) : eq(card.ownerPersonId, ownerPersonId)
  const detail = last4 != null ? eq(card.last4, last4) : eq(card.openedDate, openedDate as string)
  const row = db
    .select({ id: card.id })
    .from(card)
    .where(and(eq(card.cardProductId, productId), owner, detail))
    .get()
  return row?.id ?? null
}

export interface CardImportResult {
  created: number
  updated: number
  total: number
}

/**
 * Import held cards from a CSV. Find-or-creates the issuer, card product, owner
 * person, and business per row, then upserts one card (idempotent on re-import
 * for rows carrying a last4 or open date — see findExistingCard).
 *
 * Columns: card_name, issuer (required); owner, business, status, network,
 * last4, annual_fee_usd, is_business, applied_date, opened_date, closed_date,
 * notes (optional).
 */
export function importCardsCsv(db: DB, text: string): CardImportResult {
  const rows = parseCsv(text)
  const required = ['card_name', 'issuer']
  if (rows.length === 0 || !required.every((c) => c in rows[0])) {
    throw new Error('CSV needs at least card_name and issuer columns')
  }

  let created = 0
  let updated = 0
  db.transaction((tx) => {
    const h = tx as unknown as DB
    for (const r of rows) {
      const name = r.card_name?.trim()
      const issuerName = r.issuer?.trim()
      if (!name || !issuerName) continue

      const isBusiness = r.is_business?.toLowerCase() === 'true'
      const network = normalizeNetwork(r.network)
      const feeCents = centsOrNull(r.annual_fee_usd)
      const issuerId = findOrCreateIssuer(h, issuerName)
      const productName = canonicalProductName(stripIssuerPrefix(cleanCardName(name), issuerName))
      const productId = findOrCreateProduct(h, issuerId, productName, isBusiness, feeCents, network)

      const ownerName = r.owner?.trim()
      const ownerPersonId = ownerName ? findOrCreatePerson(h, ownerName) : null
      const businessName = r.business?.trim()
      const businessId =
        businessName && ownerPersonId != null
          ? findOrCreateBusiness(h, businessName, ownerPersonId)
          : null

      const last4 = r.last4?.trim() || null
      const openedDate = r.opened_date?.trim() || null
      const values = {
        cardProductId: productId,
        issuerId,
        ownerPersonId,
        businessId,
        network: network ?? null,
        last4,
        annualFeeCents: feeCents,
        status: parseStatus(r.status),
        appliedDate: r.applied_date?.trim() || null,
        openedDate,
        closedDate: r.closed_date?.trim() || null,
        source: 'imported',
        notes: r.notes?.trim() || null
      }

      const existingId = findExistingCard(h, productId, ownerPersonId, last4, openedDate)
      if (existingId != null) {
        h.update(card)
          .set({ ...values, updatedAt: Date.now() })
          .where(eq(card.id, existingId))
          .run()
        updated++
      } else {
        h.insert(card).values(values).run()
        created++
      }
    }
  })
  return { created, updated, total: created + updated }
}
