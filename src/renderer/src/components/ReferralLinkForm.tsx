import React from 'react'
import { TextInput, Select, Textarea } from '@mantine/core'
import { useForm } from '@mantine/form'
import { FormFooter } from './FormFooter'
import type { ReferralLinkRow } from '../lib/types'

export interface ReferralLinkFormValue {
  cardProductId: number
  url: string
  ownerPersonId: number | null
  ownerBusinessId: number | null
  notes: string | null
}

interface Option {
  value: string
  label: string
}

/** Person and business choices share one Select; values are prefixed to tell
 *  them apart ('p:3' / 'b:7'). */
export function ReferralLinkForm({
  initial,
  peopleOptions,
  businessOptions,
  productOptions,
  submitting,
  onSubmit,
  onCancel
}: {
  initial: ReferralLinkRow | null
  peopleOptions: Option[]
  businessOptions: Option[]
  productOptions: Option[]
  submitting: boolean
  onSubmit: (value: ReferralLinkFormValue) => void
  onCancel: () => void
}): React.ReactElement {
  const beneficiaryOptions = [
    { group: 'People', items: peopleOptions.map((o) => ({ ...o, value: `p:${o.value}` })) },
    { group: 'Businesses', items: businessOptions.map((o) => ({ ...o, value: `b:${o.value}` })) }
  ]

  const form = useForm({
    initialValues: {
      cardProductId: initial ? String(initial.cardProductId) : '',
      url: initial?.url ?? '',
      beneficiary: initial?.ownerPersonId
        ? `p:${initial.ownerPersonId}`
        : initial?.ownerBusinessId
          ? `b:${initial.ownerBusinessId}`
          : '',
      notes: initial?.notes ?? ''
    },
    validate: {
      cardProductId: (v) => (v ? null : 'Product is required'),
      url: (v) => (/^https?:\/\/.+/.test(v) ? null : 'Must be a full https:// link'),
      beneficiary: (v) => (v ? null : 'Pick who earns this referral')
    }
  })

  const submit = form.onSubmit((v) =>
    onSubmit({
      cardProductId: Number(v.cardProductId),
      url: v.url.trim(),
      ownerPersonId: v.beneficiary.startsWith('p:') ? Number(v.beneficiary.slice(2)) : null,
      ownerBusinessId: v.beneficiary.startsWith('b:') ? Number(v.beneficiary.slice(2)) : null,
      notes: v.notes || null
    })
  )

  return (
    <form onSubmit={submit}>
      <Select
        label="Product"
        withAsterisk
        data={productOptions}
        searchable
        {...form.getInputProps('cardProductId')}
        mb="sm"
      />
      <TextInput
        label="Referral link"
        withAsterisk
        placeholder="https://…"
        {...form.getInputProps('url')}
        mb="sm"
      />
      <Select
        label="Beneficiary"
        withAsterisk
        description="Who earns the referral when this link is used"
        data={beneficiaryOptions}
        searchable
        {...form.getInputProps('beneficiary')}
        mb="sm"
      />
      <Textarea label="Notes" autosize minRows={2} {...form.getInputProps('notes')} mb="md" />
      <FormFooter editing={initial != null} submitting={submitting} onCancel={onCancel} />
    </form>
  )
}
