import React from 'react'
import { AppShell, Group, Text, NavLink, ScrollArea, Badge } from '@mantine/core'
import {
  IconLayoutDashboard,
  IconUsers,
  IconCreditCard,
  IconGift,
  IconTicket,
  IconRepeat,
  IconSparkles,
  IconShare,
  IconDownload
} from '@tabler/icons-react'
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom'
import { trpc } from './trpc'
import { Dashboard } from './pages/Dashboard'
import { PeopleAndBusinesses } from './pages/PeopleAndBusinesses'
import { Cards } from './pages/Cards'
import { Bonuses } from './pages/Bonuses'
import { Benefits } from './pages/Benefits'
import { Referrals } from './pages/Referrals'
import { Recurring } from './pages/Recurring'
import { Recommendations } from './pages/Recommendations'
import { Export } from './pages/Export'
import { FirstRunSetup } from './components/FirstRunSetup'

interface NavItem {
  to: string
  label: string
  icon: React.ReactNode
}

const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: <IconLayoutDashboard size={18} /> },
  { to: '/people', label: 'People & Businesses', icon: <IconUsers size={18} /> },
  { to: '/cards', label: 'Cards', icon: <IconCreditCard size={18} /> },
  { to: '/bonuses', label: 'Signup Bonuses', icon: <IconGift size={18} /> },
  { to: '/benefits', label: 'Benefits', icon: <IconTicket size={18} /> },
  { to: '/referrals', label: 'Referrals', icon: <IconShare size={18} /> },
  { to: '/recurring', label: 'Card Assignments', icon: <IconRepeat size={18} /> },
  { to: '/recommendations', label: 'Recommendations', icon: <IconSparkles size={18} /> },
  { to: '/export', label: 'Export & Backup', icon: <IconDownload size={18} /> }
]

/** Cards missing churning-critical info, surfaced on the Cards nav item. */
function NeedsInfoBadge(): React.ReactElement | null {
  const needs = trpc.cards.needsInfo.useQuery()
  if (!needs.data || needs.data.length === 0) return null
  return (
    <Badge size="sm" circle color="orange">
      {needs.data.length}
    </Badge>
  )
}

export function App(): React.ReactElement {
  const location = useLocation()
  const navigate = useNavigate()

  return (
    <AppShell navbar={{ width: 240, breakpoint: 'sm' }} padding="md">
      <FirstRunSetup />
      <AppShell.Navbar p="sm">
        <Group gap="xs" mb="md" px="xs">
          <IconCreditCard size={22} />
          <Text fw={700}>Card Manager</Text>
        </Group>
        <ScrollArea>
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              active={location.pathname === item.to}
              label={item.label}
              leftSection={item.icon}
              rightSection={item.to === '/cards' ? <NeedsInfoBadge /> : undefined}
              onClick={() => navigate(item.to)}
            />
          ))}
        </ScrollArea>
        <Text size="xs" c="dimmed" mt="auto" px="xs" pt="xs">
          v{__APP_VERSION__}
        </Text>
      </AppShell.Navbar>

      <AppShell.Main>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/people" element={<PeopleAndBusinesses />} />
          <Route path="/cards" element={<Cards />} />
          <Route path="/bonuses" element={<Bonuses />} />
          <Route path="/benefits" element={<Benefits />} />
          <Route path="/referrals" element={<Referrals />} />
          <Route path="/recurring" element={<Recurring />} />
          <Route path="/recommendations" element={<Recommendations />} />
          <Route path="/export" element={<Export />} />
        </Routes>
      </AppShell.Main>
    </AppShell>
  )
}
