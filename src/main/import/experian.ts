/**
 * Parse the Accounts section of an Experian credit report (from extracted text
 * items). Accounts appear as label/value pairs delimited by "Account Name".
 * Field order varies slightly between accounts, so we look up by label rather
 * than position, and stop each block at the payment-history table.
 */

export interface ParsedTradeline {
  creditorName: string
  accountType: string | null
  responsibilityRaw: string | null
  /** Normalized to our enum: 'authorized_user' | 'individual'. */
  responsibility: 'authorized_user' | 'individual'
  openedDate: string | null // ISO
  statusRaw: string | null
  /** Normalized to our card status. */
  status: 'open' | 'closed'
  creditLimitCents: number | null
  accountNumberMask: string | null
  isCreditCard: boolean
}

/** Labels whose immediately-following item is the value. */
const LABELS = new Set([
  'Account Name',
  'Account Number',
  'Balance',
  'Balance Updated',
  'Account Type',
  'Responsibility',
  'Interest Type',
  'Date Opened',
  'Status',
  'Status Updated',
  'Recent Payment',
  'Monthly Payment',
  'Credit Limit',
  'Highest Balance',
  'Terms'
])

const BLOCK_TERMINATORS = new Set(['Payment History', 'Balance Histories'])

function parseUsDate(s: string | undefined): string | null {
  if (!s) return null
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  const [, mm, dd, yyyy] = m
  return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`
}

function parseMoneyCents(s: string | undefined): number | null {
  if (!s) return null
  const n = Number(s.replace(/[$,\s]/g, ''))
  return Number.isFinite(n) ? Math.round(n * 100) : null
}

function normResponsibility(raw: string | null): 'authorized_user' | 'individual' {
  if (raw && /authorized/i.test(raw)) return 'authorized_user'
  return 'individual'
}

function normStatus(raw: string | null): 'open' | 'closed' {
  if (raw && /closed|paid|transferred/i.test(raw)) return 'closed'
  return 'open'
}

/** Build the label->value map for one account block. */
function parseBlock(block: string[]): Map<string, string> {
  const fields = new Map<string, string>()
  for (let i = 0; i < block.length; i++) {
    const tok = block[i]
    if (BLOCK_TERMINATORS.has(tok)) break
    if (LABELS.has(tok) && !fields.has(tok)) {
      const value = block[i + 1]
      if (value != null && !LABELS.has(value)) fields.set(tok, value)
    }
  }
  return fields
}

export function parseExperianAccounts(items: string[]): ParsedTradeline[] {
  const starts: number[] = []
  items.forEach((s, i) => {
    if (s === 'Account Name') starts.push(i)
  })

  const tradelines: ParsedTradeline[] = []
  for (let k = 0; k < starts.length; k++) {
    const start = starts[k]
    const end = k + 1 < starts.length ? starts[k + 1] : items.length
    const fields = parseBlock(items.slice(start, end))

    const creditorName = fields.get('Account Name')
    if (!creditorName) continue

    const accountType = fields.get('Account Type') ?? null
    const responsibilityRaw = fields.get('Responsibility') ?? null
    const statusRaw = fields.get('Status') ?? null

    tradelines.push({
      creditorName,
      accountType,
      responsibilityRaw,
      responsibility: normResponsibility(responsibilityRaw),
      openedDate: parseUsDate(fields.get('Date Opened')),
      statusRaw,
      status: normStatus(statusRaw),
      creditLimitCents: parseMoneyCents(fields.get('Credit Limit')),
      accountNumberMask: fields.get('Account Number') ?? null,
      isCreditCard: accountType != null && /credit card|charge/i.test(accountType)
    })
  }
  return tradelines
}
