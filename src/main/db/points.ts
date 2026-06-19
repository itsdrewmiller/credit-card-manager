import type { DB } from './index'
import { pointProgram } from './schema'

/** Common churning currencies with default valuations (cents/point) + kind. */
export const POINT_PROGRAMS: { name: string; kind: string; cpp: number }[] = [
  { name: 'Amex MR', kind: 'transferable', cpp: 1.6 },
  { name: 'Chase UR', kind: 'transferable', cpp: 1.6 },
  { name: 'Capital One miles', kind: 'transferable', cpp: 1.6 },
  { name: 'Citi TY', kind: 'transferable', cpp: 1.6 },
  { name: 'Bilt points', kind: 'transferable', cpp: 1.6 },
  { name: 'Wells Fargo points', kind: 'transferable', cpp: 1.0 },
  { name: 'Bank of America points', kind: 'cashback', cpp: 1.0 },
  { name: 'United miles', kind: 'airline', cpp: 1.4 },
  { name: 'American miles', kind: 'airline', cpp: 1.4 },
  { name: 'Alaska miles', kind: 'airline', cpp: 1.4 },
  { name: 'Delta miles', kind: 'airline', cpp: 1.2 },
  { name: 'Southwest miles', kind: 'airline', cpp: 1.4 },
  { name: 'JetBlue points', kind: 'airline', cpp: 1.3 },
  { name: 'Avios', kind: 'airline', cpp: 1.3 },
  { name: 'Virgin points', kind: 'airline', cpp: 1.3 },
  { name: 'Aeroplan miles', kind: 'airline', cpp: 1.4 },
  { name: 'Hyatt points', kind: 'hotel', cpp: 1.7 },
  { name: 'Marriott points', kind: 'hotel', cpp: 0.7 },
  { name: 'Hilton points', kind: 'hotel', cpp: 0.5 },
  { name: 'IHG points', kind: 'hotel', cpp: 0.5 },
  { name: 'Wyndham points', kind: 'hotel', cpp: 0.9 }
]

/**
 * Idempotently seed reference point programs (by name) used to value bonuses
 * and offers. Skips any whose name already exists, so it never clobbers the
 * user's own programs/balances.
 */
export function seedPointPrograms(db: DB): number {
  const have = new Set(
    db
      .select({ name: pointProgram.name })
      .from(pointProgram)
      .all()
      .map((p) => p.name.toLowerCase())
  )
  let added = 0
  for (const p of POINT_PROGRAMS) {
    if (have.has(p.name.toLowerCase())) continue
    db.insert(pointProgram).values({ name: p.name, kind: p.kind, valuationCpp: p.cpp }).run()
    added++
  }
  return added
}
