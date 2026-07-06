import React, { useEffect, useRef, useState } from 'react'
import {
  Modal,
  Stepper,
  TextInput,
  Select,
  Button,
  Group,
  Stack,
  Text,
  Title,
  List,
  ActionIcon
} from '@mantine/core'
import { IconUsers, IconBuildingStore, IconCreditCard, IconTrash } from '@tabler/icons-react'
import { useNavigate } from 'react-router-dom'
import { trpc } from '../trpc'
import { BUSINESS_TYPES } from '@shared/constants'

const DONE_KEY = 'ccm.setupDone'

/**
 * First-run setup: shown only when there are no people yet (a fresh install).
 * Walks through adding people, then businesses, then off to Cards.
 */
export function FirstRunSetup(): React.ReactElement | null {
  const navigate = useNavigate()
  const utils = trpc.useUtils()
  const people = trpc.people.list.useQuery()
  const businesses = trpc.businesses.list.useQuery()

  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const decided = useRef(false)

  // Decide once, when the people query first resolves.
  useEffect(() => {
    if (decided.current || !people.isSuccess) return
    decided.current = true
    if (localStorage.getItem(DONE_KEY) !== '1' && (people.data?.length ?? 0) === 0) setOpen(true)
  }, [people.isSuccess, people.data])

  const [personName, setPersonName] = useState('')
  const [bizName, setBizName] = useState('')
  const [bizOwner, setBizOwner] = useState('')
  const [bizType, setBizType] = useState('')

  const addPerson = trpc.people.create.useMutation({
    onSuccess: () => {
      setPersonName('')
      void utils.people.list.invalidate()
    }
  })
  const addBusiness = trpc.businesses.create.useMutation({
    onSuccess: () => {
      setBizName('')
      setBizType('')
      void utils.businesses.list.invalidate()
    }
  })
  const removePerson = trpc.people.delete.useMutation({
    onSuccess: () => void utils.people.list.invalidate()
  })
  const removeBusiness = trpc.businesses.delete.useMutation({
    onSuccess: () => void utils.businesses.list.invalidate()
  })

  if (!open) return null

  const peopleRows = people.data ?? []
  const bizRows = businesses.data ?? []
  const peopleOptions = peopleRows.map((p) => ({ value: String(p.id), label: p.name }))

  const finish = (): void => {
    localStorage.setItem(DONE_KEY, '1')
    setOpen(false)
    navigate('/cards')
  }
  const dismiss = (): void => {
    localStorage.setItem(DONE_KEY, '1')
    setOpen(false)
  }

  return (
    <Modal
      opened={open}
      onClose={dismiss}
      title="Welcome — let's set things up"
      size="lg"
      closeOnClickOutside={false}
    >
      <Stepper active={active} onStepClick={setActive} size="sm">
        <Stepper.Step label="People" icon={<IconUsers size={16} />}>
          <Stack mt="md">
            <Text size="sm" c="dimmed">
              Who are you tracking cards for? Add yourself first, then anyone else (spouse, family).
            </Text>
            <Group align="flex-end">
              <TextInput
                label="Name"
                placeholder="e.g. Drew"
                value={personName}
                onChange={(e) => setPersonName(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && personName.trim()) addPerson.mutate({ name: personName.trim() })
                }}
                style={{ flex: 1 }}
              />
              <Button
                onClick={() => addPerson.mutate({ name: personName.trim() })}
                disabled={!personName.trim()}
                loading={addPerson.isPending}
              >
                Add person
              </Button>
            </Group>
            <List spacing={4} size="sm">
              {peopleRows.map((p) => (
                <List.Item
                  key={p.id}
                  icon={
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      size="sm"
                      onClick={() => removePerson.mutate({ id: p.id })}
                    >
                      <IconTrash size={14} />
                    </ActionIcon>
                  }
                >
                  {p.name}
                </List.Item>
              ))}
            </List>
          </Stack>
        </Stepper.Step>

        <Stepper.Step label="Businesses" icon={<IconBuildingStore size={16} />}>
          <Stack mt="md">
            <Text size="sm" c="dimmed">
              Optional — add any businesses you open cards under (LLC, sole proprietor). You can skip
              this and add them later.
            </Text>
            <Group align="flex-end">
              <TextInput
                label="Business name"
                placeholder="e.g. Searchlight LLC"
                value={bizName}
                onChange={(e) => setBizName(e.currentTarget.value)}
                style={{ flex: 1 }}
              />
              <Select
                label="Owner"
                data={peopleOptions}
                value={bizOwner}
                onChange={(v) => setBizOwner(v ?? '')}
                w={150}
              />
              <Select
                label="Type"
                data={BUSINESS_TYPES as unknown as string[]}
                value={bizType}
                onChange={(v) => setBizType(v ?? '')}
                clearable
                w={140}
              />
              <Button
                onClick={() =>
                  addBusiness.mutate({
                    name: bizName.trim(),
                    ownerPersonId: Number(bizOwner),
                    type: bizType || null
                  })
                }
                disabled={!bizName.trim() || !bizOwner}
                loading={addBusiness.isPending}
              >
                Add
              </Button>
            </Group>
            <List spacing={4} size="sm">
              {bizRows.map((b) => (
                <List.Item
                  key={b.id}
                  icon={
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      size="sm"
                      onClick={() => removeBusiness.mutate({ id: b.id })}
                    >
                      <IconTrash size={14} />
                    </ActionIcon>
                  }
                >
                  {b.name} <Text span c="dimmed">({b.owner?.name})</Text>
                </List.Item>
              ))}
            </List>
          </Stack>
        </Stepper.Step>

        <Stepper.Completed>
          <Stack mt="md" align="center" gap="xs">
            <IconCreditCard size={36} />
            <Title order={4}>You&apos;re set up</Title>
            <Text size="sm" c="dimmed" ta="center">
              {peopleRows.length} {peopleRows.length === 1 ? 'person' : 'people'}
              {bizRows.length ? ` · ${bizRows.length} business${bizRows.length === 1 ? '' : 'es'}` : ''}.
              Next, add your cards — import a credit report or enter them by hand.
            </Text>
          </Stack>
        </Stepper.Completed>
      </Stepper>

      <Group justify="space-between" mt="xl">
        <Button variant="subtle" color="gray" onClick={dismiss}>
          Skip setup
        </Button>
        <Group>
          {active > 0 && (
            <Button variant="default" onClick={() => setActive((s) => s - 1)}>
              Back
            </Button>
          )}
          {active === 0 && (
            <Button onClick={() => setActive(1)} disabled={peopleRows.length === 0}>
              Next
            </Button>
          )}
          {active === 1 && <Button onClick={() => setActive(2)}>Next</Button>}
          {active >= 2 && (
            <Button leftSection={<IconCreditCard size={16} />} onClick={finish}>
              Add cards
            </Button>
          )}
        </Group>
      </Group>
    </Modal>
  )
}
