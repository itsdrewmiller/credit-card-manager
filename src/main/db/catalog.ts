/**
 * Seed catalog: issuers + a starter set of popular churning card products.
 *
 * `aliases` are how the issuer/product tends to appear in the "Account Name"
 * field of a credit report. Experian usually reports issuer-level names
 * (e.g. "CHASE CARD"), so aliases skew issuer-level; the importer matches what
 * it can and leaves the exact product as a "needs info" field.
 *
 * Networks: Visa | Mastercard | Amex | Discover. AF in cents.
 */

export interface SeedProduct {
  name: string
  network?: string
  isBusiness?: boolean
  annualFeeCents?: number
  aliases?: string[]
}

export interface SeedIssuer {
  name: string
  /** Issuer-level aliases as seen on reports; applied to all its products too. */
  aliases: string[]
  products: SeedProduct[]
}

export const CATALOG: SeedIssuer[] = [
  {
    name: 'Chase',
    aliases: ['CHASE', 'CHASE CARD', 'JPMCB', 'JPMCB CARD', 'CHASE BANK'],
    products: [
      { name: 'Sapphire Preferred', network: 'Visa', annualFeeCents: 9500 },
      { name: 'Sapphire Reserve', network: 'Visa', annualFeeCents: 55000 },
      { name: 'Freedom Unlimited', network: 'Visa', annualFeeCents: 0 },
      { name: 'Freedom Flex', network: 'Mastercard', annualFeeCents: 0 },
      { name: 'United Explorer', network: 'Visa', annualFeeCents: 9500 },
      { name: 'United Quest', network: 'Visa', annualFeeCents: 25000 },
      { name: 'IHG One Rewards Premier', network: 'Mastercard', annualFeeCents: 9900 },
      { name: 'Marriott Bonvoy Boundless', network: 'Visa', annualFeeCents: 9500 },
      { name: 'Ink Business Cash', network: 'Visa', isBusiness: true, annualFeeCents: 0 },
      { name: 'Ink Business Unlimited', network: 'Visa', isBusiness: true, annualFeeCents: 0 },
      { name: 'Ink Business Preferred', network: 'Visa', isBusiness: true, annualFeeCents: 9500 }
    ]
  },
  {
    name: 'American Express',
    aliases: ['AMEX', 'AMERICAN EXPRESS', 'AMEX CARD', 'AMERICAN EXPRESS CO'],
    products: [
      { name: 'Gold Card', network: 'Amex', annualFeeCents: 32500 },
      { name: 'Platinum Card', network: 'Amex', annualFeeCents: 69500 },
      { name: 'Green Card', network: 'Amex', annualFeeCents: 15000 },
      { name: 'Blue Cash Preferred', network: 'Amex', annualFeeCents: 9500 },
      { name: 'Everyday Preferred', network: 'Amex', annualFeeCents: 9500 },
      { name: 'Delta SkyMiles Gold', network: 'Amex', annualFeeCents: 15000 },
      { name: 'Delta SkyMiles Platinum', network: 'Amex', annualFeeCents: 35000 },
      { name: 'Hilton Honors Surpass', network: 'Amex', annualFeeCents: 15000 },
      { name: 'Marriott Bonvoy Brilliant', network: 'Amex', annualFeeCents: 65000 },
      { name: 'Business Gold', network: 'Amex', isBusiness: true, annualFeeCents: 37500 },
      { name: 'Business Platinum', network: 'Amex', isBusiness: true, annualFeeCents: 69500 },
      { name: 'Blue Business Plus', network: 'Amex', isBusiness: true, annualFeeCents: 0 }
    ]
  },
  {
    name: 'Capital One',
    aliases: ['CAPITAL ONE', 'CAPITAL ONE BANK', 'CAP ONE', 'CAPITAL ONE N.A.'],
    products: [
      { name: 'Venture X', network: 'Visa', annualFeeCents: 39500 },
      { name: 'Venture Rewards', network: 'Visa', annualFeeCents: 9500 },
      { name: 'VentureOne', network: 'Visa', annualFeeCents: 0 },
      { name: 'Savor Rewards', network: 'Mastercard', annualFeeCents: 0 },
      { name: 'Quicksilver', network: 'Mastercard', annualFeeCents: 0 },
      { name: 'Spark Cash Plus', network: 'Mastercard', isBusiness: true, annualFeeCents: 15000 },
      { name: 'Venture X Business', network: 'Visa', isBusiness: true, annualFeeCents: 39500 }
    ]
  },
  {
    name: 'Citi',
    aliases: ['CITI', 'CITICARDS', 'CITIBANK', 'CITICARDS CBNA', 'CBNA'],
    products: [
      { name: 'Strata Premier', network: 'Mastercard', annualFeeCents: 9500 },
      { name: 'Double Cash', network: 'Mastercard', annualFeeCents: 0 },
      { name: 'Custom Cash', network: 'Mastercard', annualFeeCents: 0 },
      { name: 'AAdvantage Platinum Select', network: 'Mastercard', annualFeeCents: 9900 },
      { name: 'AAdvantage Business', network: 'Mastercard', isBusiness: true, annualFeeCents: 9900 }
    ]
  },
  {
    name: 'Bank of America',
    aliases: ['BANK OF AMERICA', 'BANK OF AMERICA N.A.', 'BOFA', 'BK OF AMER'],
    products: [
      { name: 'Customized Cash Rewards', network: 'Visa', annualFeeCents: 0 },
      { name: 'Travel Rewards', network: 'Visa', annualFeeCents: 0 },
      { name: 'Premium Rewards', network: 'Visa', annualFeeCents: 9500 },
      { name: 'Business Advantage Customized Cash', network: 'Visa', isBusiness: true, annualFeeCents: 0 }
    ]
  },
  {
    name: 'Wells Fargo',
    aliases: ['WELLS FARGO', 'WELLS FARGO BANK', 'WF', 'WELLS FARGO CARD'],
    products: [
      { name: 'Active Cash', network: 'Visa', annualFeeCents: 0 },
      { name: 'Autograph', network: 'Visa', annualFeeCents: 0 },
      { name: 'Autograph Journey', network: 'Visa', annualFeeCents: 9500 }
    ]
  },
  {
    name: 'U.S. Bank',
    aliases: ['US BANK', 'U.S. BANK', 'USBANK', 'US BANK N.A.'],
    products: [
      { name: 'Altitude Reserve', network: 'Visa', annualFeeCents: 40000 },
      { name: 'Altitude Connect', network: 'Visa', annualFeeCents: 0 },
      { name: 'Cash+', network: 'Visa', annualFeeCents: 0 }
    ]
  },
  {
    name: 'Barclays',
    aliases: ['BARCLAYS', 'BARCLAYS BANK DELAWARE', 'BARCLAY'],
    products: [
      { name: 'AAdvantage Aviator Red', network: 'Mastercard', annualFeeCents: 9900 },
      { name: 'JetBlue Plus', network: 'Mastercard', annualFeeCents: 9900 }
    ]
  },
  {
    name: 'Discover',
    aliases: ['DISCOVER', 'DISCOVER BANK', 'DISCOVER FINANCIAL'],
    products: [{ name: 'Discover it Cash Back', network: 'Discover', annualFeeCents: 0 }]
  },
  {
    name: 'Elan',
    aliases: ['ELAN', 'ELAN FINANCIAL', 'ELAN FINANCIAL SERVICE'],
    products: [{ name: 'Fidelity Rewards', network: 'Visa', annualFeeCents: 0 }]
  }
]
