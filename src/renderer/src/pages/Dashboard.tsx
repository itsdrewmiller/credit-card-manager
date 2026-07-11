import React from 'react'
import {
  Anchor,
  Badge,
  Button,
  Text,
  SimpleGrid,
  Card,
  Group,
  Progress,
  Stack,
  Table,
  ThemeIcon,
  Divider,
  useComputedColorScheme
} from '@mantine/core'
import { IconCheck } from '@tabler/icons-react'
import { useNavigate } from 'react-router-dom'
import { BarChart } from '@mantine/charts'
import { trpc } from '../trpc'
import { PageHeader } from '../components/PageHeader'
import { QueryGate } from '../components/QueryGate'
import { VelocitySection } from '../components/VelocitySection'
import { cardLabel } from '../components/useCardEditor'
import { formatCents } from '@shared/format'
import { formatDate } from '@shared/dates'
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
      <Text fz={{ base: 22, sm: 28 }} fw={700}>
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

function Step({
  n,
  done,
  children
}: {
  n: number
  done?: boolean
  children: React.ReactNode
}): React.ReactElement {
  return (
    <Group gap="sm" align="flex-start" wrap="nowrap">
      <ThemeIcon size="sm" radius="xl" variant={done ? 'filled' : 'light'} color={done ? 'teal' : 'blue'}>
        {done ? <IconCheck size={12} /> : <Text size="xs">{n}</Text>}
      </ThemeIcon>
      <Text size="sm" c={done ? 'dimmed' : undefined} td={done ? 'line-through' : undefined}>
        {children}
      </Text>
    </Group>
  )
}

/** Walk-through shown until the first card exists. */
function GettingStarted({ peopleCount }: { peopleCount: number }): React.ReactElement {
  const navigate = useNavigate()
  return (
    <Card withBorder radius="md" padding="lg" mb="lg">
      <Text fw={600} mb="xs">
        Getting started
      </Text>
      <Stack gap="sm">
        <Step n={1} done={peopleCount > 0}>
          Add the people (and any businesses) you track cards for.
        </Step>
        <Step n={2}>
          Pull your free Equifax credit report at{' '}
          <Anchor href="https://www.annualcreditreport.com" target="_blank" inherit>
            annualcreditreport.com
          </Anchor>{' '}
          and import the PDF — every personal card appears at once.
        </Step>
        <Step n={3}>
          Business cards don&apos;t show on personal credit reports — add any you already have by
          hand with &quot;Add card&quot;.
        </Step>
      </Stack>
      <Group mt="md">
        {peopleCount === 0 ? (
          <Button size="sm" onClick={() => navigate('/people')}>
            Add people
          </Button>
        ) : (
          <Button size="sm" onClick={() => navigate('/cards')}>
            Go to Cards
          </Button>
        )}
      </Group>
    </Card>
  )
}

const RATE_SOURCE_LABEL = {
  manual: 'set manually',
  reports: 'from credit reports',
  activity: 'from tracked spend'
} as const

const PACE: Record<string, { label: string; color: string }> = {
  met: { label: 'spend met', color: 'teal' },
  on_track: { label: 'on pace', color: 'teal' },
  behind: { label: 'behind pace', color: 'red' },
  overdue: { label: 'overdue', color: 'red' },
  unknown: { label: 'no deadline', color: 'gray' }
}

/**
 * The action view: open bonus deadlines with progress and required pace,
 * upcoming annual fees, and the projected date all remaining min-spend
 * completes at the current rate (= free for the next application).
 */
function KeyDatesSection(): React.ReactElement | null {
  const kd = trpc.reports.keyDates.useQuery()
  const d = kd.data
  if (!d || (d.bonuses.length === 0 && d.fees.length === 0)) return null

  return (
    <Card withBorder radius="md" padding="lg" mb="lg">
      <Group justify="space-between" align="baseline" mb={4}>
        <Text fw={600}>Key dates</Text>
        <Text size="xs" c="dimmed">
          projected spend {formatCents(d.monthlyRateCents)}/mo · {RATE_SOURCE_LABEL[d.rateSource]}
        </Text>
      </Group>
      {d.totalRemainingCents > 0 && (
        <Text size="sm" c="dimmed" mb="md">
          {formatCents(d.totalRemainingCents)} of bonus min-spend to go
          {d.clearDate
            ? ` — done ~${formatDate(d.clearDate)} at the current rate, then you're clear for the next application.`
            : ' — set a projected monthly spend to see when it completes.'}
        </Text>
      )}

      <Stack gap="lg">
        {d.bonuses.map((b) => {
          const pct =
            b.targetSpendCents && b.targetSpendCents > 0
              ? Math.min(100, (b.spendSoFarCents / b.targetSpendCents) * 100)
              : 0
          const pace = PACE[b.pace] ?? PACE.unknown
          return (
            <div key={b.id}>
              <Group justify="space-between" gap={6}>
                <Text size="sm" fw={500} style={{ minWidth: 0 }}>
                  {cardLabel(b.card)}{' '}
                  <Text span size="xs" c="dimmed">
                    {b.card.business?.name ?? b.card.owner?.name ?? ''}
                  </Text>
                </Text>
                <Group gap={6} wrap="nowrap">
                  {b.deadline && (
                    <Text size="sm" c={b.daysLeft != null && b.daysLeft < 21 ? 'red' : undefined}>
                      due {formatDate(b.deadline)}
                      {b.daysLeft != null ? ` (${b.daysLeft}d)` : ''}
                    </Text>
                  )}
                  <Badge size="sm" variant="light" color={pace.color}>
                    {pace.label}
                  </Badge>
                </Group>
              </Group>
              {b.targetSpendCents != null && (
                <Progress value={pct} mt={6} size="md" radius="xl" color={pace.color} />
              )}
              <Group justify="space-between" mt={4}>
                <Text size="xs" c="dimmed">
                  {b.targetSpendCents != null
                    ? `${formatCents(b.spendSoFarCents)} of ${formatCents(b.targetSpendCents)} spent`
                    : 'no spend target'}
                  {b.valueCents != null ? ` · worth ${formatCents(b.valueCents)}` : ''}
                </Text>
                {b.requiredMonthlyCents != null && (
                  <Text
                    size="xs"
                    c={b.requiredMonthlyCents > d.monthlyRateCents ? 'red' : 'dimmed'}
                  >
                    needs {formatCents(b.requiredMonthlyCents)}/mo
                  </Text>
                )}
              </Group>
            </div>
          )
        })}
      </Stack>

      {d.fees.length > 0 && (
        <>
          <Divider my="md" label="Annual fees coming due" labelPosition="left" />
          <Stack gap={6}>
            {d.fees.map(({ card: c, renewal }) => (
              <Group key={c.id} justify="space-between" gap={6}>
                <Text size="sm" fw={500} style={{ minWidth: 0 }}>
                  {cardLabel(c)}{' '}
                  <Text span size="xs" c="dimmed">
                    {c.business?.name ?? c.owner?.name ?? ''}
                  </Text>
                </Text>
                <Text size="sm" style={{ flexShrink: 0 }}>
                  {formatCents(renewal.feeCents)} on {formatDate(renewal.renewalDate)}{' '}
                  <Text
                    span
                    size="xs"
                    c={renewal.daysUntil < 14 ? 'red' : renewal.daysUntil < 30 ? 'orange' : 'dimmed'}
                  >
                    ({renewal.daysUntil}d)
                  </Text>
                </Text>
              </Group>
            ))}
          </Stack>
        </>
      )}
    </Card>
  )
}

function MonthlyTable({ overview }: { overview: Overview }): React.ReactElement {
  return (
    <Table.ScrollContainer minWidth={760}>
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
    </Table.ScrollContainer>
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

        {health.data?.counts.cards === 0 && (
          <GettingStarted peopleCount={health.data.counts.people} />
        )}
        <KeyDatesSection />
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
