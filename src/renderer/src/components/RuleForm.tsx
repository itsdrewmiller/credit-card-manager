import React from 'react'
import { Select, Switch, Textarea, TextInput, Group, Button, Text } from '@mantine/core'
import { useForm } from '@mantine/form'
import type { RecommendationRuleRow } from '../lib/types'

export interface RuleFormValue {
  kind: string
  enabled: boolean
  params: string
  notes: string | null
}

/** The vocabulary implemented in src/main/domain/recommend.ts. */
const KINDS: { value: string; label: string; hint: string; example: string }[] = [
  {
    value: 'no_duplicate_product',
    label: 'Skip cards already held',
    hint: 'Blocks offers for products the person/business already holds.',
    example: '{"scope": "holder"}'
  },
  {
    value: 'under_524',
    label: '5/24 gate',
    hint: 'Blocks listed issuers (all if null) for anyone at/over 5/24.',
    example: '{"issuers": ["Chase"]}'
  },
  {
    value: 'reserve_524_slots',
    label: 'Reserve 5/24 slots',
    hint: 'Near 5/24, blocks counting cards so no recommendation reaches 5/24; spendLastSlots lets protected issuers use the reserve.',
    example: '{"slots": 1, "forIssuers": ["Chase"], "spendLastSlots": false}'
  },
  {
    value: 'max_recent_apps_person',
    label: 'Application pacing (person)',
    hint: 'At most N applications per person in a trailing window.',
    example: '{"months": 3, "max": 2}'
  },
  {
    value: 'max_recent_apps_business',
    label: 'Application pacing (business)',
    hint: 'At most N applications per business in a trailing window.',
    example: '{"months": 6, "max": 2}'
  },
  {
    value: 'min_spend_capacity',
    label: 'Spend capacity',
    hint: 'Min-spend must fit your tracked monthly spend × the offer window.',
    example: '{"lookbackMonths": 3, "buffer": 1}'
  },
  {
    value: 'finish_open_bonuses',
    label: 'Finish current bonuses first',
    hint: 'Blocks all offers while remaining min-spend on open bonuses is N+ months of your tracked spend pace, with a projected wait-until date.',
    example: '{"maxOpenMonths": 2, "lookbackMonths": 3}'
  },
  {
    value: 'min_bonus_value',
    label: 'Minimum bonus value',
    hint: 'Skips offers worth less than a threshold (cents).',
    example: '{"minCents": 30000}'
  }
]

export function RuleForm({
  initial,
  submitting,
  onSubmit,
  onCancel
}: {
  initial: RecommendationRuleRow | null
  submitting: boolean
  onSubmit: (value: RuleFormValue) => void
  onCancel: () => void
}): React.ReactElement {
  const form = useForm({
    initialValues: {
      kind: initial?.kind ?? 'min_bonus_value',
      enabled: initial?.enabled ?? true,
      params: initial?.params ?? (KINDS.find((k) => k.value === 'min_bonus_value')?.example ?? '{}'),
      notes: initial?.notes ?? ''
    },
    validate: {
      params: (v) => {
        try {
          const parsed = JSON.parse(v)
          return typeof parsed === 'object' && parsed != null && !Array.isArray(parsed)
            ? null
            : 'Must be a JSON object'
        } catch {
          return 'Invalid JSON'
        }
      }
    }
  })

  const kind = KINDS.find((k) => k.value === form.values.kind)

  return (
    <form
      onSubmit={form.onSubmit((v) =>
        onSubmit({ kind: v.kind, enabled: v.enabled, params: v.params, notes: v.notes || null })
      )}
    >
      <Select
        label="Rule"
        data={KINDS.map((k) => ({ value: k.value, label: k.label }))}
        {...form.getInputProps('kind')}
        onChange={(v) => {
          form.setFieldValue('kind', v ?? 'min_bonus_value')
          if (!initial) {
            form.setFieldValue('params', KINDS.find((k) => k.value === v)?.example ?? '{}')
          }
        }}
        mb={4}
      />
      {kind && (
        <Text size="xs" c="dimmed" mb="sm">
          {kind.hint}
        </Text>
      )}
      <TextInput
        label="Parameters (JSON)"
        description={kind ? `e.g. ${kind.example}` : undefined}
        styles={{ input: { fontFamily: 'monospace' } }}
        {...form.getInputProps('params')}
        mb="sm"
      />
      <Switch label="Enabled" {...form.getInputProps('enabled', { type: 'checkbox' })} mb="sm" />
      <Textarea label="Notes" autosize minRows={2} {...form.getInputProps('notes')} mb="md" />
      <Group justify="flex-end">
        <Button variant="default" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={submitting}>
          {initial ? 'Save' : 'Add'}
        </Button>
      </Group>
    </form>
  )
}
