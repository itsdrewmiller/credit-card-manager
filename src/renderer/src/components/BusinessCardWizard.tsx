import React, { useState } from 'react'
import {
  Modal,
  Stepper,
  Group,
  Button,
  Select,
  TextInput,
  NumberInput,
  Switch,
  Stack,
  Text,
  Alert,
  Divider,
  List
} from '@mantine/core'
import { DateInput } from '@mantine/dates'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { IconAlertCircle, IconBuildingStore, IconCheck } from '@tabler/icons-react'
import { trpc } from '../trpc'
import { NETWORKS, REWARD_KINDS, type RewardKind } from '@shared/constants'
import { parseCents, formatCents, bonusValueCents } from '@shared/format'
import { dateToIso } from '../lib/dates'

interface WizardValues {
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
}

const initialValues: WizardValues = {
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
  deadline: null
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

  const [active, setActive] = useState(0)
  const form = useForm<WizardValues>({ initialValues })

  const createBonus = trpc.bonuses.create.useMutation()
  const createCard = trpc.cards.create.useMutation()

  const reset = (): void => {
    form.setValues(initialValues)
    setActive(0)
  }
  const close = (): void => {
    reset()
    onClose()
  }

  const noBusinesses = (businesses.data ?? []).length === 0

  const businessOptions = (businesses.data ?? []).map((b) => ({
    value: String(b.id),
    label: b.owner ? `${b.name} (${b.owner.name})` : b.name
  }))
  const peopleOptions = (people.data ?? []).map((p) => ({ value: String(p.id), label: p.name }))
  // Business cards -> only show business products in the catalog picker.
  const productOptions = (products.data ?? [])
    .filter((p) => p.isBusiness)
    .map((p) => ({ value: String(p.id), label: p.label }))
  const programOptions = (programs.data ?? []).map((p) => ({
    value: String(p.id),
    label: p.label
  }))

  // Default the owner to the business's owner when a business is chosen.
  const onBusinessChange = (value: string | null): void => {
    form.setFieldValue('businessId', value ?? '')
    const biz = businesses.data?.find((b) => String(b.id) === value)
    if (biz && !form.values.ownerPersonId) {
      form.setFieldValue('ownerPersonId', String(biz.ownerPersonId))
    }
  }

  const next = (): void => {
    if (active === 0 && !form.values.businessId) {
      form.setFieldError('businessId', 'Pick a business')
      return
    }
    setActive((s) => Math.min(s + 1, 3))
  }
  const back = (): void => setActive((s) => Math.max(s - 1, 0))

  const chosenProduct = products.data?.find((p) => String(p.id) === form.values.cardProductId)
  const chosenProgram = programs.data?.find((p) => String(p.id) === form.values.pointProgramId)
  const bonusPreview = bonusValueCents({
    cashAmountCents: form.values.rewardKind === 'cash' ? parseCents(form.values.cashDollars) : null,
    pointsAmount: form.values.pointsAmount === '' ? null : Number(form.values.pointsAmount),
    valuationCpp: chosenProgram?.valuationCpp ?? null
  })

  const submit = (): void => {
    const v = form.values
    createCard.mutate(
      {
        businessId: Number(v.businessId),
        ownerPersonId: v.ownerPersonId ? Number(v.ownerPersonId) : null,
        cardProductId: v.cardProductId ? Number(v.cardProductId) : null,
        network: v.network || chosenProduct?.network || null,
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
                pointProgramId:
                  v.rewardKind !== 'cash' && v.pointProgramId ? Number(v.pointProgramId) : null,
                pointsAmount:
                  v.rewardKind !== 'cash' && v.pointsAmount !== '' ? Number(v.pointsAmount) : null,
                cashAmountCents: v.rewardKind === 'cash' ? parseCents(v.cashDollars) : null,
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
  }

  const submitting = createCard.isPending || createBonus.isPending
  const bizLabel = businessOptions.find((b) => b.value === form.values.businessId)?.label

  return (
    <Modal opened={opened} onClose={close} title="Add a business card" size="xl">
      {noBusinesses ? (
        <Alert color="orange" icon={<IconAlertCircle size={18} />}>
          You need a business first. Add one under <strong>People &amp; Businesses</strong>, then come
          back.
        </Alert>
      ) : (
        <>
          <Stepper active={active} onStepClick={setActive} size="sm">
            <Stepper.Step label="Business" description="Whose card">
              <Stack mt="md">
                <Select
                  label="Business"
                  description="Business cards don't show up on your credit report, so add them here."
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
                  description="The person who applied (defaults to the business owner)."
                  data={peopleOptions}
                  searchable
                  clearable
                  {...form.getInputProps('ownerPersonId')}
                />
              </Stack>
            </Stepper.Step>

            <Stepper.Step label="Card" description="Product & details">
              <Stack mt="md">
                <Select
                  label="Product"
                  description="Pick a known business card, or leave blank and fill in later."
                  data={productOptions}
                  searchable
                  clearable
                  {...form.getInputProps('cardProductId')}
                />
                <Group grow>
                  <Select
                    label="Network"
                    data={NETWORKS as unknown as string[]}
                    clearable
                    {...form.getInputProps('network')}
                  />
                  <TextInput label="Last 4" maxLength={4} {...form.getInputProps('last4')} />
                </Group>
                <Group grow>
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
                    {...form.getInputProps('openedDate')}
                  />
                </Group>
              </Stack>
            </Stepper.Step>

            <Stepper.Step label="Bonus" description="Optional">
              <Stack mt="md">
                <Switch
                  label="This card has a signup bonus"
                  {...form.getInputProps('hasBonus', { type: 'checkbox' })}
                />
                {form.values.hasBonus && (
                  <>
                    <Select
                      label="Reward kind"
                      data={REWARD_KINDS as unknown as string[]}
                      {...form.getInputProps('rewardKind')}
                    />
                    {form.values.rewardKind === 'cash' ? (
                      <NumberInput
                        label="Cash bonus ($)"
                        min={0}
                        decimalScale={2}
                        thousandSeparator=","
                        {...form.getInputProps('cashDollars')}
                      />
                    ) : (
                      <Group grow>
                        <Select
                          label="Point program"
                          data={programOptions}
                          searchable
                          clearable
                          {...form.getInputProps('pointProgramId')}
                        />
                        <NumberInput
                          label="Points / miles"
                          min={0}
                          thousandSeparator=","
                          {...form.getInputProps('pointsAmount')}
                        />
                      </Group>
                    )}
                    <Group grow>
                      <NumberInput
                        label="Spend target ($)"
                        min={0}
                        decimalScale={2}
                        thousandSeparator=","
                        {...form.getInputProps('targetSpendDollars')}
                      />
                      <DateInput
                        label="Deadline"
                        valueFormat="YYYY-MM-DD"
                        clearable
                        {...form.getInputProps('deadline')}
                      />
                    </Group>
                    <Text size="sm" c="dimmed">
                      Estimated value: <strong>{formatCents(bonusPreview)}</strong>
                    </Text>
                  </>
                )}
              </Stack>
            </Stepper.Step>

            <Stepper.Completed>
              <Stack mt="md">
                <Text fw={600}>Review</Text>
                <List size="sm" spacing={4}>
                  <List.Item>Business: {bizLabel ?? '—'}</List.Item>
                  <List.Item>
                    Product: {chosenProduct?.label ?? 'unmatched (fill in later)'}
                  </List.Item>
                  <List.Item>Annual fee: {formatCents(parseCents(form.values.annualFeeDollars))}</List.Item>
                  <List.Item>
                    Opened: {form.values.openedDate ? dateToIso(form.values.openedDate) : '—'}
                  </List.Item>
                  <List.Item>
                    Signup bonus:{' '}
                    {form.values.hasBonus ? `${formatCents(bonusPreview)} value` : 'none'}
                  </List.Item>
                </List>
              </Stack>
            </Stepper.Completed>
          </Stepper>

          <Divider my="md" />
          <Group justify="space-between">
            <Button variant="default" onClick={active === 0 ? close : back}>
              {active === 0 ? 'Cancel' : 'Back'}
            </Button>
            {active < 3 ? (
              <Button onClick={next}>Next</Button>
            ) : (
              <Button onClick={submit} loading={submitting} leftSection={<IconCheck size={16} />}>
                Create card
              </Button>
            )}
          </Group>
        </>
      )}
    </Modal>
  )
}
