/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  ChevronUp,
  Circle,
  CreditCard,
  FileText,
  KeyRound,
  ListChecks,
  RadioTower,
  TerminalSquare,
  type LucideIcon,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { IconBadge } from '@/components/ui/icon-badge'
import { getApiKeys } from '@/features/keys/api'
import type { ApiKey } from '@/features/keys/types'
import { useIsSidebarModuleEnabled } from '@/hooks/use-sidebar-config'
import { ROLE } from '@/lib/roles'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

import { useDashboardContentVisibility } from '../../hooks/use-status-data'
import { AnnouncementsPanel } from './announcements-panel'
import { ApiInfoPanel } from './api-info-panel'
import { CommunityGroupCard } from './community-group-card'
import { FAQPanel } from './faq-panel'
import { OverviewSectionLayout } from './overview-section-layout'
import { PerformanceHealthPanel } from './performance-health-panel'
import { SummaryCards } from './summary-cards'
import { UptimePanel } from './uptime-panel'

const SETUP_GUIDE_VISIBILITY_STORAGE_KEY =
  'dashboard_overview_setup_guide_expanded'

type DashboardActionPath =
  | '/keys'
  | '/wallet'
  | '/playground'
  | '/channels'
  | '/usage-logs'
  | '/pricing'

interface StartStep {
  title: string
  description: string
  to: DashboardActionPath
  icon: LucideIcon
  completed: boolean
}

interface QuickAction {
  title: string
  description: string
  to: DashboardActionPath
  icon: LucideIcon
  adminOnly?: boolean
}

function getSavedSetupGuideExpanded(): boolean | null {
  if (typeof window === 'undefined') return null
  try {
    const saved = window.localStorage.getItem(
      SETUP_GUIDE_VISIBILITY_STORAGE_KEY
    )
    if (saved === 'expanded') return true
    if (saved === 'collapsed') return false
  } catch {
    return null
  }
  return null
}

function saveSetupGuideExpanded(expanded: boolean): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(
      SETUP_GUIDE_VISIBILITY_STORAGE_KEY,
      expanded ? 'expanded' : 'collapsed'
    )
  } catch {
    /* The display preference is optional when storage is unavailable. */
  }
}

function getPreferredKey(keys: ApiKey[]): ApiKey | null {
  return keys.find((item) => item.status === 1) ?? keys[0] ?? null
}

function StartStepItem(props: { step: StartStep; index: number }) {
  const Icon = props.step.icon
  const StatusIcon = props.step.completed ? Check : Circle

  return (
    <li className='hover:bg-muted/30 flex min-w-0 gap-3 p-4 transition-colors'>
      <span
        className={cn(
          'bg-muted/40 flex size-8 shrink-0 items-center justify-center rounded-full border border-transparent',
          props.step.completed && 'border-success/40 bg-success/10'
        )}
      >
        <StatusIcon
          className={props.step.completed ? 'text-success size-4' : 'size-4'}
          aria-hidden='true'
        />
      </span>

      <Link
        to={props.step.to}
        className='focus-visible:ring-ring flex min-w-0 flex-1 items-center justify-between gap-3 rounded-md text-left outline-none focus-visible:ring-2'
      >
        <span className='flex min-w-0 items-start gap-2.5'>
          <span className='text-muted-foreground mt-0.5 flex size-6 shrink-0 items-center justify-center'>
            <Icon className='size-4' aria-hidden='true' />
          </span>
          <span className='flex min-w-0 flex-col gap-0.5'>
            <span className='flex items-center gap-2 text-sm font-medium'>
              <span className='text-muted-foreground font-mono text-xs tabular-nums'>
                {props.index + 1}.
              </span>
              <span className='truncate'>{props.step.title}</span>
            </span>
            <span className='text-muted-foreground line-clamp-2 text-xs leading-relaxed'>
              {props.step.description}
            </span>
          </span>
        </span>
        <ArrowRight
          className='text-muted-foreground size-4 shrink-0'
          aria-hidden='true'
        />
      </Link>
    </li>
  )
}

function QuickActionItem(props: { action: QuickAction }) {
  const Icon = props.action.icon

  return (
    <Button
      variant='secondary'
      className='h-auto justify-start rounded-xl px-3.5 py-3.5 text-left shadow-none'
      render={<Link to={props.action.to} />}
    >
      <span className='bg-background/70 text-muted-foreground ring-border/50 flex size-8 shrink-0 items-center justify-center rounded-lg ring-1'>
        <Icon className='size-4' aria-hidden='true' />
      </span>
      <span className='flex min-w-0 flex-1 flex-col gap-0.5'>
        <span className='truncate text-sm font-medium'>
          {props.action.title}
        </span>
        <span className='text-muted-foreground line-clamp-2 text-xs leading-relaxed'>
          {props.action.description}
        </span>
      </span>
    </Button>
  )
}

export function OverviewDashboard() {
  const { t } = useTranslation()
  const user = useAuthStore((state) => state.auth.user)
  const showSetupGuide = useIsSidebarModuleEnabled('console', 'setupGuide')
  const {
    apiInfo: showApiInfoPanel,
    announcements: showAnnouncementsPanel,
    faq: showFAQPanel,
    uptimeKuma: showUptimePanel,
  } = useDashboardContentVisibility()
  const [manualSetupGuideExpanded, setManualSetupGuideExpanded] = useState<
    boolean | null
  >(() => getSavedSetupGuideExpanded())

  const requestCount = Number(user?.request_count ?? 0)
  const remainQuota = Number(user?.quota ?? 0)
  const usedQuota = Number(user?.used_quota ?? 0)
  const isAdmin = Boolean(user?.role && user.role >= ROLE.ADMIN)

  const apiKeysQuery = useQuery({
    queryKey: ['dashboard', 'overview', 'api-keys'],
    queryFn: async () => {
      const result = await getApiKeys({ p: 1, size: 10 })
      return result.success ? (result.data?.items ?? []) : []
    },
    enabled: showSetupGuide,
    staleTime: 60 * 1000,
  })

  const preferredKey = useMemo(
    () => getPreferredKey(apiKeysQuery.data ?? []),
    [apiKeysQuery.data]
  )

  const startSteps = useMemo<StartStep[]>(
    () => [
      {
        title: t('Create API Key'),
        description: t('Create a key for your app or service'),
        to: '/keys',
        icon: KeyRound,
        completed: Boolean(preferredKey),
      },
      {
        title: t('Add credits'),
        description: t('Keep enough balance before production traffic'),
        to: '/wallet',
        icon: CreditCard,
        completed: remainQuota > 0 || usedQuota > 0,
      },
      {
        title: t('Send a request'),
        description: t('Verify routing with Playground or your client'),
        to: '/playground',
        icon: TerminalSquare,
        completed: requestCount > 0,
      },
    ],
    [preferredKey, remainQuota, requestCount, t, usedQuota]
  )

  const quickActions = useMemo<QuickAction[]>(
    () => [
      {
        title: t('API Keys'),
        description: t('Create a key for your app or service'),
        to: '/keys',
        icon: KeyRound,
      },
      {
        title: t('Channels'),
        description: t('Configure upstream providers and routing.'),
        to: '/channels',
        icon: RadioTower,
        adminOnly: true,
      },
      {
        title: t('Usage Logs'),
        description: t('Inspect requests, errors, and billing details'),
        to: '/usage-logs',
        icon: FileText,
      },
      {
        title: t('Pricing'),
        description: t('Review model rates before scaling traffic'),
        to: '/pricing',
        icon: BookOpen,
      },
    ],
    [t]
  )

  const visibleQuickActions = useMemo(
    () => quickActions.filter((action) => !action.adminOnly || isAdmin),
    [isAdmin, quickActions]
  )

  const completedStepCount = startSteps.filter((step) => step.completed).length
  const setupComplete = completedStepCount === startSteps.length
  const setupStatusReady = apiKeysQuery.isFetched && Boolean(user)
  const setupGuideExpanded =
    manualSetupGuideExpanded ?? (setupStatusReady && !setupComplete)
  const showContentPanels =
    isAdmin ||
    showAnnouncementsPanel ||
    showApiInfoPanel ||
    showFAQPanel ||
    showUptimePanel

  const handleSetupGuideToggle = () => {
    const nextExpanded = !setupGuideExpanded
    setManualSetupGuideExpanded(nextExpanded)
    saveSetupGuideExpanded(nextExpanded)
  }

  return (
    <OverviewSectionLayout
      summary={<SummaryCards />}
      community={<CommunityGroupCard />}
      informationPanels={
        showContentPanels ? (
          <>
            {isAdmin && <PerformanceHealthPanel />}
            {showAnnouncementsPanel && <AnnouncementsPanel />}
            {showApiInfoPanel && <ApiInfoPanel />}
            {showFAQPanel && <FAQPanel />}
            {showUptimePanel && <UptimePanel />}
          </>
        ) : null
      }
      setup={
        <section className='border-border/60 bg-card/95 overflow-hidden rounded-2xl border shadow-sm'>
          {showSetupGuide ? (
            <>
              <div className='border-border/50 bg-muted/15 flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-5'>
                <div className='flex min-w-0 items-center gap-3'>
                  <IconBadge
                    tone={setupComplete ? 'success' : 'info'}
                    size='sm'
                  >
                    {setupComplete ? <Check /> : <ListChecks />}
                  </IconBadge>
                  <div className='min-w-0'>
                    <div className='flex flex-wrap items-center gap-2'>
                      <h3 className='text-sm font-semibold'>
                        {setupComplete
                          ? t('Setup guide complete')
                          : t('Get started')}
                      </h3>
                      <Badge variant='secondary'>
                        {t('Setup progress: {{completed}}/{{total}}', {
                          completed: completedStepCount,
                          total: startSteps.length,
                        })}
                      </Badge>
                    </div>
                    <p className='text-muted-foreground mt-0.5 text-xs'>
                      {t(
                        'A focused home for keys, balance, routing, and service health.'
                      )}
                    </p>
                  </div>
                </div>
                <div className='flex items-center gap-2'>
                  {!setupComplete ? (
                    <Button size='sm' render={<Link to='/keys' />}>
                      <KeyRound data-icon='inline-start' />
                      {t('Create API Key')}
                    </Button>
                  ) : null}
                  <Button
                    variant='ghost'
                    size='sm'
                    onClick={handleSetupGuideToggle}
                    aria-expanded={setupGuideExpanded}
                  >
                    {setupGuideExpanded ? (
                      <ChevronUp data-icon='inline-start' />
                    ) : (
                      <ChevronDown data-icon='inline-start' />
                    )}
                    {setupGuideExpanded
                      ? t('Hide setup guide')
                      : t('Show setup guide')}
                  </Button>
                </div>
              </div>

              {setupGuideExpanded ? (
                <ol className='border-border/50 grid divide-y border-b md:grid-cols-3 md:divide-x md:divide-y-0'>
                  {startSteps.map((step, index) => (
                    <StartStepItem key={step.title} step={step} index={index} />
                  ))}
                </ol>
              ) : null}
            </>
          ) : null}

          <div className='p-3.5 sm:p-4'>
            <div className='mb-2.5 flex items-center justify-between gap-3'>
              <h3 className='text-sm font-semibold'>{t('Quick actions')}</h3>
            </div>
            <div className='grid gap-2 sm:grid-cols-2 xl:grid-cols-4'>
              {visibleQuickActions.map((action) => (
                <QuickActionItem key={action.title} action={action} />
              ))}
            </div>
          </div>
        </section>
      }
    />
  )
}
