import type { inferRouterOutputs } from '@trpc/server'
import type { AppRouter } from '../../../main/trpc/router'

export type RouterOutputs = inferRouterOutputs<AppRouter>

export type CardRow = RouterOutputs['cards']['list'][number]
export type PersonRow = RouterOutputs['people']['list'][number]
export type BusinessRow = RouterOutputs['businesses']['list'][number]
export type ProductRow = RouterOutputs['products']['list'][number]
export type PointProgramRow = RouterOutputs['points']['list'][number]
export type BonusRow = RouterOutputs['bonuses']['list'][number]
export type BenefitRow = RouterOutputs['benefits']['list'][number]
export type VelocityRow = RouterOutputs['velocity']['byPerson'][number]
export type RejectedRow = RouterOutputs['velocity']['rejected'][number]
export type ReferralRow = RouterOutputs['referrals']['list'][number]
export type ImportPreview = RouterOutputs['importer']['parseExperian']
export type TradelineRow = ImportPreview['tradelines'][number]
