import React from 'react'
import {
  Modal,
  Group,
  Button,
  Select,
  TextInput,
  NumberInput,
  Switch,
  SimpleGrid,
  Divider,
  Alert,
  Text
} from '@mantine/core'
import { DateInput } from '@mantine/dates'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { IconAlertCircle, IconBuildingStore, IconCheck } from '@tabler/icons-react'
import { trpc } from '../trpc'
import { NETWORKS, REWARD_KINDS, type RewardKind } from '@shared/constants'
import { centsToDollars, parseCents, formatCents, bonusValueCents } from '@shared/format'
import { dateToIso } from '../lib/dates'

interface FormValues {
  businessId: string
  ownerPersonId: string
  cardProductId: string
  network: string
  last4: string
  annualFeeDollars: number | ''
  openedDate: Date | null
  hasBonus: boolean
  rewardKind: RewardKind
  pointProgramId: string
  pointsAmount: number | ''
  cashDollars: number | ''
  targetSpendDollars: number | ''
  deadline: Date | null
  windowMonths: number | ''
}

const initialValues: FormValues = {
  businessId: '',
  ownerPersonId: '',
  cardProductId: '',
  network: '',
  last4: '',
  annualFeeDollars: '',
  openedDate: null,
  hasBonus: false,
  rewardKind: 'points',
  pointProgramId: '',
  pointsAmount: '',
  cashDollars: '',
  targetSpendDollars: '',
  deadline: null,
  windowMonths: ''
}

function addMonths(d: Date | null, months: number | null): Date | null {
  if (!d || months == null) return null
  const r = new Date(d)
  r.setMonth(r.getMonth() + months)
  return r
}

export function BusinessCardWizard({
  opened,
  onClose
}: {
  opened: boolean
  onClose: () => void
}): React.ReactElement {
  const utils = trpc.useUtils()
  const businesses = trpc.businesses.list.useQuery()
  const people = trpc.people.list.useQuery()
  const products = trpc.products.listForSelect.useQuery()
  const programs = trpc.points.listForSelect.useQuery()
  const offers = trpc.offers.list.useQuery()

  const form = useForm<FormValues>({
    initialValues,
    validate: { businessId: (v) => (v ? null : 'Pick a business') }
  })

  const createBonus = trpc.bonuses.create.useMutation()
  const createCard = trpc.cards.create.useMutation()

  const close = (): void => {
    form.setValues(initialValues)
    onClose()
  }

  const noBusinesses = (businesses.data ?? []).length === 0
  const businessOptions = (businesses.data ?? []).map((b) => ({
    value: String(b.id),
    label: b.owner ? `${b.name} (${b.owner.name})` : b.name
  }))
  const peopleOptions = (people.data ?? []).map((p) => ({ value: String(p.id), label: p.name }))
  const productOptions = (products.data ?? [])
    .filter((p) => p.isBusiness)
    .map((p) => ({ value: String(p.id), label: p.label }))
  const programOptions = (programs.data ?? []).map((p) => ({ value: String(p.id), label: p.label }))

  // Default the owner to the business owner.
  const onBusinessChange = (value: string | null): void => {
    form.setFieldValue('businessId', value ?? '')
    const biz = businesses.data?.find((b) => String(b.id) === value)
    if (biz && !form.values.ownerPersonId) form.setFieldValue('ownerPersonId', String(biz.ownerPersonId))
  }

  // Prefill network, annual fee, and the signup bonus from the chosen product.
  const onProductChange = (value: string | null): void => {
    form.setFieldValue('cardProductId', value ?? '')
    const p = products.data?.find((x) => String(x.id) === value)
    if (p) {
      form.setFieldValue('network', p.network ?? '')
      form.setFieldValue('annualFeeDollars', centsToDollars(p.defaultAnnualFeeCents))
    }
    const offer = offers.data?.find((o) => String(o.cardProductId) === value)
    if (offer) {
      form.setFieldValue('hasBonus', true)
      form.setFieldValue('rewardKind', (offer.rewardKind ?? 'points') as RewardKind)
      form.setFieldValue('pointProgramId', offer.pointProgramId ? String(offer.pointProgramId) : '')
      form.setFieldValue('pointsAmount', offer.pointsAmount ?? '')
      form.setFieldValue('cashDollars', centsToDollars(offer.cashAmountCents))
      form.setFieldValue('targetSpendDollars', centsToDollars(offer.minSpendCents))
      form.setFieldValue('windowMonths', offer.windowMonths ?? '')
      form.setFieldValue('deadline', addMonths(form.values.openedDate, offer.windowMonths ?? null))
    }
  }

  // Opened date drives the min-spend deadline (open + the offer's window).
  const onOpenedChange = (date: Date | null): void => {
    form.setFieldValue('openedDate', date)
    const months = form.values.windowMonths
    if (months !== '') form.setFieldValue('deadline', addMonths(date, Number(months)))
  }

  const isCash = form.values.rewardKind === 'cash'
  const selectedProgram = programs.data?.find((p) => String(p.id) === form.values.pointProgramId)
  const bonusPreview = bonusValueCents({
    cashAmountCents: isCash ? parseCents(form.values.cashDollars) : null,
    pointsAmount: form.values.pointsAmount === '' ? null : Number(form.values.pointsAmount),
    valuationCpp: selectedProgram?.valuationCpp ?? null
  })

  const submitting = createCard.isPending || createBonus.isPending

  const submit = form.onSubmit((v) => {
    createCard.mutate(
      {
        businessId: Number(v.businessId),
        ownerPersonId: v.ownerPersonId ? Number(v.ownerPersonId) : null,
        cardProductId: v.cardProductId ? Number(v.cardProductId) : null,
        network: v.network || null,
        last4: v.last4 || null,
        annualFeeCents: parseCents(v.annualFeeDollars),
        openedDate: dateToIso(v.openedDate),
        status: 'open',
        source: 'manual'
      },
      {
        onSuccess: (card) => {
          const finish = (): void => {
            void utils.cards.list.invalidate()
            void utils.cards.needsInfo.invalidate()
            void utils.bonuses.list.invalidate()
            void utils.benefits.list.invalidate()
            void utils.system.health.invalidate()
            notifications.show({
              color: 'green',
              icon: <IconCheck size={16} />,
              message: 'Business card added'
            })
            close()
          }
          if (v.hasBonus) {
            createBonus.mutate(
              {
                cardId: card.id,
                rewardKind: v.rewardKind,
                pointProgramId: !isCash && v.pointProgramId ? Number(v.pointProgramId) : null,
                pointsAmount: !isCash && v.pointsAmount !== '' ? Number(v.pointsAmount) : null,
                cashAmountCents: isCash ? parseCents(v.cashDollars) : null,
                targetSpendCents: parseCents(v.targetSpendDollars),
                deadline: dateToIso(v.deadline),
                spendSoFarCents: 0,
                received: false
              },
              { onSuccess: finish, onError: (e) => notifications.show({ color: 'red', message: e.message }) }
            )
          } else {
            finish()
          }
        },
        onError: (e) => notifications.show({ color: 'red', message: e.message })
      }
    )
  })

  return (
    <Modal opened={opened} onClose={close} title="Add a business card" size="lg">
      {noBusinesses ? (
        <Alert color="orange" icon={<IconAlertCircle size={18} />}>
          You need a business first. Add one under <strong>People &amp; Businesses</strong>, then come
          back.
        </Alert>
      ) : (
        <form onSubmit={submit}>
          <Text size="sm" c="dimmed" mb="md">
            Business cards don&apos;t show up on your credit report, so add them here. Picking a product
            fills in the network, annual fee, and any known signup-bonus offer.
          </Text>

          <SimpleGrid cols={2} mb="sm">
            <Select
              label="Business"
              withAsterisk
              data={businessOptions}
              searchable
              leftSection={<IconBuildingStore size={16} />}
              value={form.values.businessId}
              error={form.errors.businessId}
              onChange={onBusinessChange}
            />
            <Select
              label="Card owner"
              data={peopleOptions}
              searchable
              clearable
              {...form.getInputProps('ownerPersonId')}
            />
          </SimpleGrid>

          <Select
            label="Product"
            placeholder="Pick a business card"
            data={productOptions}
            searchable
            clearable
            value={form.values.cardProductId}
            onChange={onProductChange}
            mb="sm"
          />

          <SimpleGrid cols={4} mb="sm">
            <Select
              label="Network"
              data={NETWORKS as unknown as string[]}
              clearable
              {...form.getInputProps('network')}
            />
            <TextInput label="Last 4" maxLength={4} {...form.getInputProps('last4')} />
            <NumberInput
              label="Annual fee ($)"
              min={0}
              decimalScale={2}
              thousandSeparator=","
              {...form.getInputProps('annualFeeDollars')}
            />
            <DateInput
              label="Opened"
              valueFormat="YYYY-MM-DD"
              clearable
              value={form.values.openedDate}
              onChange={onOpenedChange}
            />
          </SimpleGrid>

          <Divider
            my="sm"
            label={
              <Switch
                label="Signup bonus"
                {...form.getInputProps('hasBonus', { type: 'checkbox' })}
              />
            }
          />

          {form.values.hasBonus && (
            <>
              <SimpleGrid cols={2} mb="sm">
                <Select
                  label="Reward kind"
                  data={REWARD_KINDS as unknown as string[]}
                  {...form.getInputProps('rewardKind')}
                />
                {isCash ? (
                  <NumberInput
                    label="Cash bonus ($)"
                    min={0}
                    decimalScale={2}
                    thousandSeparator=","
                    {...form.getInputProps('cashDollars')}
                  />
                ) : (
                  <NumberInput
                    label="Points / miles"
                    min={0}
                    thousandSeparator=","
                    {...form.getInputProps('pointsAmount')}
                  />
                )}
              </SimpleGrid>
              {!isCash && (
                <Select
                  label="Point program (for value)"
                  data={programOptions}
                  searchable
                  clearable
                  {...form.getInputProps('pointProgramId')}
                  mb="sm"
                />
              )}
              <SimpleGrid cols={2} mb="sm">
                <NumberInput
                  label="Spend target ($)"
                  min={0}
                  decimalScale={2}
                  thousandSeparator=","
                  {...form.getInputProps('targetSpendDollars')}
                />
                <DateInput
                  label="Spend deadline"
                  description="Auto-set from open date + offer window"
                  valueFormat="YYYY-MM-DD"
                  clearable
                  {...form.getInputProps('deadline')}
                />
              </SimpleGrid>
              <Text size="sm" c="dimmed" mb="sm">
                Estimated bonus value: <strong>{formatCents(bonusPreview)}</strong>
              </Text>
            </>
          )}

          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" loading={submitting} leftSection={<IconCheck size={16} />}>
              Create card
            </Button>
          </Group>
        </form>
      )}
    </Modal>
  )
}
