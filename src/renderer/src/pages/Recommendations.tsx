import React, { useMemo, useState } from 'react'
import {
  Accordion,
  Anchor,
  Badge,
  Button,
  Checkbox,
  Code,
  Group,
  NumberInput,
  Select,
  Table,
  Tabs,
  Text
} from '@mantine/core'
import { IconPlus, IconRefresh, IconSparkles } from '@tabler/icons-react'
import { trpc } from '../trpc'
import { PageHeader } from '../components/PageHeader'
import { EmptyState } from '../components/EmptyState'
import { QueryGate } from '../components/QueryGate'
import { DataTable, RowCardList, type Column } from '../components/DataTable'
import { RowActionsMenu } from '../components/RowActionsMenu'
import { useEntityEditor } from '../components/useEntityEditor'
import { RuleForm, type RuleFormValue } from '../components/RuleForm'
import { formatCents, formatPoints } from '@shared/format'
import { formatDate } from '@shared/dates'
import { showSuccess } from '../lib/mutations'
import type { RecommendationOverview, RecommendationRuleRow } from '../lib/types'

type PersonResult = RecommendationOverview['results'][number]
type Candidate = PersonResult['recommended'][number] & { personName: string }

function bonusText(c: Candidate): string {
  if (c.cashAmountCents != null) return formatCents(c.cashAmountCents)
  if (c.pointsAmount != null) return `${formatPoints(c.pointsAmount)} ${c.currency ?? 'pts'}`
  return '—'
}

function WhoCell({ c }: { c: Candidate }): React.ReactElement {
  return (
    <Group gap={6} wrap="nowrap">
      <Text size="sm">{c.personName}</Text>
      {c.isBusiness && (
        <Badge size="xs" variant="light" color="grape">
          {c.businessName ?? 'business'}
        </Badge>
      )}
    </Group>
  )
}

function ValueCell({ c }: { c: Candidate }): React.ReactElement {
  return (
    <>
      <Text fw={600}>{formatCents(c.totalValueCents ?? c.valueCents)}</Text>
      {c.referralFrom &&
        (c.referralValueCents != null ? (
          <Text size="xs" c="teal">
            incl. {formatCents(c.referralValueCents)} referral via {c.referralFrom}
          </Text>
        ) : (
          <Text size="xs" c="dimmed">
            referral via {c.referralFrom} possible
          </Text>
        ))}
      {c.earnOnSpendCents != null && c.earnOnSpendCents > 0 && (
        <Text size="xs" c="dimmed">
          incl. {formatCents(c.earnOnSpendCents)} earn on spend
        </Text>
      )}
      {c.annualFeeCents != null && c.annualFeeCents > 0 && (
        <Text size="xs" c={c.feeWaivedFirstYear ? 'dimmed' : 'orange'}>
          {c.feeWaivedFirstYear
            ? `${formatCents(c.annualFeeCents)} fee waived yr 1`
            : `net of ${formatCents(c.annualFeeCents)} fee`}
        </Text>
      )}
    </>
  )
}

interface Filters {
  issuer: string | null
  holder: string | null // 'personal' | business name
  maxMinSpend: number | string
}

function applyFilters(rows: Candidate[], f: Filters): Candidate[] {
  return rows.filter((c) => {
    if (f.issuer && c.issuerName !== f.issuer) return false
    if (f.holder === 'personal' && c.isBusiness) return false
    if (f.holder && f.holder !== 'personal' && c.businessName !== f.holder) return false
    if (f.maxMinSpend !== '' && c.minSpendCents != null && c.minSpendCents > Number(f.maxMinSpend) * 100)
      return false
    return true
  })
}

function CardCell({ c }: { c: Candidate }): React.ReactElement {
  return (
    <>
      <Text size="sm" fw={500}>
        {c.label}
      </Text>
      {c.referralLinkUrl && (
        <>
          <Anchor href={c.referralLinkUrl} target="_blank" size="xs">
            apply via referral
          </Anchor>
          {c.referralLinkSeeded && (
            <Text size="xs" c="dimmed">
              link credits the app author — store your own to earn it
            </Text>
          )}
        </>
      )}
    </>
  )
}

function BonusCell({ c }: { c: Candidate }): React.ReactElement {
  return (
    <>
      <Text size="sm">{bonusText(c)}</Text>
      <Text size="xs" c="dimmed">
        {c.minSpendCents != null ? `${formatCents(c.minSpendCents)} spend` : 'no min spend'}
        {c.windowMonths != null ? ` in ${c.windowMonths} mo` : ''}
      </Text>
    </>
  )
}

const candidateKey = (c: Candidate): string => `${c.offerId}-${c.personId}-${c.businessId ?? 'p'}`

function RecommendedTable({ rows }: { rows: Candidate[] }): React.ReactElement {
  // Phone widths get the card as the title with the rest stacked underneath.
  const mobileColumns: Column<Candidate & { id: string }>[] = [
    { header: 'Card', render: (c) => <CardCell c={c} /> },
    { header: 'Who', render: (c) => <WhoCell c={c} /> },
    { header: 'Bonus', render: (c) => <BonusCell c={c} /> },
    { header: 'Value', render: (c) => <ValueCell c={c} /> },
    { header: 'Earn %', render: (c) => <Text size="sm">{c.earnPct != null ? `${c.earnPct}%` : '—'}</Text> },
    {
      header: 'ROI on spend',
      render: (c) => (
        <Text size="sm" fw={500}>
          {c.roiPct != null ? `${Math.round(c.roiPct)}%` : '—'}
        </Text>
      )
    }
  ]

  return (
    <>
    <Table.ScrollContainer minWidth={860} visibleFrom="sm">
    <Table withTableBorder highlightOnHover verticalSpacing="xs">
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Who</Table.Th>
          <Table.Th>Card</Table.Th>
          <Table.Th>Bonus</Table.Th>
          <Table.Th ta="right">Value</Table.Th>
          <Table.Th ta="right">Earn %</Table.Th>
          <Table.Th ta="right">ROI on spend</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {rows.map((c) => (
          <Table.Tr key={candidateKey(c)}>
            <Table.Td>
              <WhoCell c={c} />
            </Table.Td>
            <Table.Td>
              <CardCell c={c} />
            </Table.Td>
            <Table.Td>
              <BonusCell c={c} />
            </Table.Td>
            <Table.Td ta="right">
              <ValueCell c={c} />
            </Table.Td>
            <Table.Td ta="right">
              <Text size="sm">{c.earnPct != null ? `${c.earnPct}%` : '—'}</Text>
            </Table.Td>
            <Table.Td ta="right">
              <Text size="sm" fw={500}>
                {c.roiPct != null ? `${Math.round(c.roiPct)}%` : '—'}
              </Text>
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
    </Table.ScrollContainer>
    <RowCardList columns={mobileColumns} rows={rows.map((c) => ({ ...c, id: candidateKey(c) }))} />
    </>
  )
}

function CombinedResults({ results }: { results: PersonResult[] }): React.ReactElement {
  const [filters, setFilters] = useState<Filters>({ issuer: null, holder: null, maxMinSpend: '' })

  const { recommended, blocked, issuers, holders } = useMemo(() => {
    const tag = (r: PersonResult, list: PersonResult['recommended']): Candidate[] =>
      list.map((c) => ({ ...c, personName: r.name }))
    const rec = results.flatMap((r) => tag(r, r.recommended))
    const blk = results.flatMap((r) => tag(r, r.blocked))
    // ROI ordering across the whole household; ties prefer linked products
    // (mirrors the engine's per-person sort).
    const byRoi = (a: Candidate, b: Candidate) =>
      (b.roiPct ?? -1) - (a.roiPct ?? -1) ||
      Number(b.hasReferralLink) - Number(a.hasReferralLink) ||
      (b.totalValueCents ?? 0) - (a.totalValueCents ?? 0)
    rec.sort(byRoi)
    blk.sort(byRoi)
    const issuers = [...new Set([...rec, ...blk].map((c) => c.issuerName).filter(Boolean))].sort() as string[]
    const holders = [...new Set([...rec, ...blk].map((c) => c.businessName).filter(Boolean))].sort() as string[]
    return { recommended: rec, blocked: blk, issuers, holders }
  }, [results])

  const rec = applyFilters(recommended, filters)
  const blk = applyFilters(blocked, filters)
  const over524 = results.filter((r) => r.atChase524)

  return (
    <>
      <Group mb="md" gap="sm">
        <Select
          placeholder="Bank"
          data={issuers}
          clearable
          searchable
          w={190}
          value={filters.issuer}
          onChange={(v) => setFilters((f) => ({ ...f, issuer: v }))}
        />
        <Select
          placeholder="Holder"
          data={[{ value: 'personal', label: 'Personal only' }, ...holders.map((h) => ({ value: h, label: h }))]}
          clearable
          w={190}
          value={filters.holder}
          onChange={(v) => setFilters((f) => ({ ...f, holder: v }))}
        />
        <NumberInput
          placeholder="Max min-spend ($)"
          min={0}
          thousandSeparator=","
          prefix="$"
          hideControls
          w={170}
          value={filters.maxMinSpend}
          onChange={(v) => setFilters((f) => ({ ...f, maxMinSpend: v }))}
        />
        {over524.map((r) => (
          <Badge key={r.personId} color="red" variant="light">
            {r.name} at/over 5/24
          </Badge>
        ))}
      </Group>

      {rec.length === 0 ? (
        <Text size="sm" c="dimmed" mb="md">
          Nothing recommended with these filters — see blocked below for why.
        </Text>
      ) : (
        <RecommendedTable rows={rec} />
      )}

      {blk.length > 0 && (
        <Accordion variant="subtle" chevronPosition="left" mt="sm">
          <Accordion.Item value="blocked">
            <Accordion.Control>
              <Text size="sm" c="dimmed">
                {blk.length} blocked
              </Text>
            </Accordion.Control>
            <Accordion.Panel>
              {blk.map((c) => (
                <Group
                  key={`${c.offerId}-${c.personId}-${c.businessId ?? 'p'}`}
                  justify="space-between"
                  mb={6}
                  wrap="nowrap"
                >
                  <div>
                    <Group gap={6} wrap="nowrap">
                      <Text size="sm" fw={500}>
                        {c.label}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {c.personName}
                      </Text>
                      {c.isBusiness && (
                        <Badge size="xs" variant="light" color="grape">
                          {c.businessName ?? 'business'}
                        </Badge>
                      )}
                      <Text size="xs" c="dimmed">
                        {bonusText(c)} · {formatCents(c.totalValueCents ?? c.valueCents)}
                        {c.roiPct != null ? ` · ${Math.round(c.roiPct)}% ROI` : ''}
                      </Text>
                    </Group>
                    <Text size="xs" c="red">
                      {c.blocks.map((b) => b.reason).join(' · ')}
                    </Text>
                  </div>
                  {c.waitUntil && (
                    <Badge variant="light" color="yellow" style={{ flexShrink: 0 }}>
                      wait until {formatDate(c.waitUntil)}
                    </Badge>
                  )}
                </Group>
              ))}
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>
      )}
    </>
  )
}

function RulesTab(): React.ReactElement {
  const utils = trpc.useUtils()
  const rules = trpc.recommendations.listRules.useQuery()

  const invalidate = (): void => {
    void utils.recommendations.listRules.invalidate()
    void utils.recommendations.overview.invalidate()
  }

  const create = trpc.recommendations.createRule.useMutation({ onSuccess: invalidate })
  const update = trpc.recommendations.updateRule.useMutation({ onSuccess: invalidate })
  const remove = trpc.recommendations.deleteRule.useMutation({ onSuccess: invalidate })

  const editor = useEntityEditor<RecommendationRuleRow, RuleFormValue>({
    entityLabel: 'rule',
    create,
    update,
    form: (props) => <RuleForm {...props} />
  })

  const columns: Column<RecommendationRuleRow>[] = [
    {
      header: 'On',
      w: 40,
      render: (r) => (
        <Checkbox
          checked={r.enabled}
          onChange={(e) => update.mutate({ id: r.id, enabled: e.currentTarget.checked })}
          aria-label="Rule enabled"
        />
      )
    },
    { header: 'Rule', render: (r) => <Text fw={500}>{r.kind}</Text> },
    { header: 'Params', render: (r) => <Code>{r.params}</Code> },
    { header: 'Notes', render: (r) => <Text size="sm" c="dimmed">{r.notes}</Text> }
  ]

  return (
    <>
      <Group justify="flex-end" mb="md">
        <Button leftSection={<IconPlus size={16} />} onClick={editor.openCreate}>
          Add rule
        </Button>
      </Group>
      <QueryGate queries={[rules]}>
        <DataTable
          columns={columns}
          rows={rules.data}
          empty={{ title: 'No rules', description: 'Defaults seed on first run; add one to start.' }}
          rowActions={(r) => (
            <RowActionsMenu
              onEdit={() => editor.openEdit(r)}
              onDelete={() => remove.mutate({ id: r.id })}
              deleteLabel={`Delete this ${r.kind} rule?`}
            />
          )}
        />
      </QueryGate>
      {editor.element}
    </>
  )
}

/**
 * Projected monthly spend feeding the capacity rules: manual value, tracked
 * bonus-activity rate, or the report-measured default (sum of each person's
 * 12-month average from their imported credit report).
 */
function MonthlySpendControl({
  spend
}: {
  spend: NonNullable<RecommendationOverview['monthlySpend']>
}): React.ReactElement {
  const utils = trpc.useUtils()
  const setSpend = trpc.recommendations.setMonthlySpend.useMutation({
    onSuccess: () => void utils.recommendations.overview.invalidate()
  })
  const [value, setValue] = useState<number | string>(
    spend.effectiveCents != null ? spend.effectiveCents / 100 : ''
  )

  const commit = (v: number | string): void => {
    const cents = v === '' ? null : Math.round(Number(v) * 100)
    if (cents !== spend.overrideCents) setSpend.mutate({ cents })
  }

  const source =
    spend.overrideCents != null
      ? 'set manually'
      : spend.reportDefaultCents != null
        ? 'default from credit reports'
        : 'from tracked bonus spend'

  return (
    <Group gap="sm" align="flex-end" mb="md" wrap="wrap">
      <NumberInput
        label="Projected monthly spend"
        description={source}
        min={0}
        decimalScale={0}
        thousandSeparator=","
        prefix="$"
        hideControls
        w={200}
        value={value}
        onChange={setValue}
        onBlur={() => commit(value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit(value)
        }}
      />
      <Button
        variant="default"
        size="sm"
        onClick={() => {
          setValue(spend.activityCents / 100)
          setSpend.mutate({ cents: spend.activityCents })
        }}
      >
        From recent activity ({formatCents(spend.activityCents)}/mo)
      </Button>
      <Button
        variant="default"
        size="sm"
        disabled={spend.reportDefaultCents == null}
        onClick={() => {
          setValue(spend.reportDefaultCents != null ? spend.reportDefaultCents / 100 : '')
          setSpend.mutate({ cents: null })
        }}
      >
        Restore default
        {spend.reportDefaultCents != null ? ` (${formatCents(spend.reportDefaultCents)}/mo)` : ''}
      </Button>
    </Group>
  )
}

export function Recommendations(): React.ReactElement {
  const utils = trpc.useUtils()
  const overview = trpc.recommendations.overview.useQuery()

  const refresh = trpc.recommendations.refreshFeed.useMutation({
    onSuccess: (r) => {
      void utils.recommendations.overview.invalidate()
      void utils.offers.list.invalidate()
      showSuccess(`Offer feed refreshed: ${r.total} offers (${r.created} new, ${r.updated} updated)`)
    }
  })

  return (
    <>
      <PageHeader title="Recommendations">
        <Button
          leftSection={<IconRefresh size={16} />}
          onClick={() => refresh.mutate()}
          loading={refresh.isPending}
        >
          Check for new offers
        </Button>
      </PageHeader>
      <Text c="dimmed" mb="md">
        What to apply for next across the household — every eligible person/business combination,
        ranked by return on required spend, referrals included. The feed
        auto-refreshes weekly
        {overview.data?.feedRefreshedAt
          ? ` (last checked ${formatDate(overview.data.feedRefreshedAt.slice(0, 10))})`
          : ''}
        .
      </Text>

      <Tabs defaultValue="recs">
        <Tabs.List mb="md">
          <Tabs.Tab value="recs" leftSection={<IconSparkles size={14} />}>
            Recommendations
          </Tabs.Tab>
          <Tabs.Tab value="rules">Rules</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="recs">
          <QueryGate queries={[overview]}>
            {overview.data && (
              <MonthlySpendControl
                key={`${overview.data.monthlySpend.overrideCents}-${overview.data.monthlySpend.effectiveCents}`}
                spend={overview.data.monthlySpend}
              />
            )}
            {overview.data && overview.data.results.length === 0 ? (
              <EmptyState title="No people yet" description="Add people to get recommendations." />
            ) : (
              overview.data && <CombinedResults results={overview.data.results} />
            )}
          </QueryGate>
        </Tabs.Panel>

        <Tabs.Panel value="rules">
          <RulesTab />
        </Tabs.Panel>
      </Tabs>
    </>
  )
}
