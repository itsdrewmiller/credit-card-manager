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
  Alert,
  Text
} from '@mantine/core'
import { DateInput } from '@mantine/dates'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { IconAlertCircle, IconBuildingStore, IconCheck } from '@tabler/icons-react'
import { trpc } from '../trpc'
import { useInvalidateCards } from '../lib/mutations'
import { usePeopleOptions, useProgramOptions } from '../lib/options'
import { NETWORKS } from '@shared/constants'
import { centsToDollars, parseCents } from '@shared/format'
import { dateToIso } from '@shared/dates'
import {
  SignupBonusFields,
  EMPTY_BONUS_FIELDS,
  type SignupBonusFormFields,
  applyOfferToBonusFields,
  asBonusHost,
  bonusPayloadFromFields,
  syncDeadlineToOpened
} from './SignupBonusFields'

interface FormValues extends SignupBonusFormFields {
  businessId: string
  ownerPersonId: string
  cardProductId: string
  network: string
  last4: string
  annualFeeDollars: number | ''
  openedDate: Date | null
  reportsToPersonal: boolean
}

const initialValues: FormValues = {
  businessId: '',
  ownerPersonId: '',
  cardProductId: '',
  network: '',
  last4: '',
  annualFeeDollars: '',
  openedDate: null,
  reportsToPersonal: false,
  ...EMPTY_BONUS_FIELDS
}

export function BusinessCardWizard({
  opened,
  onClose
}: {
  opened: boolean
  onClose: () => void
}): React.ReactElement {
  const utils = trpc.useUtils()
  const invalidateCards = useInvalidateCards()
  const businesses = trpc.businesses.list.useQuery()
  const products = trpc.products.listForSelect.useQuery()
  const offers = trpc.offers.list.useQuery()
  const peopleOptions = usePeopleOptions()
  const programOptions = useProgramOptions()

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
  const productOptions = (products.data ?? [])
    .filter((p) => p.isBusiness)
    .map((p) => ({ value: String(p.id), label: p.label }))

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
    applyOfferToBonusFields(
      asBonusHost(form),
      offers.data?.find((o) => String(o.cardProductId) === value)
    )
  }

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
        reportsToPersonal: v.reportsToPersonal,
        status: 'open',
        source: 'manual'
      },
      {
        onSuccess: (card) => {
          const finish = (): void => {
            invalidateCards()
            void utils.bonuses.list.invalidate()
            void utils.benefits.list.invalidate()
            notifications.show({
              color: 'green',
              icon: <IconCheck size={16} />,
              message: 'Business card added'
            })
            close()
          }
          const bonus = bonusPayloadFromFields(v)
          if (bonus) {
            createBonus.mutate({ cardId: card.id, ...bonus }, { onSuccess: finish })
          } else {
            finish()
          }
        }
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
              defaultDate={new Date()}
              value={form.values.openedDate}
              onChange={(d) => syncDeadlineToOpened(asBonusHost(form), d)}
            />
          </SimpleGrid>

          <Switch
            label="Counts toward 5/24"
            description="Reports to the personal bureaus (Capital One, Discover, TD…)"
            {...form.getInputProps('reportsToPersonal', { type: 'checkbox' })}
            mb="sm"
          />

          <SignupBonusFields form={asBonusHost(form)} programOptions={programOptions} />

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
