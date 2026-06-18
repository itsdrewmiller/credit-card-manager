import React from 'react'
import { Card, Stack, Text } from '@mantine/core'

export function EmptyState({
  title,
  description
}: {
  title: string
  description?: string
}): React.ReactElement {
  return (
    <Card withBorder padding="xl" radius="md">
      <Stack gap={4} align="center">
        <Text fw={600}>{title}</Text>
        {description && (
          <Text size="sm" c="dimmed" ta="center">
            {description}
          </Text>
        )}
      </Stack>
    </Card>
  )
}
