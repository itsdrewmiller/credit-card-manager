import React from 'react'
import { Button, Group } from '@mantine/core'

/** The standard Cancel/submit footer every entity form ends with. */
export function FormFooter({
  editing,
  submitting,
  onCancel
}: {
  /** Editing an existing row ("Save") vs creating ("Add"). */
  editing: boolean
  submitting: boolean
  onCancel: () => void
}): React.ReactElement {
  return (
    <Group justify="flex-end">
      <Button variant="default" onClick={onCancel}>
        Cancel
      </Button>
      <Button type="submit" loading={submitting}>
        {editing ? 'Save' : 'Add'}
      </Button>
    </Group>
  )
}
