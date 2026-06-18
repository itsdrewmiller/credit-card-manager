import React from 'react'
import { Group, Title, Badge } from '@mantine/core'

export function PageHeader({
  title,
  badge,
  children
}: {
  title: string
  badge?: string
  children?: React.ReactNode
}): React.ReactElement {
  return (
    <Group justify="space-between" mb="md">
      <Group gap="sm">
        <Title order={2}>{title}</Title>
        {badge && (
          <Badge variant="light" color="gray">
            {badge}
          </Badge>
        )}
      </Group>
      <Group>{children}</Group>
    </Group>
  )
}
