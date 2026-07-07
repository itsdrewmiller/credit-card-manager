import React from 'react'
import {
  Text,
  SimpleGrid,
  Card,
  Group,
  Table,
  Divider,
  useComputedColorScheme
} from '@mantine/core'
import { BarChart } from '@mantine/charts'
import { trpc } from '../trpc'
import { PageHeader } from '../components/PageHeader'
import { QueryGate } from '../components/QueryGate'
import { VelocitySection } from '../components/VelocitySection'
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

function StatTile({
  label,
  value,
  hint
}: {
  label: string
  value: string
  hint?: string
}): React.ReactElement {
  return (
    <Card withBorder radius="md" padding="lg">
      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
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
          <Table.Th ta="right">Cash back</Table.Th>
          <Table.Th ta="right">Fees</Table.Th>
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
            <Table.Td ta="right">{formatCents(m.cashbackReturnCents)}</Table.Td>
            <Table.Td ta="right">{m.feeCents > 0 ? `−${formatCents(m.feeCents)}` : '—'}</Table.Td>
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

export function Dashboard(): React.ReactElement {
  const health = trpc.system.health.useQuery()
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
      <PageHeader title="Dashboard" />
      <Text c="dimmed" mb="lg">
        Tracked bonus spend against realized return — signup bonuses when received, referrals when
        paid, benefit credits when used, and baseline cash back on tracked spend — net of annual
        fees, assumed charged a month after opening and each anniversary. Starts the year of your
        first tracked bonus.
      </Text>

      <QueryGate queries={[health, overview]}>
        <SimpleGrid cols={{ base: 2, sm: 5 }} mb="lg">
          <StatTile label="People" value={String(health.data?.counts.people ?? 0)} />
          <StatTile label="Cards" value={String(health.data?.counts.cards ?? 0)} />
          <StatTile label="Tracked spend" value={formatCents(totals?.spendCents ?? 0)} />
          <StatTile
            label="Realized return"
            value={formatCents(totals?.returnCents ?? 0)}
            hint={`${formatCents(totals?.bonusReturnCents ?? 0)} bonuses · ${formatCents(
              totals?.referralReturnCents ?? 0
            )} referrals · ${formatCents(totals?.benefitReturnCents ?? 0)} benefits · ${formatCents(
              totals?.cashbackReturnCents ?? 0
            )} cash back · −${formatCents(totals?.feeCents ?? 0)} fees`}
          />
          <StatTile
            label="Return on spend"
            value={formatPercent(totals?.returnOnSpend ?? null)}
            hint="Realized return ÷ tracked spend, all time"
          />
        </SimpleGrid>

        <VelocitySection />
        <Divider my="lg" />

        {overview.data && overview.data.months.length > 0 ? (
          <>
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

            <MonthlyTable overview={overview.data} />
          </>
        ) : (
          <Text c="dimmed" size="sm">
            Log spend against a signup bonus (or mark one received) and the spend/return timeline
            appears here.
          </Text>
        )}
      </QueryGate>
    </>
  )
}
