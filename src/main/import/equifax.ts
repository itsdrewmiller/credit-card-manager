/**
 * Parse the "Credit Accounts" section of an Equifax credit report (from
 * extracted text items). Each account is a run of "Label:" / value pairs
 * anchored by "Date Reported:". The creditor name and its address sit
 * immediately before that anchor; the block ends at the "Payment History" grid.
 *
 * Equifax exposes the last 4 of the account number (e.g. "*6720"), which we
 * keep — unlike some bureaus that mask the suffix.
 */

export interface ParsedTradeline {
  creditorName: string
  accountType: string | null
  responsibilityRaw: string | null
  /** Normalized to our enum. */
  responsibility: 'authorized_user' | 'individual'
  openedDate: string | null // ISO
  closedDate: string | null // ISO, when the report shows a Date Closed
  statusRaw: string | null
  /** Normalized to our card status. */
  status: 'open' | 'closed'
  creditLimitCents: number | null
  accountNumberMask: string | null // e.g. "*6720"
  last4: string | null // e.g. "6720"
  isCreditCard: boolean
}

/** Labels whose immediately-following item is the value (without the "| "). */
const LABELS = new Set([
  'Date Reported:',
  'Balance:',
  'Account Number:',
  'Owner:',
  'Credit Limit:',
  'High Credit:',
  'Loan/Account Type:',
  'Status:',
  'Date Opened:',
  'Date Closed:',
  'Date of Last Payment:',
  'Terms Frequency:'
])

const BLOCK_TERMINATOR = 'Payment History'

/** Items that are page header/footer noise, not creditor names. */
function isNoise(s: string): boolean {
  return (
    /^Page \d+ of \d+$/.test(s) ||
    /^Confirmation #/.test(s) ||
    /^Prepared for:/.test(s) ||
    /^Date: /.test(s) ||
    /-EFX-/.test(s) ||
    s === 'Credit Accounts' ||
    s.endsWith(':')
  )
}

/** Strip the two-column "| " prefix some labels carry. */
function norm(s: string): string {
  return s.replace(/^\|\s*/, '').trim()
}

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

function lastFour(mask: string | undefined): string | null {
  if (!mask) return null
  const digits = mask.replace(/\D/g, '')
  return digits.length >= 4 ? digits.slice(-4) : digits || null
}

function normResponsibility(raw: string | null): 'authorized_user' | 'individual' {
  if (raw && /authorized/i.test(raw)) return 'authorized_user'
  return 'individual'
}

/** Build the Label -> value map for one account block (up to Payment History). */
function parseBlock(block: string[]): Map<string, string> {
  const fields = new Map<string, string>()
  for (let i = 0; i < block.length; i++) {
    const tok = norm(block[i])
    if (tok === BLOCK_TERMINATOR) break
    if (LABELS.has(tok) && !fields.has(tok)) {
      const value = block[i + 1] != null ? norm(block[i + 1]) : ''
      if (value && !LABELS.has(value)) fields.set(tok, value)
    }
  }
  return fields
}

/** Equifax suffixes closed/paid accounts (e.g. "CHASE CARD - Closed"); drop it. */
function cleanCreditor(name: string): string {
  return name.replace(/\s*-\s*(Closed|Paid|Transferred|Inactive)\s*$/i, '').trim()
}

/** Find the creditor name for a block: the non-noise line just above the address. */
function findCreditor(items: string[], anchor: number): string {
  // Typically: creditor (anchor-2), address (anchor-1), "Date Reported:" (anchor).
  for (let j = anchor - 2; j >= anchor - 8 && j >= 0; j--) {
    const s = items[j]?.trim()
    if (s && !isNoise(s)) return cleanCreditor(s)
  }
  return cleanCreditor(items[anchor - 2]?.trim() ?? 'Unknown')
}

export function parseEquifaxAccounts(items: string[]): ParsedTradeline[] {
  const anchors: number[] = []
  items.forEach((s, i) => {
    if (norm(s) === 'Date Reported:') anchors.push(i)
  })

  const tradelines: ParsedTradeline[] = []
  for (let k = 0; k < anchors.length; k++) {
    const start = anchors[k]
    const end = k + 1 < anchors.length ? anchors[k + 1] : items.length
    const fields = parseBlock(items.slice(start, end))

    const accountType = fields.get('Loan/Account Type:') ?? null
    const statusRaw = fields.get('Status:') ?? null
    const responsibilityRaw = fields.get('Owner:') ?? null
    const dateClosed = parseUsDate(fields.get('Date Closed:'))
    const mask = fields.get('Account Number:') ?? null

    tradelines.push({
      creditorName: findCreditor(items, start),
      accountType,
      responsibilityRaw,
      responsibility: normResponsibility(responsibilityRaw),
      openedDate: parseUsDate(fields.get('Date Opened:')),
      closedDate: dateClosed,
      statusRaw,
      status: dateClosed || /closed|paid/i.test(statusRaw ?? '') ? 'closed' : 'open',
      creditLimitCents: parseMoneyCents(fields.get('Credit Limit:')),
      accountNumberMask: mask,
      last4: lastFour(mask ?? undefined),
      isCreditCard: accountType != null && /credit card|charge/i.test(accountType)
    })
  }
  return tradelines
}
