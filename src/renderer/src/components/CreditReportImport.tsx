import React, { useState } from 'react'
import {
  Modal,
  FileInput,
  Select,
  Button,
  Group,
  Table,
  Checkbox,
  Badge,
  Text,
  Alert,
  Stack,
  SimpleGrid
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconFileTypePdf, IconUpload, IconInfoCircle, IconCheck } from '@tabler/icons-react'
import { trpc } from '../trpc'
import { useInvalidateCards } from '../lib/mutations'
import { usePeopleOptions, useProductOptions } from '../lib/options'
import { formatDate } from '@shared/dates'
import type { ImportPreview, TradelineRow } from '../lib/types'

function ConfidenceBadge({ t }: { t: TradelineRow }): React.ReactElement {
  if (t.suggestedIssuerId == null)
    return (
      <Badge color="gray" variant="light">
        no match
      </Badge>
    )
  const c = t.confidence ?? 0
  const color = c >= 0.8 ? 'green' : c >= 0.6 ? 'yellow' : 'orange'
  return (
    <Badge color={color} variant="light">
      {t.suggestedIssuerName} · {Math.round(c * 100)}%
    </Badge>
  )
}

/** Equifax credit-report PDF import: parse, review tradelines, commit as cards. */
export function CreditReportImport({
  opened,
  onClose
}: {
  opened: boolean
  onClose: () => void
}): React.ReactElement {
  const invalidate = useInvalidateCards()
  const products = trpc.products.listForSelect.useQuery()
  const peopleOptions = usePeopleOptions()
  const productOptions = useProductOptions()

  const [file, setFile] = useState<File | null>(null)
  const [ownerPersonId, setOwnerPersonId] = useState<string>('')
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [include, setInclude] = useState<Record<number, boolean>>({})
  const [productOverride, setProductOverride] = useState<Record<number, string>>({})

  const reset = (): void => {
    setPreview(null)
    setFile(null)
    setInclude({})
    setProductOverride({})
  }

  const close = (): void => {
    reset()
    onClose()
  }

  const parse = trpc.importer.parseEquifax.useMutation({
    onSuccess: (data) => {
      setPreview(data)
      const init: Record<number, boolean> = {}
      // Default-select credit cards that aren't already in your cards.
      data.tradelines.forEach((t, i) => (init[i] = t.isCreditCard && !t.duplicate))
      setInclude(init)
      setProductOverride({})
    }
  })

  const commit = trpc.importer.commit.useMutation({
    onSuccess: (res) => {
      invalidate()
      notifications.show({
        color: 'green',
        icon: <IconCheck size={16} />,
        message: `Imported ${res.created} cards. Fill in the rest with the "Needs info" filter.`
      })
      close()
    }
  })

  const runParse = async (): Promise<void> => {
    if (!file) return
    const buf = await file.arrayBuffer()
    let binary = ''
    const bytes = new Uint8Array(buf)
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
    parse.mutate({ base64: btoa(binary) })
  }

  const selectedCount = preview ? preview.tradelines.filter((_, i) => include[i]).length : 0

  const runCommit = (): void => {
    if (!preview) return
    const rows = preview.tradelines
      .map((t, i) => ({ t, i }))
      .filter(({ i }) => include[i])
      .map(({ t, i }) => {
        const pid = productOverride[i]
        const chosen = products.data?.find((p) => String(p.id) === pid)
        return {
          creditorName: t.creditorName,
          accountType: t.accountType,
          accountNumberMask: t.accountNumberMask,
          last4: t.last4,
          cardProductId: pid ? Number(pid) : null,
          issuerId: chosen?.issuerId ?? t.suggestedIssuerId ?? null,
          network: chosen?.network ?? null,
          openedDate: t.openedDate,
          closedDate: t.closedDate,
          status: t.status
        }
      })
    commit.mutate({ ownerPersonId: ownerPersonId ? Number(ownerPersonId) : null, rows })
  }

  return (
    <Modal opened={opened} onClose={close} title="Import from a credit report" size="90%">
      <Text c="dimmed" size="sm" mb="md">
        Upload an Equifax PDF to bootstrap personal cards. Every tradeline becomes a card (a stub if
        it can&apos;t be matched); finish the details afterward with the &quot;Needs info&quot;
        filter. Business cards aren&apos;t on a personal report — add those with &quot;Add
        card&quot;.
      </Text>

      <SimpleGrid cols={{ base: 1, sm: 2 }} mb="md">
        <FileInput
          label="Equifax PDF"
          placeholder="Choose file…"
          accept="application/pdf"
          leftSection={<IconFileTypePdf size={18} />}
          value={file}
          onChange={setFile}
          clearable
        />
        <Select
          label="Whose report is this? (sets card owner)"
          placeholder="Pick a person"
          data={peopleOptions}
          searchable
          clearable
          value={ownerPersonId}
          onChange={(v) => setOwnerPersonId(v ?? '')}
        />
      </SimpleGrid>
      <Group mb="md">
        <Button
          leftSection={<IconUpload size={16} />}
          onClick={runParse}
          disabled={!file}
          loading={parse.isPending}
        >
          Parse report
        </Button>
      </Group>

      {preview && (
        <>
          <Alert color="blue" icon={<IconInfoCircle />} mb="md" variant="light">
            Parsed <strong>{preview.total}</strong> tradelines · {preview.creditCards} look like
            credit cards · {preview.matched} matched a catalog issuer
            {preview.duplicates > 0 && (
              <>
                {' '}
                · <strong>{preview.duplicates}</strong> already in your cards (unchecked)
              </>
            )}
            . Review and adjust below.
          </Alert>

          <Table withTableBorder verticalSpacing="sm" mb="md">
            <Table.Thead>
              <Table.Tr>
                <Table.Th w={40} />
                <Table.Th>Creditor (from report)</Table.Th>
                <Table.Th>Type</Table.Th>
                <Table.Th>Opened</Table.Th>
                <Table.Th>Match</Table.Th>
                <Table.Th miw={220}>Product (optional)</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {preview.tradelines.map((t, i) => (
                <Table.Tr key={i} opacity={include[i] ? 1 : 0.5}>
                  <Table.Td>
                    <Checkbox
                      checked={include[i] ?? false}
                      onChange={(e) => setInclude((s) => ({ ...s, [i]: e.currentTarget.checked }))}
                    />
                  </Table.Td>
                  <Table.Td>
                    <Group gap={6}>
                      <Text fw={500}>{t.creditorName}</Text>
                      {t.last4 && (
                        <Text size="xs" c="dimmed">
                          ····{t.last4}
                        </Text>
                      )}
                    </Group>
                    <Group gap={6}>
                      {t.duplicate && (
                        <Badge size="xs" variant="light" color="yellow">
                          Already imported
                        </Badge>
                      )}
                      {t.status === 'closed' && (
                        <Badge size="xs" variant="light" color="gray">
                          Closed{t.closedDate ? ` ${t.closedDate}` : ''}
                        </Badge>
                      )}
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" c={t.isCreditCard ? undefined : 'dimmed'}>
                      {t.accountType ?? '—'}
                    </Text>
                  </Table.Td>
                  <Table.Td>{formatDate(t.openedDate)}</Table.Td>
                  <Table.Td>
                    <ConfidenceBadge t={t} />
                  </Table.Td>
                  <Table.Td>
                    <Select
                      placeholder="Leave blank to fill later"
                      data={productOptions}
                      searchable
                      clearable
                      size="xs"
                      value={productOverride[i] ?? null}
                      onChange={(v) => setProductOverride((s) => ({ ...s, [i]: v ?? '' }))}
                    />
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>

          <Group justify="flex-end">
            <Stack gap={2} align="flex-end">
              <Button onClick={runCommit} disabled={selectedCount === 0} loading={commit.isPending}>
                Import {selectedCount} card{selectedCount === 1 ? '' : 's'}
              </Button>
              <Text size="xs" c="dimmed">
                Last 4 digits are captured from the report where shown.
              </Text>
            </Stack>
          </Group>
        </>
      )}
    </Modal>
  )
}
