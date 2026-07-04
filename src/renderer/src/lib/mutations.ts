import { notifications } from '@mantine/notifications'
import { trpc } from '../trpc'

/** Refresh everything the card list, needs-info inbox, and health badge derive from. */
export function useInvalidateCards(): () => void {
  const utils = trpc.useUtils()
  return () => {
    void utils.cards.list.invalidate()
    void utils.cards.needsInfo.invalidate()
    void utils.system.health.invalidate()
  }
}

/** For mutations that need custom error formatting; plain failures are toasted
 *  by the MutationCache default in main.tsx. */
export function showError(e: { message: string }): void {
  notifications.show({ color: 'red', message: e.message })
}

export function showSuccess(message: string): void {
  notifications.show({ color: 'green', message })
}
