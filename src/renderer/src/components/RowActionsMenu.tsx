import React from 'react'
import { ActionIcon, Menu } from '@mantine/core'
import { IconDots, IconEdit, IconTrash } from '@tabler/icons-react'
import { confirmDelete } from '../lib/confirm'

/** The trailing ⋯ cell every table row uses: Edit, optional extras, Delete
 *  (behind a styled confirm). */
export function RowActionsMenu({
  onEdit,
  onDelete,
  deleteLabel,
  extraItems
}: {
  onEdit: () => void
  /** Called only after the user confirms. */
  onDelete: () => void
  /** Confirm prompt, e.g. "Delete Chase Sapphire?" */
  deleteLabel: string
  /** Extra Menu.Items rendered between Edit and Delete. */
  extraItems?: React.ReactNode
}): React.ReactElement {
  return (
    <Menu position="bottom-end" withinPortal>
      <Menu.Target>
        <ActionIcon variant="subtle" color="gray">
          <IconDots size={18} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item leftSection={<IconEdit size={16} />} onClick={onEdit}>
          Edit
        </Menu.Item>
        {extraItems}
        <Menu.Item
          color="red"
          leftSection={<IconTrash size={16} />}
          onClick={() => confirmDelete({ message: deleteLabel, onConfirm: onDelete })}
        >
          Delete
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  )
}
