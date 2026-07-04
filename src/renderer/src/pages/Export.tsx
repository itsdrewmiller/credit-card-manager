import React, { useState } from 'react'
import {
  Card,
  Title,
  Text,
  Button,
  Group,
  SimpleGrid,
  Stack,
  Divider,
  FileInput,
  Alert
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import {
  IconDownload,
  IconFileSpreadsheet,
  IconDatabaseExport,
  IconAlertTriangle,
  IconFileImport
} from '@tabler/icons-react'
import { trpc } from '../trpc'
import { PageHeader } from '../components/PageHeader'
import { toCsv } from '../lib/csv'
import { downloadText, readTextFile } from '../lib/download'

const CSV_TABLES = ['card', 'signupBonus', 'benefit', 'pointProgram', 'referral'] as const

function stamp(): string {
  return new Date().toISOString().slice(0, 10)
}

export function Export(): React.ReactElement {
  const utils = trpc.useUtils()
  const [restoreFile, setRestoreFile] = useState<File | null>(null)

  const restore = trpc.exporter.restore.useMutation({
    onSuccess: (res) => {
      // Everything changed — refresh all caches.
      void utils.invalidate()
      notifications.show({ color: 'green', message: `Restored ${res.inserted} records.` })
      setRestoreFile(null)
    }
  })

  const exportJson = async (): Promise<void> => {
    const snap = await utils.exporter.snapshot.fetch()
    downloadText(`card-manager-backup-${stamp()}.json`, JSON.stringify(snap, null, 2), 'application/json')
    notifications.show({ message: 'JSON backup downloaded' })
  }

  const exportCsv = async (): Promise<void> => {
    const snap = await utils.exporter.snapshot.fetch()
    let count = 0
    for (const t of CSV_TABLES) {
      const rows = (snap.data[t] ?? []) as Array<Record<string, unknown>>
      if (rows.length === 0) continue
      downloadText(`${t}-${stamp()}.csv`, toCsv(rows), 'text/csv')
      count++
    }
    notifications.show({
      message: count ? `Exported ${count} CSV file${count === 1 ? '' : 's'}` : 'Nothing to export yet'
    })
  }

  const runRestore = async (): Promise<void> => {
    if (!restoreFile) return
    if (
      !window.confirm(
        'Restoring will REPLACE all current data with the contents of this backup. Continue?'
      )
    )
      return
    try {
      const text = await readTextFile(restoreFile)
      const snap = JSON.parse(text)
      if (typeof snap?.version !== 'number' || typeof snap?.data !== 'object') {
        notifications.show({ color: 'red', message: 'Not a valid backup file' })
        return
      }
      restore.mutate({ version: snap.version, data: snap.data })
    } catch (e) {
      notifications.show({ color: 'red', message: `Could not read file: ${String(e)}` })
    }
  }

  return (
    <>
      <PageHeader title="Export & Backup" />
      <Text c="dimmed" mb="lg">
        Your data lives only on this machine. Export regularly so you have a copy — and a way back to
        a spreadsheet.
      </Text>

      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <Card withBorder radius="md" padding="lg">
          <Group gap="sm" mb="xs">
            <IconDatabaseExport size={22} />
            <Title order={4}>Full backup (JSON)</Title>
          </Group>
          <Text size="sm" c="dimmed" mb="md">
            A complete snapshot of every table. This is your portable, restorable backup.
          </Text>
          <Button leftSection={<IconDownload size={16} />} onClick={exportJson}>
            Download JSON backup
          </Button>
        </Card>

        <Card withBorder radius="md" padding="lg">
          <Group gap="sm" mb="xs">
            <IconFileSpreadsheet size={22} />
            <Title order={4}>Spreadsheet export (CSV)</Title>
          </Group>
          <Text size="sm" c="dimmed" mb="md">
            One CSV per table (cards, bonuses, benefits, points, referrals) for analysis in Excel or
            Sheets.
          </Text>
          <Button
            variant="light"
            leftSection={<IconDownload size={16} />}
            onClick={exportCsv}
          >
            Download CSVs
          </Button>
        </Card>
      </SimpleGrid>

      <Divider my="xl" />

      <Card withBorder radius="md" padding="lg">
        <Group gap="sm" mb="xs">
          <IconFileImport size={22} />
          <Title order={4}>Restore from backup</Title>
        </Group>
        <Alert color="orange" icon={<IconAlertTriangle size={18} />} variant="light" mb="md">
          Restoring <strong>replaces all current data</strong> with the backup&apos;s contents.
        </Alert>
        <Stack gap="sm" maw={460}>
          <FileInput
            placeholder="Choose a .json backup…"
            accept="application/json"
            value={restoreFile}
            onChange={setRestoreFile}
            clearable
          />
          <Group>
            <Button
              color="red"
              variant="light"
              disabled={!restoreFile}
              loading={restore.isPending}
              onClick={runRestore}
            >
              Restore (replaces everything)
            </Button>
          </Group>
        </Stack>
      </Card>
    </>
  )
}
