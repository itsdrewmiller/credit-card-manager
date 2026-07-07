import React from 'react'
import { Button, Badge, Anchor, Group, Tabs, Text } from '@mantine/core'
import { IconPlus } from '@tabler/icons-react'
import { trpc } from '../trpc'
import { PageHeader } from '../components/PageHeader'
import { EmptyState } from '../components/EmptyState'
import { QueryGate } from '../components/QueryGate'
import { DataTable, type Column } from '../components/DataTable'
import { RowActionsMenu } from '../components/RowActionsMenu'
import { useEntityEditor } from '../components/useEntityEditor'
import { ReferralForm, type ReferralFormValue } from '../components/ReferralForm'
import { ReferralLinkForm, type ReferralLinkFormValue } from '../components/ReferralLinkForm'
import { useBusinessOptions, usePeopleOptions, useProductOptions } from '../lib/options'
import { REFERRAL_STATUS_COLOR } from '../lib/statusColors'
import { formatDate } from '@shared/dates'
import type { ReferralRow, ReferralLinkRow } from '../lib/types'

const COLUMNS: Column<ReferralRow>[] = [
  { header: 'From', render: (r) => <Text fw={500}>{r.from?.name}</Text> },
  { header: 'To', render: (r) => r.to?.name ?? <Text c="dimmed">—</Text> },
  {
    header: 'Product',
    render: (r) => (r.product ? `${r.product.issuer?.name ?? ''} ${r.product.name}`.trim() : '—')
  },
  { header: 'Reward', render: (r) => r.rewardAmount ?? '—' },
  { header: 'Date', render: (r) => formatDate(r.date) },
  {
    header: 'Status',
    render: (r) =>
      r.status ? (
        <Badge color={REFERRAL_STATUS_COLOR[r.status] ?? 'gray'} variant="light">
          {r.status}
        </Badge>
      ) : (
        '—'
      )
  },
  {
    header: 'Link',
    render: (r) =>
      r.link ? (
        <Anchor href={r.link} target="_blank" size="sm">
          open
        </Anchor>
      ) : (
        '—'
      )
  }
]

/** Who a stored link pays out to — the household, or the app's author. */
function BeneficiaryCell({ link }: { link: ReferralLinkRow }): React.ReactElement {
  if (link.source === 'seeded') {
    return (
      <>
        <Badge color="gray" variant="light">
          App author
        </Badge>
        <Text size="xs" c="dimmed">
          using it supports the developer, not you
        </Text>
      </>
    )
  }
  const name = link.ownerPerson?.name ?? link.ownerBusiness?.name
  return name ? (
    <>
      <Text size="sm">{name}</Text>
      <Text size="xs" c="dimmed">
        earns the referral
      </Text>
    </>
  ) : (
    <Text c="dimmed">—</Text>
  )
}

function ReferralLinks(): React.ReactElement {
  const utils = trpc.useUtils()
  const links = trpc.referralLinks.list.useQuery()

  const invalidate = (): void => void utils.referralLinks.list.invalidate()
  const create = trpc.referralLinks.create.useMutation({ onSuccess: invalidate })
  const update = trpc.referralLinks.update.useMutation({ onSuccess: invalidate })
  const remove = trpc.referralLinks.delete.useMutation({ onSuccess: invalidate })

  const peopleOptions = usePeopleOptions()
  const businessOptions = useBusinessOptions()
  const productOptions = useProductOptions()

  const editor = useEntityEditor<ReferralLinkRow, ReferralLinkFormValue>({
    entityLabel: 'referral link',
    create,
    update,
    form: (props) => (
      <ReferralLinkForm
        peopleOptions={peopleOptions}
        businessOptions={businessOptions}
        productOptions={productOptions}
        {...props}
      />
    )
  })

  const columns: Column<ReferralLinkRow>[] = [
    {
      header: 'Product',
      render: (l) => (
        <Text fw={500}>
          {l.product ? `${l.product.issuer?.name ?? ''} ${l.product.name}`.trim() : '—'}
        </Text>
      )
    },
    {
      header: 'Link',
      render: (l) => (
        <Anchor href={l.url} target="_blank" size="sm">
          {l.url.length > 60 ? `${l.url.slice(0, 60)}…` : l.url}
        </Anchor>
      )
    },
    { header: 'Beneficiary', render: (l) => <BeneficiaryCell link={l} /> }
  ]

  return (
    <>
      <Group justify="space-between" mb="md">
        <Text c="dimmed" size="sm">
          Stored per product and offered whenever someone applies. Links owned by your people or
          businesses count toward recommendation ROI; seeded ones support the app author.
        </Text>
        <Button leftSection={<IconPlus size={16} />} onClick={editor.openCreate}>
          Add link
        </Button>
      </Group>

      <QueryGate queries={[links]}>
        <DataTable
          columns={columns}
          rows={links.data}
          empty={{
            title: 'No referral links stored',
            description: 'Add your referral links so recommendations can use them.'
          }}
          rowActions={(l) => (
            <RowActionsMenu
              onEdit={() => editor.openEdit(l)}
              onDelete={() => remove.mutate({ id: l.id })}
              deleteLabel="Delete this referral link?"
            />
          )}
        />
      </QueryGate>

      {editor.element}
    </>
  )
}

export function Referrals(): React.ReactElement {
  const utils = trpc.useUtils()
  const referrals = trpc.referrals.list.useQuery()
  const people = trpc.people.list.useQuery()

  const invalidate = (): void => void utils.referrals.list.invalidate()

  const create = trpc.referrals.create.useMutation({ onSuccess: invalidate })
  const update = trpc.referrals.update.useMutation({ onSuccess: invalidate })
  const remove = trpc.referrals.delete.useMutation({ onSuccess: invalidate })

  const peopleOptions = usePeopleOptions()
  const productOptions = useProductOptions()

  const editor = useEntityEditor<ReferralRow, ReferralFormValue>({
    entityLabel: 'referral',
    create,
    update,
    form: (props) => (
      <ReferralForm peopleOptions={peopleOptions} productOptions={productOptions} {...props} />
    )
  })

  return (
    <>
      <PageHeader title="Referrals" />
      <Tabs defaultValue="sent">
        <Tabs.List mb="md">
          <Tabs.Tab value="sent">Sent referrals</Tabs.Tab>
          <Tabs.Tab value="links">Referral links</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="links">
          <ReferralLinks />
        </Tabs.Panel>

        <Tabs.Panel value="sent">
          <Group justify="space-between" mb="md">
            <Text c="dimmed" size="sm">
              Track referrals between the people you manage — who referred whom, for which card,
              and whether the bonus has paid.
            </Text>
            <Button
              leftSection={<IconPlus size={16} />}
              onClick={editor.openCreate}
              disabled={(people.data ?? []).length === 0}
            >
              Add referral
            </Button>
          </Group>

          <QueryGate queries={[referrals, people]}>
            {(people.data ?? []).length === 0 ? (
              <EmptyState title="Add people first" description="Referrals are between people." />
            ) : (
              <DataTable
                columns={COLUMNS}
                rows={referrals.data}
                empty={{
                  title: 'No referrals yet',
                  description: 'Record a referral link or a sent referral.'
                }}
                rowActions={(r) => (
                  <RowActionsMenu
                    onEdit={() => editor.openEdit(r)}
                    onDelete={() => remove.mutate({ id: r.id })}
                    deleteLabel="Delete this referral?"
                  />
                )}
              />
            )}
          </QueryGate>
        </Tabs.Panel>
      </Tabs>

      {editor.element}
    </>
  )
}
