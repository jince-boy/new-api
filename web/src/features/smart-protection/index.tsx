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
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Delete02Icon,
  EyeIcon,
  SaveIcon,
  Search01Icon,
  Shield01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { SectionPageLayout } from '@/components/layout/components/section-page-layout'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'

import {
  clearSmartProtectionEvents,
  getSmartProtectionChannels,
  getSmartProtectionEvent,
  getSmartProtectionEvents,
  getSmartProtectionSettings,
  updateSmartProtectionSettings,
  type SmartProtectionSettings,
} from './api'

const DEFAULT_SETTINGS: SmartProtectionSettings = {
  enabled: false,
  base_url: '',
  model: '',
  timeout_seconds: 15,
  max_context_chars: 24000,
  max_concurrent: 8,
  blocked_safeties: ['Controversial', 'Unsafe'],
  blocked_categories: ['Jailbreak'],
  channel_ids: [],
  save_content: true,
  warning_email: true,
  retention_days: 30,
  api_key_configured: false,
}

const QWEN_GUARD_CATEGORIES = [
  'Violent',
  'Non-violent Illegal Acts',
  'Sexual Content or Sexual Acts',
  'PII',
  'Suicide & Self-Harm',
  'Unethical Acts',
  'Politically Sensitive Topics',
  'Copyright Violation',
  'Jailbreak',
]

const SAFETY_LABEL_KEYS: Record<string, string> = {
  Safe: 'Smart protection safety: Safe',
  Controversial: 'Smart protection safety: Controversial',
  Unsafe: 'Smart protection safety: Unsafe',
}

const CATEGORY_LABEL_KEYS: Record<string, string> = {
  Violent: 'Smart protection category: Violent',
  'Non-violent Illegal Acts':
    'Smart protection category: Non-violent Illegal Acts',
  'Sexual Content or Sexual Acts':
    'Smart protection category: Sexual Content or Sexual Acts',
  PII: 'Smart protection category: PII',
  'Suicide & Self-Harm': 'Smart protection category: Suicide & Self-Harm',
  'Unethical Acts': 'Smart protection category: Unethical Acts',
  'Politically Sensitive Topics':
    'Smart protection category: Politically Sensitive Topics',
  'Copyright Violation': 'Smart protection category: Copyright Violation',
  Jailbreak: 'Smart protection category: Jailbreak',
}

function normalizeSettings(
  value: Partial<SmartProtectionSettings> | null | undefined
): SmartProtectionSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...value,
    // Older installations (or an empty option value) can deserialize these
    // JSON settings as null. Keep the form controlled so the page can still
    // render and the administrator can repair the configuration.
    blocked_safeties: Array.isArray(value?.blocked_safeties)
      ? value.blocked_safeties
      : DEFAULT_SETTINGS.blocked_safeties,
    blocked_categories: Array.isArray(value?.blocked_categories)
      ? value.blocked_categories
      : DEFAULT_SETTINGS.blocked_categories,
    channel_ids: Array.isArray(value?.channel_ids)
      ? value.channel_ids
      : DEFAULT_SETTINGS.channel_ids,
  }
}

function toLines(values: string[] | null | undefined) {
  return (values ?? []).join('\n')
}

function fromLines(value: string) {
  return value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)
}

function parseCategories(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value)
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === 'string')
    }
  } catch {
    return value ? [value] : []
  }
  return value ? [value] : []
}

export function SmartProtectionSection() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [apiKey, setApiKey] = useState('')
  const [channelSearch, setChannelSearch] = useState('')
  const [activeTab, setActiveTab] = useState('events')
  const [eventPage, setEventPage] = useState(1)
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null)
  const [clearEventsOpen, setClearEventsOpen] = useState(false)
  const settingsQuery = useQuery({
    queryKey: ['smart-protection-settings'],
    queryFn: getSmartProtectionSettings,
  })
  const channelsQuery = useQuery({
    queryKey: ['smart-protection-channels'],
    queryFn: getSmartProtectionChannels,
  })
  const eventsQuery = useQuery({
    queryKey: ['smart-protection-events', eventPage],
    queryFn: () => getSmartProtectionEvents(eventPage, 10),
    enabled: activeTab === 'events',
  })
  const eventDetailQuery = useQuery({
    queryKey: ['smart-protection-event', selectedEventId],
    queryFn: () => getSmartProtectionEvent(selectedEventId as number),
    enabled: selectedEventId !== null,
  })

  useEffect(() => {
    if (settingsQuery.data) setSettings(normalizeSettings(settingsQuery.data))
  }, [settingsQuery.data])

  const mutation = useMutation({
    mutationFn: updateSmartProtectionSettings,
    onSuccess: (next) => {
      setSettings(normalizeSettings(next))
      setApiKey('')
      queryClient.invalidateQueries({ queryKey: ['smart-protection-settings'] })
      toast.success(t('Smart protection settings saved'))
    },
    onError: () => toast.error(t('Failed to save smart protection settings')),
  })
  const clearEventsMutation = useMutation({
    mutationFn: clearSmartProtectionEvents,
    onSuccess: (result) => {
      setEventPage(1)
      setSelectedEventId(null)
      setClearEventsOpen(false)
      queryClient.removeQueries({ queryKey: ['smart-protection-event'] })
      queryClient.invalidateQueries({ queryKey: ['smart-protection-events'] })
      toast.success(
        t('Cleared {{count}} protection events', { count: result.deleted })
      )
    },
    onError: () => toast.error(t('Failed to clear protection events')),
  })

  const selectedChannels = useMemo(
    () => new Set(settings.channel_ids),
    [settings.channel_ids]
  )
  const filteredChannels = useMemo(() => {
    const query = channelSearch.trim().toLowerCase()
    if (!query) return channelsQuery.data ?? []
    return (channelsQuery.data ?? []).filter((channel) =>
      `${channel.id} ${channel.name}`.toLowerCase().includes(query)
    )
  }, [channelSearch, channelsQuery.data])
  const totalEventPages = Math.max(
    1,
    Math.ceil((eventsQuery.data?.total ?? 0) / 10)
  )
  const update = <K extends keyof SmartProtectionSettings>(
    key: K,
    value: SmartProtectionSettings[K]
  ) => setSettings((current) => ({ ...current, [key]: value }))

  const submit = () => {
    mutation.mutate({ ...settings, ...(apiKey ? { api_key: apiKey } : {}) })
  }

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>{t('Smart Protection')}</SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className='flex flex-col gap-4'
        >
          <TabsList>
            <TabsTrigger value='events'>
              {t('Recent protection events')}
            </TabsTrigger>
            <TabsTrigger value='configuration'>
              {t('Protection configuration')}
            </TabsTrigger>
          </TabsList>

          <TabsContent value='configuration'>
            <Card>
              <CardHeader>
                <CardTitle>{t('Smart Protection')}</CardTitle>
                <CardDescription>
                  {t(
                    'Use Qwen3Guard to inspect request context after quota pre-consumption and before the upstream model call.'
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className='space-y-6'>
                <Alert>
                  <HugeiconsIcon icon={Shield01Icon} aria-hidden='true' />
                  <AlertTitle>{t('Qwen3Guard configuration')}</AlertTitle>
                  <AlertDescription>
                    <span className='block'>
                      {t(
                        'The current implementation expects Qwen3Guard output with Safety and Categories fields. Context is split into bounded concurrent checks for the 32K model limit.'
                      )}
                    </span>
                    <span className='mt-1 block'>
                      {t(
                        'If the security model is unavailable or times out, the request continues without blocking.'
                      )}
                    </span>
                  </AlertDescription>
                </Alert>

                <FieldGroup className='grid gap-4 md:grid-cols-2'>
                  <Field
                    orientation='horizontal'
                    className='rounded-lg border p-3'
                  >
                    <FieldLabel htmlFor='smart-protection-enabled'>
                      {t('Enable smart protection')}
                    </FieldLabel>
                    <Switch
                      id='smart-protection-enabled'
                      checked={settings.enabled}
                      onCheckedChange={(value) => update('enabled', value)}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor='smart-protection-url'>
                      {t('Security model URL')}
                    </FieldLabel>
                    <Input
                      id='smart-protection-url'
                      value={settings.base_url}
                      placeholder={t(
                        'Example: https://security.example.com/v1'
                      )}
                      onChange={(event) =>
                        update('base_url', event.target.value)
                      }
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor='smart-protection-model'>
                      {t('Security model')}
                    </FieldLabel>
                    <Input
                      id='smart-protection-model'
                      value={settings.model}
                      placeholder={t('Example: security-model-name')}
                      onChange={(event) => update('model', event.target.value)}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor='smart-protection-key'>
                      {t('Security model API key')}
                    </FieldLabel>
                    <Input
                      id='smart-protection-key'
                      type='password'
                      value={apiKey}
                      placeholder={
                        settings.api_key_hint ||
                        t('Example: sk-your-security-key')
                      }
                      onChange={(event) => setApiKey(event.target.value)}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor='smart-protection-timeout'>
                      {t('Review timeout (seconds)')}
                    </FieldLabel>
                    <Input
                      id='smart-protection-timeout'
                      type='number'
                      min={1}
                      max={60}
                      value={settings.timeout_seconds}
                      onChange={(event) =>
                        update('timeout_seconds', Number(event.target.value))
                      }
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor='smart-protection-context'>
                      {t('Maximum context characters per check')}
                    </FieldLabel>
                    <Input
                      id='smart-protection-context'
                      type='number'
                      min={1000}
                      max={24000}
                      value={settings.max_context_chars}
                      onChange={(event) =>
                        update('max_context_chars', Number(event.target.value))
                      }
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor='smart-protection-concurrency'>
                      {t('Maximum concurrent checks')}
                    </FieldLabel>
                    <Input
                      id='smart-protection-concurrency'
                      type='number'
                      min={1}
                      max={32}
                      value={settings.max_concurrent}
                      onChange={(event) =>
                        update('max_concurrent', Number(event.target.value))
                      }
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor='smart-protection-retention'>
                      {t('Risk record retention (days)')}
                    </FieldLabel>
                    <Input
                      id='smart-protection-retention'
                      type='number'
                      min={1}
                      max={3650}
                      value={settings.retention_days}
                      onChange={(event) =>
                        update('retention_days', Number(event.target.value))
                      }
                    />
                  </Field>
                </FieldGroup>

                <FieldGroup className='grid gap-4 md:grid-cols-2'>
                  <Field>
                    <FieldLabel htmlFor='smart-protection-safety'>
                      {t('Blocked Safety values')}
                    </FieldLabel>
                    <Textarea
                      id='smart-protection-safety'
                      rows={4}
                      value={toLines(settings.blocked_safeties)}
                      onChange={(event) =>
                        update(
                          'blocked_safeties',
                          fromLines(event.target.value)
                        )
                      }
                    />
                    <FieldDescription className='text-xs'>
                      Safe · Controversial · Unsafe
                    </FieldDescription>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor='smart-protection-categories'>
                      {t('Blocked Categories')}
                    </FieldLabel>
                    <Textarea
                      id='smart-protection-categories'
                      rows={4}
                      value={toLines(settings.blocked_categories)}
                      onChange={(event) =>
                        update(
                          'blocked_categories',
                          fromLines(event.target.value)
                        )
                      }
                    />
                    <FieldDescription className='text-xs'>
                      {QWEN_GUARD_CATEGORIES.join(' · ')}
                    </FieldDescription>
                  </Field>
                </FieldGroup>

                <FieldGroup className='grid gap-4 md:grid-cols-2'>
                  <Field
                    orientation='horizontal'
                    className='rounded-lg border p-3'
                  >
                    <FieldLabel htmlFor='smart-protection-save'>
                      {t('Save risk content')}
                    </FieldLabel>
                    <Switch
                      id='smart-protection-save'
                      checked={settings.save_content}
                      onCheckedChange={(value) => update('save_content', value)}
                    />
                  </Field>
                  <Field
                    orientation='horizontal'
                    className='rounded-lg border p-3'
                  >
                    <FieldLabel htmlFor='smart-protection-email'>
                      {t('Send warning emails')}
                    </FieldLabel>
                    <Switch
                      id='smart-protection-email'
                      checked={settings.warning_email}
                      onCheckedChange={(value) =>
                        update('warning_email', value)
                      }
                    />
                  </Field>
                </FieldGroup>

                <FieldGroup className='gap-3'>
                  <Field>
                    <FieldLabel>{t('Protected channels')}</FieldLabel>
                    <FieldDescription>
                      {t(
                        'Only selected channels are reviewed. Leave all unchecked to keep smart protection inactive.'
                      )}
                    </FieldDescription>
                  </Field>
                  <div className='rounded-lg border'>
                    <div className='flex flex-wrap items-center gap-2 border-b p-2'>
                      <InputGroup className='min-w-56 flex-1'>
                        <InputGroupInput
                          value={channelSearch}
                          onChange={(event) =>
                            setChannelSearch(event.target.value)
                          }
                          placeholder={t('Search channels')}
                        />
                        <InputGroupAddon>
                          <HugeiconsIcon
                            icon={Search01Icon}
                            aria-hidden='true'
                          />
                        </InputGroupAddon>
                      </InputGroup>
                      <Badge variant='secondary'>
                        {settings.channel_ids.length} {t('selected')}
                      </Badge>
                      <Button
                        type='button'
                        variant='outline'
                        size='sm'
                        onClick={() => {
                          const next = new Set(selectedChannels)
                          for (const channel of filteredChannels) {
                            next.add(channel.id)
                          }
                          update(
                            'channel_ids',
                            [...next].sort((a, b) => a - b)
                          )
                        }}
                      >
                        {t('Select all')}
                      </Button>
                      <Button
                        type='button'
                        variant='ghost'
                        size='sm'
                        onClick={() => update('channel_ids', [])}
                        disabled={settings.channel_ids.length === 0}
                      >
                        {t('Clear selection')}
                      </Button>
                    </div>
                    <div className='grid max-h-72 gap-2 overflow-y-auto p-3 sm:grid-cols-2 lg:grid-cols-3'>
                      {filteredChannels.map((channel) => {
                        const selected = selectedChannels.has(channel.id)
                        return (
                          <label
                            key={channel.id}
                            className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${selected ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}
                          >
                            <Checkbox
                              checked={selected}
                              onCheckedChange={(checked) => {
                                const next = new Set(selectedChannels)
                                if (checked) next.add(channel.id)
                                else next.delete(channel.id)
                                update(
                                  'channel_ids',
                                  [...next].sort((a, b) => a - b)
                                )
                              }}
                            />
                            <span className='min-w-0 truncate text-sm'>
                              <span className='text-muted-foreground mr-1'>
                                #{channel.id}
                              </span>
                              {channel.name || t('Unnamed channel')}
                            </span>
                            <Badge
                              variant={
                                channel.status === 1 ? 'secondary' : 'outline'
                              }
                              className='ml-auto'
                            >
                              {channel.status === 1
                                ? t('Enabled')
                                : t('Disabled')}
                            </Badge>
                          </label>
                        )
                      })}
                      {filteredChannels.length === 0 && (
                        <Empty className='col-span-full border-0 py-6'>
                          <EmptyHeader>
                            <EmptyMedia variant='icon'>
                              <HugeiconsIcon
                                icon={Search01Icon}
                                aria-hidden='true'
                              />
                            </EmptyMedia>
                            <EmptyTitle>{t('No channels found')}</EmptyTitle>
                          </EmptyHeader>
                        </Empty>
                      )}
                    </div>
                  </div>
                </FieldGroup>

                <Button
                  type='button'
                  onClick={submit}
                  disabled={mutation.isPending}
                >
                  <HugeiconsIcon
                    icon={SaveIcon}
                    data-icon='inline-start'
                    aria-hidden='true'
                  />
                  {t('Save smart protection settings')}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value='events'>
            <Card>
              <CardHeader className='flex flex-row items-start justify-between gap-4'>
                <div className='space-y-1.5'>
                  <CardTitle>{t('Recent protection events')}</CardTitle>
                  <CardDescription>
                    {t('Blocked requests are visible only to administrators.')}
                  </CardDescription>
                </div>
                <Button
                  type='button'
                  variant='destructive'
                  size='sm'
                  disabled={(eventsQuery.data?.total ?? 0) === 0}
                  onClick={() => setClearEventsOpen(true)}
                >
                  <HugeiconsIcon
                    icon={Delete02Icon}
                    data-icon='inline-start'
                    aria-hidden='true'
                  />
                  {t('Clear protection events')}
                </Button>
              </CardHeader>
              <CardContent>
                {eventsQuery.isLoading && (
                  <div className='space-y-3'>
                    {[1, 2, 3].map((item) => (
                      <Skeleton key={item} className='h-20 w-full' />
                    ))}
                  </div>
                )}
                {!eventsQuery.isLoading &&
                  (eventsQuery.data?.items ?? []).length === 0 && (
                    <Empty className='border-0'>
                      <EmptyHeader>
                        <EmptyMedia variant='icon'>
                          <HugeiconsIcon
                            icon={Shield01Icon}
                            aria-hidden='true'
                          />
                        </EmptyMedia>
                        <EmptyTitle>{t('No protection events yet')}</EmptyTitle>
                      </EmptyHeader>
                    </Empty>
                  )}
                {!eventsQuery.isLoading &&
                  (eventsQuery.data?.items ?? []).length > 0 && (
                    <div className='space-y-3'>
                      {(eventsQuery.data?.items ?? []).map((event) => (
                        <div
                          key={event.id}
                          className='flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm'
                        >
                          <div className='min-w-0 flex-1'>
                            <div className='flex flex-wrap items-center gap-2 font-medium'>
                              <span className='truncate'>
                                {event.username ||
                                  event.email ||
                                  t('Unknown user')}
                              </span>
                              <Badge variant='destructive'>
                                {t(
                                  SAFETY_LABEL_KEYS[event.safety] ??
                                    event.safety
                                )}
                              </Badge>
                            </div>
                            <div className='text-muted-foreground mt-1 truncate'>
                              {event.channel_name || `#${event.channel_id}`} ·{' '}
                              {event.model_name} ·{' '}
                              {new Date(
                                event.created_at * 1000
                              ).toLocaleString()}
                            </div>
                          </div>
                          <Button
                            type='button'
                            variant='outline'
                            size='sm'
                            onClick={() => setSelectedEventId(event.id)}
                          >
                            <HugeiconsIcon
                              icon={EyeIcon}
                              data-icon='inline-start'
                            />
                            {t('View details')}
                          </Button>
                        </div>
                      ))}
                      <div className='flex items-center justify-between gap-3 pt-2'>
                        <FieldDescription>
                          {t('Page {{page}} of {{pages}}', {
                            page: eventPage,
                            pages: totalEventPages,
                          })}
                        </FieldDescription>
                        <div className='flex gap-2'>
                          <Button
                            type='button'
                            variant='outline'
                            size='sm'
                            disabled={eventPage <= 1 || eventsQuery.isFetching}
                            onClick={() => setEventPage((page) => page - 1)}
                            aria-label={t('Previous page')}
                          >
                            <HugeiconsIcon
                              icon={ArrowLeft01Icon}
                              aria-hidden='true'
                            />
                          </Button>
                          <Button
                            type='button'
                            variant='outline'
                            size='sm'
                            disabled={
                              eventPage >= totalEventPages ||
                              eventsQuery.isFetching
                            }
                            onClick={() => setEventPage((page) => page + 1)}
                            aria-label={t('Next page')}
                          >
                            <HugeiconsIcon
                              icon={ArrowRight01Icon}
                              aria-hidden='true'
                            />
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Dialog
          open={selectedEventId !== null}
          onOpenChange={(open) => {
            if (!open) setSelectedEventId(null)
          }}
        >
          <DialogContent className='max-h-[90vh] overflow-y-auto sm:max-w-2xl'>
            <DialogHeader>
              <DialogTitle>{t('Protection event details')}</DialogTitle>
              <DialogDescription>
                {t('Review the complete classification and request metadata.')}
              </DialogDescription>
            </DialogHeader>
            {eventDetailQuery.isLoading && (
              <div className='space-y-3'>
                <Skeleton className='h-5 w-1/2' />
                <Skeleton className='h-24 w-full' />
              </div>
            )}
            {!eventDetailQuery.isLoading && eventDetailQuery.data && (
              <div className='space-y-4 text-sm'>
                <dl className='grid gap-3 sm:grid-cols-2'>
                  <div>
                    <dt className='text-muted-foreground'>{t('User')}</dt>
                    <dd>
                      {eventDetailQuery.data.username ||
                        eventDetailQuery.data.email ||
                        t('Unknown user')}
                    </dd>
                  </div>
                  <div>
                    <dt className='text-muted-foreground'>{t('Email')}</dt>
                    <dd>{eventDetailQuery.data.email || '—'}</dd>
                  </div>
                  <div>
                    <dt className='text-muted-foreground'>{t('Time')}</dt>
                    <dd>
                      {new Date(
                        eventDetailQuery.data.created_at * 1000
                      ).toLocaleString()}
                    </dd>
                  </div>
                  <div>
                    <dt className='text-muted-foreground'>{t('Channel')}</dt>
                    <dd>
                      {eventDetailQuery.data.channel_name ||
                        `#${eventDetailQuery.data.channel_id}`}
                    </dd>
                  </div>
                  <div>
                    <dt className='text-muted-foreground'>{t('Request ID')}</dt>
                    <dd className='break-all'>
                      {eventDetailQuery.data.request_id || '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className='text-muted-foreground'>{t('Model')}</dt>
                    <dd>{eventDetailQuery.data.model_name}</dd>
                  </div>
                  <div>
                    <dt className='text-muted-foreground'>{t('Token')}</dt>
                    <dd>
                      {eventDetailQuery.data.token_name ||
                        `#${eventDetailQuery.data.token_id}`}
                    </dd>
                  </div>
                  <div>
                    <dt className='text-muted-foreground'>
                      {t('Guard model')}
                    </dt>
                    <dd>{eventDetailQuery.data.guard_model}</dd>
                  </div>
                  <div>
                    <dt className='text-muted-foreground'>
                      {t('Review time')}
                    </dt>
                    <dd>{eventDetailQuery.data.review_time_ms} ms</dd>
                  </div>
                </dl>
                <div>
                  <div className='text-muted-foreground mb-1'>
                    {t('Safety and categories')}
                  </div>
                  <div className='flex flex-wrap gap-2'>
                    <Badge variant='destructive'>
                      {t(
                        SAFETY_LABEL_KEYS[eventDetailQuery.data.safety] ??
                          eventDetailQuery.data.safety
                      )}
                    </Badge>
                    {parseCategories(eventDetailQuery.data.categories).map(
                      (category) => (
                        <Badge key={category} variant='secondary'>
                          {t(CATEGORY_LABEL_KEYS[category] ?? category)}
                        </Badge>
                      )
                    )}
                  </div>
                </div>
                <div>
                  <div className='text-muted-foreground mb-1'>
                    {t('Risk content')}
                  </div>
                  <ScrollArea
                    data-testid='risk-content-scroll-area'
                    className='bg-muted/50 h-[min(45vh,420px)] max-h-[420px] min-h-32 rounded-lg border'
                  >
                    <pre className='min-h-24 p-3 text-xs leading-relaxed break-all whitespace-pre-wrap'>
                      {eventDetailQuery.data.content ||
                        t('Risk content was not saved')}
                    </pre>
                  </ScrollArea>
                </div>
                {eventDetailQuery.data.raw_result && (
                  <div>
                    <div className='text-muted-foreground mb-1'>
                      {t('Guard response')}
                    </div>
                    <ScrollArea className='bg-muted/50 max-h-48 rounded-lg border'>
                      <pre className='p-3 text-xs leading-relaxed break-all whitespace-pre-wrap'>
                        {eventDetailQuery.data.raw_result}
                      </pre>
                    </ScrollArea>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
        <AlertDialog open={clearEventsOpen} onOpenChange={setClearEventsOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t('Clear all protection events?')}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t(
                  'This permanently deletes all smart protection event records and cannot be undone.'
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={clearEventsMutation.isPending}>
                {t('Cancel')}
              </AlertDialogCancel>
              <AlertDialogAction
                variant='destructive'
                disabled={clearEventsMutation.isPending}
                onClick={() => clearEventsMutation.mutate()}
              >
                {t('Clear all')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
