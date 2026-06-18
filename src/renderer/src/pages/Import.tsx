import React, { useState } from 'react'
import {
  FileInput,
  Select,
  Button,
  Group,
  Table,
  Checkbox,
  Badge,
  Text,
  Card,
  SimpleGrid,
  Alert,
  Stack
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import {
  IconFileTypePdf,
  IconUpload,
  IconInfoCircle,
  IconCheck,
  IconBuildingStore
} from '@tabler/icons-react'
import { trpc } from '../trpc'
import { PageHeader } from '../components/PageHeader'
import { BusinessCardWizard } from '../components/BusinessCardWizard'
import { formatDate } from '@shared/format'
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

export function Import(): React.ReactElement {
  const utils = trpc.useUtils()
  const people = trpc.people.list.useQuery()
  const products = trpc.products.listForSelect.useQuery()

  const [file, setFile] = useState<File | null>(null)
  const [ownerPersonId, setOwnerPersonId] = useState<string>('')
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [include, setInclude] = useState<Record<number, boolean>>({})
  const [productOverride, setProductOverride] = useState<Record<number, string>>({})
  const [wizardOpen, setWizardOpen] = useState(false)

  const parse = trpc.importer.parseEquifax.useMutation({
    onSuccess: (data) => {
      setPreview(data)
      const init: Record<number, boolean> = {}
      data.tradelines.forEach((t, i) => (init[i] = t.isCreditCard))
      setInclude(init)
      setProductOverride({})
    },
    onError: (e) => notifications.show({ color: 'red', message: e.message })
  })

  const commit = trpc.importer.commit.useMutation({
    onSuccess: (res) => {
      void utils.cards.list.invalidate()
      void utils.cards.needsInfo.invalidate()
      void utils.system.health.invalidate()
      notifications.show({
        color: 'green',
        icon: <IconCheck size={16} />,
        message: `Imported ${res.created} cards. Fill in the rest under “Needs info”.`
      })
      setPreview(null)
      setFile(null)
    },
    onError: (e) => notifications.show({ color: 'red', message: e.message })
  })

  const runParse = async (): Promise<void> => {
    if (!file) return
    const buf = await file.arrayBuffer()
    let binary = ''
    const bytes = new Uint8Array(buf)
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
    parse.mutate({ base64: btoa(binary) })
  }

  const productOptions = (products.data ?? []).map((p) => ({ value: String(p.id), label: p.label }))
  const peopleOptions = (people.data ?? []).map((p) => ({ value: String(p.id), label: p.name }))

  const selectedCount = preview
    ? preview.tradelines.filter((_, i) => include[i]).length
    : 0

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
          network: chosen?.network ?? null,
          openedDate: t.openedDate,
          closedDate: t.closedDate,
          status: t.status,
          responsibility: t.responsibility
        }
      })
    commit.mutate({ ownerPersonId: ownerPersonId ? Number(ownerPersonId) : null, rows })
  }

  return (
    <>
      <PageHeader title="Import credit report" badge="Equifax" />
      <Text c="dimmed" mb="md">
        Upload an Equifax PDF to bootstrap your cards. Every tradeline becomes a card (a stub if it
        can&apos;t be matched); finish the details afterward under “Needs info”.
      </Text>

      <Card withBorder radius="md" padding="lg" mb="lg">
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
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
        <Group mt="md">
          <Button
            leftSection={<IconUpload size={16} />}
            onClick={runParse}
            disabled={!file}
            loading={parse.isPending}
          >
            Parse report
          </Button>
        </Group>
      </Card>

      <Alert color="gray" icon={<IconBuildingStore size={18} />} mb="lg" variant="light">
        <Group justify="space-between" wrap="nowrap">
          <Text size="sm">
            Business cards don&apos;t appear on your personal credit report — add those by hand with
            the guided wizard.
          </Text>
          <Button
            variant="default"
            size="xs"
            leftSection={<IconBuildingStore size={14} />}
            onClick={() => setWizardOpen(true)}
          >
            Add business card
          </Button>
        </Group>
      </Alert>

      <BusinessCardWizard opened={wizardOpen} onClose={() => setWizardOpen(false)} />

      {preview && (
        <>
          <Alert color="blue" icon={<IconInfoCircle />} mb="md" variant="light">
            Parsed <strong>{preview.total}</strong> tradelines · {preview.creditCards} look like
            credit cards · {preview.matched} matched a catalog issuer. Review and adjust below.
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
                      onChange={(e) =>
                        setInclude((s) => ({ ...s, [i]: e.currentTarget.checked }))
                      }
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
                      {t.responsibility === 'authorized_user' && (
                        <Badge size="xs" variant="light" color="grape">
                          Authorized user
                        </Badge>
                      )}
                      {t.status === 'closed' && (
                        <Badge size="xs" variant="light" color="gray">
                          Closed
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
                      onChange={(v) =>
                        setProductOverride((s) => ({ ...s, [i]: v ?? '' }))
                      }
                    />
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>

          <Group justify="flex-end">
            <Stack gap={2} align="flex-end">
              <Button
                onClick={runCommit}
                disabled={selectedCount === 0}
                loading={commit.isPending}
              >
                Import {selectedCount} card{selectedCount === 1 ? '' : 's'}
              </Button>
              <Text size="xs" c="dimmed">
                Last 4 digits are captured from the report where shown.
              </Text>
            </Stack>
          </Group>
        </>
      )}
    </>
  )
}
