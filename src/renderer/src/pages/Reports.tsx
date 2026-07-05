import React from 'react'
import { Card, Group, SimpleGrid, Table, Text, useComputedColorScheme } from '@mantine/core'
import { BarChart } from '@mantine/charts'
import { trpc } from '../trpc'
import { PageHeader } from '../components/PageHeader'
import { EmptyState } from '../components/EmptyState'
import { QueryGate } from '../components/QueryGate'
import { formatCents } from '@shared/format'
import type { RouterOutputs } from '../lib/types'

type Overview = RouterOutputs['reports']['overview']

// Categorical pair validated with the dataviz palette checker for each mode
// (dark gets its own teal step — L must sit in the dark band, not be a flip).
const SERIES_COLORS = {
  light: { spend: '#228be6' /* blue.6 */, ret: '#12b886' /* teal.6 */ },
  dark: { spend: '#228be6' /* blue.6 */, ret: '#0ca678' /* teal.7 */ }
}

function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
}

function formatPercent(ratio: number | null): string {
  return ratio == null ? '—' : `${(ratio * 100).toFixed(1)}%`
}

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }): React.ReactElement {
  return (
    <Card withBorder radius="md" padding="lg">
      <Text size="sm" c="dimmed">
        {label}
      </Text>
      <Text fz={28} fw={700}>
        {value}
      </Text>
      {hint && (
        <Text size="xs" c="dimmed">
          {hint}
        </Text>
      )}
    </Card>
  )
}

function MonthlyTable({ overview }: { overview: Overview }): React.ReactElement {
  return (
    <Table withTableBorder highlightOnHover>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Month</Table.Th>
          <Table.Th ta="right">Spend</Table.Th>
          <Table.Th ta="right">Bonuses</Table.Th>
          <Table.Th ta="right">Referrals</Table.Th>
          <Table.Th ta="right">Benefits</Table.Th>
          <Table.Th ta="right">Return</Table.Th>
          <Table.Th ta="right">Return / spend</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {[...overview.months].reverse().map((m) => (
          <Table.Tr key={m.month}>
            <Table.Td fw={500}>{monthLabel(m.month)}</Table.Td>
            <Table.Td ta="right">{formatCents(m.spendCents)}</Table.Td>
            <Table.Td ta="right">{formatCents(m.bonusReturnCents)}</Table.Td>
            <Table.Td ta="right">{formatCents(m.referralReturnCents)}</Table.Td>
            <Table.Td ta="right">{formatCents(m.benefitReturnCents)}</Table.Td>
            <Table.Td ta="right" fw={500}>
              {formatCents(m.returnCents)}
            </Table.Td>
            <Table.Td ta="right">
              {m.spendCents > 0 ? formatPercent(m.returnCents / m.spendCents) : '—'}
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  )
}

export function Reports(): React.ReactElement {
  const overview = trpc.reports.overview.useQuery()
  const scheme = useComputedColorScheme('light')
  const colors = SERIES_COLORS[scheme]

  const chartData = (overview.data?.months ?? []).map((m) => ({
    month: monthLabel(m.month),
    Spend: m.spendCents / 100,
    Return: m.returnCents / 100
  }))

  const totals = overview.data?.totals

  return (
    <>
      <PageHeader title="Reports" />
      <Text c="dimmed" mb="md">
        Tracked bonus spend against realized return — signup bonuses when received, referrals when
        paid, and benefit credits when used.
      </Text>

      <QueryGate queries={[overview]}>
        {overview.data && overview.data.months.length === 0 ? (
          <EmptyState
            title="Nothing to report yet"
            description="Log spend against a signup bonus (or mark one received) and the timeline starts here."
          />
        ) : (
          <>
            <SimpleGrid cols={{ base: 1, sm: 3 }} mb="lg">
              <StatTile label="Tracked spend" value={formatCents(totals?.spendCents ?? 0)} />
              <StatTile
                label="Realized return"
                value={formatCents(totals?.returnCents ?? 0)}
                hint={`${formatCents(totals?.bonusReturnCents ?? 0)} bonuses · ${formatCents(
                  totals?.referralReturnCents ?? 0
                )} referrals · ${formatCents(totals?.benefitReturnCents ?? 0)} benefits`}
              />
              <StatTile
                label="Return on spend"
                value={formatPercent(totals?.returnOnSpend ?? null)}
                hint="Realized return ÷ tracked spend, all time"
              />
            </SimpleGrid>

            <Card withBorder radius="md" padding="lg" mb="lg">
              <Group justify="space-between" mb="sm">
                <Text fw={600}>Spend vs return by month</Text>
              </Group>
              <BarChart
                h={280}
                data={chartData}
                dataKey="month"
                series={[
                  { name: 'Spend', color: colors.spend },
                  { name: 'Return', color: colors.ret }
                ]}
                withLegend
                legendProps={{ verticalAlign: 'top' }}
                valueFormatter={(v) =>
                  new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: 'USD',
                    maximumFractionDigits: 0
                  }).format(v)
                }
                barProps={{ radius: [4, 4, 0, 0] }}
              />
            </Card>

            <MonthlyTable overview={overview.data!} />
          </>
        )}
      </QueryGate>
    </>
  )
}
