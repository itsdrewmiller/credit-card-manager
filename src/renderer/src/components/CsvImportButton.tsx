import React from 'react'
import { Button, FileButton } from '@mantine/core'
import { IconUpload } from '@tabler/icons-react'
import { readTextFile } from '../lib/download'

/** "Import CSV" file picker; hands the file's text to the caller's mutation. */
export function CsvImportButton({
  onText,
  loading
}: {
  onText: (text: string) => void
  loading: boolean
}): React.ReactElement {
  return (
    <FileButton
      onChange={(file) => {
        if (file) void readTextFile(file).then(onText)
      }}
      accept="text/csv,.csv"
    >
      {(props) => (
        <Button {...props} variant="default" leftSection={<IconUpload size={16} />} loading={loading}>
          Import CSV
        </Button>
      )}
    </FileButton>
  )
}
