import React, { useState } from 'react'
import ReactDOM from 'react-dom/client'
import { MantineProvider } from '@mantine/core'
import { ModalsProvider } from '@mantine/modals'
import { Notifications, notifications } from '@mantine/notifications'
import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from '@tanstack/react-query'
import { HashRouter } from 'react-router-dom'
import '@mantine/core/styles.css'
import './global.css'
import '@mantine/notifications/styles.css'
import '@mantine/dates/styles.css'
import '@mantine/charts/styles.css'

import { trpc, createTrpcClient } from './trpc'
import { App } from './App'

function makeQueryClient(): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        // Initial-load failures render inline via <QueryGate>; only notify
        // when a background refetch fails and stale data is still on screen.
        if (query.state.data !== undefined) {
          notifications.show({
            id: `query-error-${query.queryHash}`, // dedupes retry spam
            color: 'red',
            title: 'Refresh failed',
            message: error.message
          })
        }
      }
    }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) => {
        // Default handler only: mutations with their own onError opt out.
        if (mutation.options.onError) return
        notifications.show({ color: 'red', message: error.message })
      }
    })
  })
}

function Root(): React.ReactElement {
  const [queryClient] = useState(makeQueryClient)
  const [trpcClient] = useState(() => createTrpcClient())

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <MantineProvider defaultColorScheme="auto">
          <ModalsProvider>
            <Notifications position="top-right" />
            <HashRouter>
              <App />
            </HashRouter>
          </ModalsProvider>
        </MantineProvider>
      </QueryClientProvider>
    </trpc.Provider>
  )
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
)
