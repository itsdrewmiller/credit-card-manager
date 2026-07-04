import React, { useState } from 'react'
import { Drawer, Modal } from '@mantine/core'
import { showSuccess } from '../lib/mutations'

/** Structural subset of a tRPC useMutation result — keeps this hook
 *  router-agnostic. Wrap `mutate` at the call site when an entity's create
 *  input needs extra fields (e.g. cards add `source: 'manual'`). */
export interface EntityMutation<TInput> {
  mutate: (input: TInput, opts?: { onSuccess?: () => void }) => void
  isPending: boolean
}

export interface EntityFormProps<Row, FormValue> {
  /** Row being edited, or null when creating. */
  initial: Row | null
  submitting: boolean
  onSubmit: (value: FormValue) => void
  onCancel: () => void
}

/**
 * Shared create/edit machinery behind every CRUD page: open/editing state,
 * the create-vs-update submit, close-on-success + toast, and the Modal or
 * Drawer container. Cache invalidation stays on each page's useMutation
 * (`onSuccess: invalidate`) so per-entity fan-out remains explicit.
 *
 * The form remounts per open, so it reads `initial` into its own useForm.
 */
export function useEntityEditor<Row extends { id: number }, FormValue>(opts: {
  /** Lowercase noun for titles + toasts, e.g. 'person' -> "Add person". */
  entityLabel: string
  titles?: { create?: string; edit?: string | ((row: Row) => string) }
  container?: 'modal' | 'drawer'
  size?: string
  create: EntityMutation<FormValue>
  update: EntityMutation<FormValue & { id: number }>
  form: (props: EntityFormProps<Row, FormValue>) => React.ReactElement
}): { openCreate: () => void; openEdit: (row: Row) => void; element: React.ReactElement } {
  const [opened, setOpened] = useState(false)
  const [editing, setEditing] = useState<Row | null>(null)

  const submitting = opts.create.isPending || opts.update.isPending

  const submit = (value: FormValue): void => {
    const done = {
      onSuccess: () => {
        setOpened(false)
        showSuccess(editing ? `${capitalize(opts.entityLabel)} updated` : `${capitalize(opts.entityLabel)} added`)
      }
    }
    if (editing) opts.update.mutate({ id: editing.id, ...value }, done)
    else opts.create.mutate(value, done)
  }

  const title = editing
    ? typeof opts.titles?.edit === 'function'
      ? opts.titles.edit(editing)
      : (opts.titles?.edit ?? `Edit ${opts.entityLabel}`)
    : (opts.titles?.create ?? `Add ${opts.entityLabel}`)

  const body = opened
    ? opts.form({
        initial: editing,
        submitting,
        onSubmit: submit,
        onCancel: () => setOpened(false)
      })
    : null

  const element =
    opts.container === 'drawer' ? (
      <Drawer
        opened={opened}
        onClose={() => setOpened(false)}
        position="right"
        size={opts.size ?? 'lg'}
        title={title}
      >
        {body}
      </Drawer>
    ) : (
      <Modal opened={opened} onClose={() => setOpened(false)} size={opts.size} title={title}>
        {body}
      </Modal>
    )

  return {
    openCreate: () => {
      setEditing(null)
      setOpened(true)
    },
    openEdit: (row) => {
      setEditing(row)
      setOpened(true)
    },
    element
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
