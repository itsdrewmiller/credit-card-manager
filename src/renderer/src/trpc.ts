import { createTRPCReact } from '@trpc/react-query'
import { TRPCClientError, type TRPCLink } from '@trpc/client'
import { observable } from '@trpc/server/observable'
import type { AppRouter } from '../../main/trpc/router'
import type { TrpcRequest } from '../../preload'

declare global {
  interface Window {
    trpcIpc: { request: (op: TrpcRequest) => Promise<unknown> }
  }
}

export const trpc = createTRPCReact<AppRouter>()

/** Terminating tRPC link that forwards queries/mutations over our IPC bridge. */
function ipcLink(): TRPCLink<AppRouter> {
  return () =>
    ({ op }) =>
      observable((observer) => {
        if (op.type === 'subscription') {
          observer.error(TRPCClientError.from(new Error('Subscriptions are not supported')))
          return
        }
        window.trpcIpc
          .request({ type: op.type, path: op.path, input: op.input })
          .then((data) => {
            observer.next({ result: { type: 'data', data } })
            observer.complete()
          })
          .catch((cause: unknown) => {
            // Strip Electron's "Error invoking remote method '…':" wrapper.
            const message = String((cause as Error)?.message ?? cause).replace(
              /^Error invoking remote method '[^']*':\s*(Error:\s*)?/,
              ''
            )
            observer.error(TRPCClientError.from(new Error(message)))
          })
        return () => {}
      })
}

export function createTrpcClient() {
  return trpc.createClient({ links: [ipcLink()] })
}
