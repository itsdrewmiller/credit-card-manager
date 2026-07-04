import React from 'react'
import { modals } from '@mantine/modals'

/** Styled replacement for window.confirm on destructive actions. */
export function confirmDelete(opts: { message: string; onConfirm: () => void }): void {
  modals.openConfirmModal({
    title: 'Confirm delete',
    children: React.createElement('span', null, opts.message),
    labels: { confirm: 'Delete', cancel: 'Cancel' },
    confirmProps: { color: 'red' },
    onConfirm: opts.onConfirm
  })
}
