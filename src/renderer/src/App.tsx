import React from 'react'
import { AppShell, Group, Text, NavLink, ScrollArea, Badge } from '@mantine/core'
import {
  IconLayoutDashboard,
  IconInbox,
  IconUsers,
  IconCreditCard,
  IconGift,
  IconCoins,
  IconTicket,
  IconChartBar,
  IconShare,
  IconFileImport,
  IconDownload
} from '@tabler/icons-react'
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom'
import { trpc } from './trpc'
import { Dashboard } from './pages/Dashboard'
import { NeedsInfo } from './pages/NeedsInfo'
import { PeopleAndBusinesses } from './pages/PeopleAndBusinesses'
import { Cards } from './pages/Cards'
import { Points } from './pages/Points'
import { Bonuses } from './pages/Bonuses'
import { Benefits } from './pages/Benefits'
import { Velocity } from './pages/Velocity'
import { Referrals } from './pages/Referrals'
import { Import } from './pages/Import'
import { Export } from './pages/Export'

interface NavItem {
  to: string
  label: string
  icon: React.ReactNode
  phase?: string
}

const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: <IconLayoutDashboard size={18} /> },
  { to: '/needs-info', label: 'Needs info', icon: <IconInbox size={18} /> },
  { to: '/people', label: 'People & Businesses', icon: <IconUsers size={18} /> },
  { to: '/cards', label: 'Cards', icon: <IconCreditCard size={18} /> },
  { to: '/bonuses', label: 'Signup Bonuses', icon: <IconGift size={18} /> },
  { to: '/points', label: 'Points', icon: <IconCoins size={18} /> },
  { to: '/benefits', label: 'Benefits', icon: <IconTicket size={18} /> },
  { to: '/velocity', label: 'Velocity (5/24)', icon: <IconChartBar size={18} /> },
  { to: '/referrals', label: 'Referrals', icon: <IconShare size={18} /> },
  { to: '/import', label: 'Import Report', icon: <IconFileImport size={18} /> },
  { to: '/export', label: 'Export & Backup', icon: <IconDownload size={18} /> }
]

function NavBadge(): React.ReactElement | null {
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
              rightSection={
                item.to === '/needs-info' ? (
                  <NavBadge />
                ) : item.phase ? (
                  <Badge size="xs" variant="light" color="gray">
                    {item.phase}
                  </Badge>
                ) : undefined
              }
              onClick={() => navigate(item.to)}
            />
          ))}
        </ScrollArea>
      </AppShell.Navbar>

      <AppShell.Main>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/needs-info" element={<NeedsInfo />} />
          <Route path="/people" element={<PeopleAndBusinesses />} />
          <Route path="/cards" element={<Cards />} />
          <Route path="/bonuses" element={<Bonuses />} />
          <Route path="/points" element={<Points />} />
          <Route path="/benefits" element={<Benefits />} />
          <Route path="/velocity" element={<Velocity />} />
          <Route path="/referrals" element={<Referrals />} />
          <Route path="/import" element={<Import />} />
          <Route path="/export" element={<Export />} />
        </Routes>
      </AppShell.Main>
    </AppShell>
  )
}
