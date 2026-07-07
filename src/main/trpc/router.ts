import { router } from './trpc'
import { systemRouter } from './routers/system'
import { peopleRouter } from './routers/people'
import { businessesRouter } from './routers/businesses'
import { issuersRouter, productsRouter } from './routers/catalog'
import { cardsRouter } from './routers/cards'
import { pointsRouter } from './routers/points'
import { bonusesRouter } from './routers/bonuses'
import { offersRouter } from './routers/offers'
import { benefitsRouter } from './routers/benefits'
import { productBenefitsRouter } from './routers/productBenefits'
import { velocityRouter } from './routers/velocity'
import { referralsRouter } from './routers/referrals'
import { referralLinksRouter } from './routers/referralLinks'
import { importerRouter } from './routers/importer'
import { exporterRouter } from './routers/exporter'
import { reportsRouter } from './routers/reports'
import { recurringPaymentsRouter } from './routers/recurringPayments'
import { recommendationsRouter } from './routers/recommendations'

export const appRouter = router({
  system: systemRouter,
  people: peopleRouter,
  businesses: businessesRouter,
  issuers: issuersRouter,
  products: productsRouter,
  cards: cardsRouter,
  points: pointsRouter,
  bonuses: bonusesRouter,
  offers: offersRouter,
  benefits: benefitsRouter,
  productBenefits: productBenefitsRouter,
  velocity: velocityRouter,
  referrals: referralsRouter,
  referralLinks: referralLinksRouter,
  importer: importerRouter,
  exporter: exporterRouter,
  reports: reportsRouter,
  recurringPayments: recurringPaymentsRouter,
  recommendations: recommendationsRouter
})

export type AppRouter = typeof appRouter
