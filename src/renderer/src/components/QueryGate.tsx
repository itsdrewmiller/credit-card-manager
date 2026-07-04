import React from 'react'
import { Alert, Center, Loader } from '@mantine/core'

interface QueryLike {
  isPending: boolean
  isError: boolean
  error: { message: string } | null
}

/**
 * Standard first-paint handling for query-driven page bodies: an inline error
 * for a failed initial load, a centered loader while fetching, else children.
 * Background-refetch errors are surfaced by the QueryCache handler instead.
 */
export function QueryGate({
  queries,
  children
}: {
  queries: QueryLike[]
  children: React.ReactNode
}): React.ReactElement {
  const failed = queries.find((q) => q.isError)
  if (failed) {
    return (
      <Alert color="red" title="Failed to load">
        {failed.error?.message ?? 'Unknown error'}
      </Alert>
    )
  }
  if (queries.some((q) => q.isPending)) {
    return (
      <Center py="xl">
        <Loader size="sm" />
      </Center>
    )
  }
  return <>{children}</>
}
