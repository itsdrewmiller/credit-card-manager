import React from 'react'
import { Stack, Divider } from '@mantine/core'
import { People } from './People'
import { Businesses } from './Businesses'

/** People and Businesses on one screen — businesses belong to people. */
export function PeopleAndBusinesses(): React.ReactElement {
  return (
    <Stack gap="xl">
      <People />
      <Divider />
      <Businesses />
    </Stack>
  )
}
