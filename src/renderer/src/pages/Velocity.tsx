import React from 'react'
import {
  SimpleGrid,
  Card,
  Group,
  Text,
  Badge,
  RingProgress,
  Stack,
  Divider,
  Table,
  Title
} from '@mantine/core'
import { trpc } from '../trpc'
import { PageHeader } from '../components/PageHeader'
import { EmptyState } from '../components/EmptyState'
import { QueryGate } from '../components/QueryGate'
import { cardLabel, cardSelectLabel } from '../components/useCardEditor'
import { formatDate } from '@shared/format'
import type { RouterOutputs, VelocityRow, RejectedRow } from '../lib/types'

type BusinessVelocityRow = RouterOutputs['velocity']['byBusiness'][number]

function BusinessVelocityCard({ v }: { v: BusinessVelocityRow }): React.ReactElement {
  return (
    <Card withBorder radius="md" padding="md">
      <Group justify="space-between" align="flex-start">
        <div>
          <Text fw={600}>{v.name}</Text>
          {v.ownerName && (
            <Text size="xs" c="dimmed">
              {v.ownerName}
            </Text>
          )}
        </div>
        <Badge variant="light" color={v.count12mo >= 3 ? 'orange' : 'gray'}>
          {v.count12mo} in 12 mo
        </Badge>
      </Group>
      {v.recent.length > 0 && (
        <Stack gap={2} mt="xs">
          {v.recent.map((c) => (
            <Group key={c.id} justify="space-between" wrap="nowrap" gap="xs">
              <Text size="sm" truncate style={{ flex: 1, minWidth: 0 }}>
                {cardSelectLabel(c)}
              </Text>
              <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
                {formatDate(c.openedDate)}
              </Text>
            </Group>
          ))}
        </Stack>
      )}
    </Card>
  )
}

function VelocityCard({ v }: { v: VelocityRow }): React.ReactElement {
  const color = v.count >= 5 ? 'red' : v.count >= 4 ? 'orange' : 'green'
  return (
    <Card withBorder radius="md" padding="lg">
      <Group justify="space-between" align="flex-start">
        <div>
          <Text fw={600} size="lg">
            {v.name}
          </Text>
          <Text size="sm" c="dimmed">
            personal cards · last 24 months
          </Text>
        </div>
        <RingProgress
          size={88}
          thickness={9}
          roundCaps
          sections={[{ value: Math.min(100, (v.count / 5) * 100), color }]}
          label={
            <Text ta="center" fw={700} size="lg">
              {v.count}
            </Text>
          }
        />
      </Group>

      <Group gap="xs" mt="sm">
        {v.atChase524 ? (
          <Badge color="red" variant="light">
            At/over 5/24 — Chase will auto-decline
          </Badge>
        ) : (
          <Badge color="green" variant="light">
            Under 5/24 ({5 - v.count} slot{5 - v.count === 1 ? '' : 's'} free)
          </Badge>
        )}
      </Group>

      {v.atChase524 && v.under524Date ? (
        <Text size="sm" fw={600} c="red" mt={4}>
          Back under 5/24 on {formatDate(v.under524Date)}
        </Text>
      ) : (
        v.nextFreeDate && (
          <Text size="sm" c="dimmed" mt={4}>
            Next slot frees {formatDate(v.nextFreeDate)}
          </Text>
        )
      )}

      {v.contributing.length > 0 && (
        <>
          <Divider my="sm" />
          <Stack gap={4}>
            {v.contributing.map((c) => (
              <Group key={c.id} justify="space-between">
                <Text size="sm">{cardLabel(c)}</Text>
                <Text size="xs" c="dimmed">
                  {formatDate(c.openedDate)}
                </Text>
              </Group>
            ))}
          </Stack>
        </>
      )}
    </Card>
  )
}

export function Velocity(): React.ReactElement {
  const byPerson = trpc.velocity.byPerson.useQuery()
  const byBusiness = trpc.velocity.byBusiness.useQuery()
  const rejected = trpc.velocity.rejected.useQuery()

  return (
    <>
      <PageHeader title="Velocity (5/24)" />
      <Text c="dimmed" mb="md">
        Personal-reporting cards opened in the trailing 24 months, per person. Business cards are
        excluded unless marked &quot;counts toward 5/24&quot; on the card (a few issuers report them
        to the personal bureau).
      </Text>

      <QueryGate queries={[byPerson, byBusiness, rejected]}>
      {byPerson.data && byPerson.data.length === 0 ? (
        <EmptyState title="No people yet" description="Add people to track their 5/24 status." />
      ) : (
        <SimpleGrid cols={{ base: 1, md: 2 }}>
          {byPerson.data?.map((v) => (
            <VelocityCard key={v.personId} v={v} />
          ))}
        </SimpleGrid>
      )}

      {byBusiness.data && byBusiness.data.length > 0 && (
        <>
          <Title order={3} mt="xl" mb="sm">
            Businesses
          </Title>
          <SimpleGrid cols={{ base: 1, md: 3 }}>
            {byBusiness.data.map((v) => (
              <BusinessVelocityCard key={v.businessId} v={v} />
            ))}
          </SimpleGrid>
        </>
      )}

      {rejected.data && rejected.data.length > 0 && (
        <>
          <Title order={3} mt="xl" mb="sm">
            Rejected applications
          </Title>
          <Table withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Card</Table.Th>
                <Table.Th>Applicant</Table.Th>
                <Table.Th>Applied</Table.Th>
                <Table.Th>Rejected</Table.Th>
                <Table.Th>Reason</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rejected.data.map((c: RejectedRow) => (
                <Table.Tr key={c.id}>
                  <Table.Td fw={500}>{cardLabel(c)}</Table.Td>
                  <Table.Td>{c.owner?.name ?? c.business?.name ?? '—'}</Table.Td>
                  <Table.Td>{formatDate(c.appliedDate)}</Table.Td>
                  <Table.Td>{formatDate(c.rejectedDate)}</Table.Td>
                  <Table.Td>
                    <Text size="sm" c="dimmed">
                      {c.rejectionReason}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </>
      )}
      </QueryGate>
    </>
  )
}
