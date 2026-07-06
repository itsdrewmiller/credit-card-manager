import React, { useMemo, useState } from 'react'
import {
  Accordion,
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
import { DataTable, type Column } from '../components/DataTable'
import { RowActionsMenu } from '../components/RowActionsMenu'
import { useEntityEditor } from '../components/useEntityEditor'
import { RuleForm, type RuleFormValue } from '../components/RuleForm'
import { formatCents, formatDate, formatPoints } from '@shared/format'
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

function RecommendedTable({ rows }: { rows: Candidate[] }): React.ReactElement {
  return (
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
          <Table.Tr key={`${c.offerId}-${c.personId}-${c.businessId ?? 'p'}`}>
            <Table.Td>
              <WhoCell c={c} />
            </Table.Td>
            <Table.Td>
              <Text size="sm" fw={500}>
                {c.label}
              </Text>
            </Table.Td>
            <Table.Td>
              <Text size="sm">{bonusText(c)}</Text>
              <Text size="xs" c="dimmed">
                {c.minSpendCents != null ? `${formatCents(c.minSpendCents)} spend` : 'no min spend'}
                {c.windowMonths != null ? ` in ${c.windowMonths} mo` : ''}
              </Text>
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
  )
}

function CombinedResults({ results }: { results: PersonResult[] }): React.ReactElement {
  const [filters, setFilters] = useState<Filters>({ issuer: null, holder: null, maxMinSpend: '' })

  const { recommended, blocked, issuers, holders } = useMemo(() => {
    const tag = (r: PersonResult, list: PersonResult['recommended']): Candidate[] =>
      list.map((c) => ({ ...c, personName: r.name }))
    const rec = results.flatMap((r) => tag(r, r.recommended))
    const blk = results.flatMap((r) => tag(r, r.blocked))
    // ROI ordering across the whole household.
    const byRoi = (a: Candidate, b: Candidate) =>
      (b.roiPct ?? -1) - (a.roiPct ?? -1) || ((b.totalValueCents ?? 0) - (a.totalValueCents ?? 0))
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
