import { eq } from 'drizzle-orm'
import type { DbLike } from './index'
import { appSetting } from './schema'

export function getSetting(db: DbLike, key: string): string | null {
  return (
    db.select({ value: appSetting.value }).from(appSetting).where(eq(appSetting.key, key)).get()
      ?.value ?? null
  )
}

export function setSetting(db: DbLike, key: string, value: string): void {
  db.insert(appSetting)
    .values({ key, value, updatedAt: Date.now() })
    .onConflictDoUpdate({ target: appSetting.key, set: { value, updatedAt: Date.now() } })
    .run()
}
