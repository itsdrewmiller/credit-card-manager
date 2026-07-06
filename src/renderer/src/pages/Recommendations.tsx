import React from 'react'
import {
  Accordion,
  Badge,
  Button,
  Card,
  Checkbox,
  Code,
  Group,
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
import { formatCents, formatDate } from '@shared/format'
import { showSuccess } from '../lib/mutations'
import type { RecommendationOverview, RecommendationRuleRow } from '../lib/types'

type PersonResult = RecommendationOverview['results'][number]
type Candidate = PersonResult['recommended'][number]

function OfferLine({ c }: { c: Candidate }): React.ReactElement {
  return (
    <Group justify="space-between" wrap="nowrap">
      <div>
        <Group gap={6}>
          <Text size="sm" fw={500}>
            {c.label}
          </Text>
          {c.isBusiness && (
            <Badge size="xs" variant="light" color="grape">
              {c.businessName ?? 'business'}
            </Badge>
          )}
        </Group>
        <Text size="xs" c="dimmed">
          {c.minSpendCents != null ? `${formatCents(c.minSpendCents)} min spend` : 'no min spend'}
          {c.windowMonths != null ? ` · ${c.windowMonths} mo window` : ''}
        </Text>
      </div>
      <Text fw={600}>{formatCents(c.valueCents)}</Text>
    </Group>
  )
}

function PersonSection({ r }: { r: PersonResult }): React.ReactElement {
  return (
    <Card withBorder radius="md" padding="lg" mb="md">
      <Group justify="space-between" mb="sm">
        <Text fw={600} size="lg">
          {r.name}
        </Text>
        {r.atChase524 && (
          <Badge color="red" variant="light">
            at/over 5/24
          </Badge>
        )}
      </Group>

      {r.recommended.length === 0 ? (
        <Text size="sm" c="dimmed">
          Nothing recommended right now — see below for what's blocked and why.
        </Text>
      ) : (
        <div>
          {r.recommended.slice(0, 6).map((c) => (
            <Card key={`${c.offerId}-${c.businessId ?? 'p'}`} withBorder radius="sm" padding="sm" mb={6}>
              <OfferLine c={c} />
            </Card>
          ))}
        </div>
      )}

      {r.blocked.length > 0 && (
        <Accordion variant="subtle" chevronPosition="left">
          <Accordion.Item value="blocked">
            <Accordion.Control>
              <Text size="sm" c="dimmed">
                {r.blocked.length} blocked
              </Text>
            </Accordion.Control>
            <Accordion.Panel>
              {r.blocked.slice(0, 12).map((c) => (
                <Group key={`${c.offerId}-${c.businessId ?? 'p'}`} justify="space-between" mb={6} wrap="nowrap">
                  <div>
                    <OfferLine c={c} />
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
    </Card>
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
        What to apply for next, per person — current offers run through your rules. The feed
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
              overview.data?.results.map((r) => <PersonSection key={r.personId} r={r} />)
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
