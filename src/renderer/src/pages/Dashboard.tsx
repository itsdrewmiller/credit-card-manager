import React from 'react'
import { Title, Text, SimpleGrid, Card, Group, Loader, Alert } from '@mantine/core'
import { IconAlertCircle } from '@tabler/icons-react'
import { trpc } from '../trpc'

function Stat({ label, value }: { label: string; value: number }): React.ReactElement {
  return (
    <Card withBorder padding="lg" radius="md">
      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
        {label}
      </Text>
      <Text fw={700} size="32px">
        {value}
      </Text>
    </Card>
  )
}

export function Dashboard(): React.ReactElement {
  const health = trpc.system.health.useQuery()

  return (
    <>
      <Title order={2} mb="xs">
        Dashboard
      </Title>
      <Text c="dimmed" mb="lg">
        Local-first credit-card churning tracker. Data lives in a private SQLite file on this machine.
      </Text>

      {health.isLoading && (
        <Group>
          <Loader size="sm" />
          <Text>Connecting to the database…</Text>
        </Group>
      )}

      {health.isError && (
        <Alert color="red" icon={<IconAlertCircle />} title="Database connection failed">
          {health.error.message}
        </Alert>
      )}

      {health.data && (
        <SimpleGrid cols={{ base: 2, sm: 4 }}>
          <Stat label="People" value={health.data.counts.people} />
          <Stat label="Cards" value={health.data.counts.cards} />
          <Stat label="Catalog Products" value={health.data.counts.products} />
          <Stat label="Issuers" value={health.data.counts.issuers} />
        </SimpleGrid>
      )}
    </>
  )
}
