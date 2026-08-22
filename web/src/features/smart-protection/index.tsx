/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import Add01Icon from '@hugeicons/core-free-icons/Add01Icon'
import Cancel01Icon from '@hugeicons/core-free-icons/Cancel01Icon'
import Delete02Icon from '@hugeicons/core-free-icons/Delete02Icon'
import EyeIcon from '@hugeicons/core-free-icons/EyeIcon'
import SaveIcon from '@hugeicons/core-free-icons/SaveIcon'
import Search01Icon from '@hugeicons/core-free-icons/Search01Icon'
import { HugeiconsIcon } from '@hugeicons/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  RefreshCw,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
import { SectionPageLayout } from '@/components/layout/components/section-page-layout'
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
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { getPageNumbers } from '@/lib/utils'

import {
  clearSmartProtectionEvents,
  getSmartProtectionChannels,
  getSmartProtectionEvent,
  getSmartProtectionEvents,
  getSmartProtectionSettings,
  updateSmartProtectionSettings,
  type SmartProtectionEmailRule,
  type SmartProtectionRule,
  type SmartProtectionSettings,
} from './api'

const CATEGORIES = [
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
const SAFETIES = ['Safe', 'Controversial', 'Unsafe']
const EVENT_PAGE_SIZE_OPTIONS = [10, 20, 30, 40, 50, 100] as const
const EVENT_PAGE_SIZE_ITEMS = EVENT_PAGE_SIZE_OPTIONS.map((pageSize) => ({
  value: `${pageSize}`,
  label: pageSize,
}))
const SAFETY_KEYS: Record<string, string> = {
  Safe: 'Smart protection safety: Safe',
  Controversial: 'Smart protection safety: Controversial',
  Unsafe: 'Smart protection safety: Unsafe',
}
const CATEGORY_KEYS: Record<string, string> = Object.fromEntries(
  CATEGORIES.map((category) => [
    category,
    `Smart protection category: ${category}`,
  ])
)
const DEFAULT_BODY =
  '<h2>Security warning</h2><p>This request matched a smart protection rule.</p><p>Safety: {{safety}}</p><p>Categories: {{categories}}</p><p>Request ID: {{request_id}}</p>'
const DEFAULT_SETTINGS: SmartProtectionSettings = {
  enabled: false,
  base_url: '',
  model: '',
  timeout_seconds: 15,
  max_context_chars: 24000,
  max_concurrent: 8,
  blocked_rules: [],
  channel_ids: [],
  save_content: true,
  warning_email: true,
  email_rules: [
    {
      id: 'template-1',
      name: 'Default warning',
      subject: 'Security warning',
      body: DEFAULT_BODY,
      enabled: true,
    },
  ],
  retention_days: 30,
  api_key_configured: false,
}

let ruleSequence = 0
let templateSequence = 0

function makeRule(
  value?: Partial<SmartProtectionRule>,
  index = 0
): SmartProtectionRule {
  ruleSequence += 1
  const id = value?.id || `rule-${index + 1}-${ruleSequence}`
  return {
    id,
    client_id: value?.client_id || `rule-client-${id}`,
    name: value?.name || '',
    safety: value?.safety || '',
    categories: Array.isArray(value?.categories) ? value.categories : [],
    match_mode: value?.match_mode === 'all' ? 'all' : 'any',
    send_email: value?.send_email === true,
    record: value?.record === true,
    block: value?.block === true,
    email_template_id: value?.email_template_id || '',
    actions_configured: true,
  }
}

function makeTemplate(
  value?: Partial<SmartProtectionEmailRule>,
  index = 0
): SmartProtectionEmailRule {
  templateSequence += 1
  const id = value?.id || `template-${index + 1}-${templateSequence}`
  return {
    id,
    client_id: value?.client_id || `template-client-${id}`,
    name: value?.name || '',
    subject: value?.subject || '',
    body: value?.body || '',
    enabled: value?.enabled !== false,
  }
}

function normalizeSettings(
  value: Partial<SmartProtectionSettings> | null | undefined
): SmartProtectionSettings {
  let rawRules = Array.isArray(value?.blocked_rules) ? value.blocked_rules : []
  if (rawRules.length === 0) {
    rawRules = [
      ...(Array.isArray(value?.blocked_safeties)
        ? value.blocked_safeties.map((safety) =>
            makeRule({ safety, record: true, block: true })
          )
        : []),
      ...(Array.isArray(value?.blocked_categories)
        ? value.blocked_categories.map((category) =>
            makeRule({ categories: [category], record: true, block: true })
          )
        : []),
    ]
  }
  const templates = Array.isArray(value?.email_rules)
    ? value.email_rules
    : DEFAULT_SETTINGS.email_rules
  return {
    ...DEFAULT_SETTINGS,
    ...value,
    blocked_rules: rawRules.map(makeRule),
    email_rules: templates.map(makeTemplate),
    channel_ids: Array.isArray(value?.channel_ids) ? value.channel_ids : [],
  }
}

function parseCategories(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : []
  } catch {
    return value ? [value] : []
  }
}

function statusKey(status: number): string {
  if (status === 1) return 'Enabled'
  if (status === 3) return 'Deleted'
  return 'Disabled'
}

export function SmartProtectionSection() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [apiKey, setApiKey] = useState('')
  const [activeTab, setActiveTab] = useState('events')
  const [channelSearch, setChannelSearch] = useState('')
  const [eventSearch, setEventSearch] = useState('')
  const [eventKeyword, setEventKeyword] = useState('')
  const [eventPage, setEventPage] = useState(1)
  const [eventPageSize, setEventPageSize] = useState(10)
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null)
  const [clearOpen, setClearOpen] = useState(false)
  const settingsQuery = useQuery({
    queryKey: ['smart-protection-settings'],
    queryFn: getSmartProtectionSettings,
  })
  const channelsQuery = useQuery({
    queryKey: ['smart-protection-channels'],
    queryFn: getSmartProtectionChannels,
    enabled: activeTab === 'configuration',
  })
  const eventsQuery = useQuery({
    queryKey: [
      'smart-protection-events',
      eventPage,
      eventPageSize,
      eventKeyword,
    ],
    queryFn: () =>
      getSmartProtectionEvents(eventPage, eventPageSize, eventKeyword),
    enabled: activeTab === 'events',
  })
  const detailQuery = useQuery({
    queryKey: ['smart-protection-event', selectedEventId],
    queryFn: () => getSmartProtectionEvent(selectedEventId as number),
    enabled: selectedEventId !== null,
  })

  useEffect(() => {
    if (settingsQuery.data) setSettings(normalizeSettings(settingsQuery.data))
  }, [settingsQuery.data])
  const saveMutation = useMutation({
    mutationFn: updateSmartProtectionSettings,
    onSuccess: (data) => {
      setSettings(normalizeSettings(data))
      setApiKey('')
      queryClient.invalidateQueries({ queryKey: ['smart-protection-settings'] })
      toast.success(t('Smart protection settings saved'))
    },
    onError: () => toast.error(t('Failed to save smart protection settings')),
  })
  const clearMutation = useMutation({
    mutationFn: clearSmartProtectionEvents,
    onSuccess: (data) => {
      setClearOpen(false)
      setEventPage(1)
      queryClient.invalidateQueries({ queryKey: ['smart-protection-events'] })
      toast.success(
        t('Cleared {{count}} protection events', { count: data.deleted })
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
    return (channelsQuery.data || []).filter(
      (channel) =>
        !query || `${channel.id} ${channel.name}`.toLowerCase().includes(query)
    )
  }, [channelSearch, channelsQuery.data])
  const update = <K extends keyof SmartProtectionSettings>(
    key: K,
    value: SmartProtectionSettings[K]
  ) => setSettings((current) => ({ ...current, [key]: value }))
  const updateRule = (index: number, value: Partial<SmartProtectionRule>) =>
    update(
      'blocked_rules',
      settings.blocked_rules.map((rule, item) =>
        item === index ? { ...rule, ...value } : rule
      )
    )
  const updateTemplate = (
    index: number,
    value: Partial<SmartProtectionEmailRule>
  ) =>
    update(
      'email_rules',
      settings.email_rules.map((template, item) =>
        item === index ? { ...template, ...value } : template
      )
    )
  const toggleCategory = (index: number, category: string) => {
    const rule = settings.blocked_rules[index]
    const categories = rule.categories.includes(category)
      ? rule.categories.filter((item) => item !== category)
      : [...rule.categories, category]
    updateRule(index, { categories })
  }
  const submit = () => {
    // Never send an omitted or masked API key back on a later save. Only a
    // newly entered key belongs in the update payload.
    const settingsWithoutApiKey = { ...settings } as SmartProtectionSettings & {
      api_key?: string
    }
    delete settingsWithoutApiKey.api_key
    saveMutation.mutate({
      ...settingsWithoutApiKey,
      blocked_rules: settings.blocked_rules.map(({ client_id, ...rule }) => ({
        ...rule,
        actions_configured: true,
      })),
      email_rules: settings.email_rules.map(({ client_id, ...template }) => ({
        ...template,
        enabled: template.enabled !== false,
      })),
      ...(apiKey.trim() ? { api_key: apiKey.trim() } : {}),
    })
  }
  const totalPages = Math.max(
    1,
    Math.ceil((eventsQuery.data?.total || 0) / eventPageSize)
  )

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>{t('Smart Protection')}</SectionPageLayout.Title>
      {activeTab === 'events' && (
        <SectionPageLayout.Actions>
          <Button
            variant='outline'
            size='sm'
            onClick={() => eventsQuery.refetch()}
            disabled={eventsQuery.isFetching}
          >
            <RefreshCw
              className={
                eventsQuery.isFetching ? 'size-4 animate-spin' : 'size-4'
              }
              aria-hidden='true'
            />
            {t('Refresh')}
          </Button>
        </SectionPageLayout.Actions>
      )}
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
            <TabsTrigger value='email-templates'>
              {t('Warning email templates')}
            </TabsTrigger>
            <TabsTrigger value='rules'>
              {t('Protection matching rules')}
            </TabsTrigger>
          </TabsList>
          <TabsContent value='configuration'>
            <ConfigurationTab
              t={t}
              settings={settings}
              apiKey={apiKey}
              setApiKey={setApiKey}
              update={update}
              channelSearch={channelSearch}
              setChannelSearch={setChannelSearch}
              channelsLoading={channelsQuery.isLoading}
              filteredChannels={filteredChannels}
              selectedChannels={selectedChannels}
              submit={submit}
              saving={saveMutation.isPending}
            />
          </TabsContent>
          <TabsContent value='email-templates'>
            <EmailTemplatesTab
              t={t}
              settings={settings}
              update={update}
              updateTemplate={updateTemplate}
              submit={submit}
              saving={saveMutation.isPending}
            />
          </TabsContent>
          <TabsContent value='rules'>
            <RulesTab
              t={t}
              settings={settings}
              update={update}
              updateRule={updateRule}
              toggleCategory={toggleCategory}
              submit={submit}
              saving={saveMutation.isPending}
            />
          </TabsContent>
          <TabsContent value='events'>
            <EventsTab
              t={t}
              data={eventsQuery.data}
              loading={eventsQuery.isLoading}
              eventSearch={eventSearch}
              setEventSearch={setEventSearch}
              search={() => {
                setEventPage(1)
                setEventKeyword(eventSearch.trim())
              }}
              eventPage={eventPage}
              setEventPage={setEventPage}
              eventPageSize={eventPageSize}
              setEventPageSize={(pageSize) => {
                setEventPage(1)
                setEventPageSize(pageSize)
              }}
              totalPages={totalPages}
              openDetails={setSelectedEventId}
              openClear={() => setClearOpen(true)}
            />
          </TabsContent>
        </Tabs>
        <Dialog
          open={selectedEventId !== null}
          triggerId={null}
          onOpenChange={(open) => {
            if (!open) setSelectedEventId(null)
          }}
          title={t('Protection event details')}
          description={t('Recorded classification and action details.')}
          contentClassName='max-w-3xl'
        >
          {detailQuery.isLoading && <Skeleton className='h-40' />}
          {detailQuery.isError && (
            <div className='flex flex-col items-center gap-3 py-8'>
              <p className='text-destructive text-sm'>{t('Failed to load')}</p>
              <Button
                type='button'
                variant='outline'
                onClick={() => detailQuery.refetch()}
              >
                {t('Retry')}
              </Button>
            </div>
          )}
          {detailQuery.data && (
            <div className='flex flex-col gap-3 text-sm'>
              <div>
                {t('Request ID')}: {detailQuery.data.request_id}
              </div>
              <div>
                {t('Action')}: {detailQuery.data.action}
              </div>
              <Field>
                <FieldLabel>{t('Risk content')}</FieldLabel>
                <Textarea
                  data-testid='risk-content-scroll-area'
                  readOnly
                  value={detailQuery.data.content}
                  className='h-[min(45vh,420px)] max-h-[420px]'
                />
              </Field>
            </div>
          )}
        </Dialog>
        <AlertDialog
          open={clearOpen}
          triggerId={null}
          onOpenChange={setClearOpen}
        >
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
              <AlertDialogCancel disabled={clearMutation.isPending}>
                {t('Cancel')}
              </AlertDialogCancel>
              <AlertDialogAction
                variant='destructive'
                disabled={clearMutation.isPending}
                onClick={() => clearMutation.mutate()}
              >
                {t('Clear protection events')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}

type CommonTabProps = {
  t: (key: string, options?: Record<string, unknown>) => string
  settings: SmartProtectionSettings
  update: <K extends keyof SmartProtectionSettings>(
    key: K,
    value: SmartProtectionSettings[K]
  ) => void
  submit: () => void
  saving: boolean
}

function ConfigurationTab(
  props: CommonTabProps & {
    apiKey: string
    setApiKey: (value: string) => void
    channelSearch: string
    setChannelSearch: (value: string) => void
    channelsLoading: boolean
    filteredChannels: Array<{ id: number; name: string; status: number }>
    selectedChannels: Set<number>
  }
) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{props.t('Qwen3Guard configuration')}</CardTitle>
        <CardDescription>
          {props.t(
            'Configure the guard service, protected channels, and retention policy.'
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-6'>
        <FieldGroup className='grid gap-4 md:grid-cols-2'>
          <Field orientation='horizontal' className='rounded-lg border p-3'>
            <FieldLabel htmlFor='smart-protection-enabled'>
              {props.t('Enable smart protection')}
            </FieldLabel>
            <Switch
              id='smart-protection-enabled'
              checked={props.settings.enabled}
              onCheckedChange={(value) => props.update('enabled', value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor='smart-protection-url'>
              {props.t('Security model URL')}
            </FieldLabel>
            <Input
              id='smart-protection-url'
              value={props.settings.base_url}
              placeholder={props.t('Example: https://security.example.com/v1')}
              onChange={(event) => props.update('base_url', event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor='smart-protection-model'>
              {props.t('Security model')}
            </FieldLabel>
            <Input
              id='smart-protection-model'
              value={props.settings.model}
              placeholder={props.t('Example: security-model-name')}
              onChange={(event) => props.update('model', event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor='smart-protection-key'>
              {props.t('Security model API key')}
            </FieldLabel>
            {props.settings.api_key_configured && (
              <FieldDescription>
                {props.t('Leave empty to keep existing key')}
              </FieldDescription>
            )}
            <Input
              id='smart-protection-key'
              type='password'
              value={props.apiKey}
              placeholder={
                props.settings.api_key_hint ||
                props.t('Example: sk-your-security-key')
              }
              onChange={(event) => props.setApiKey(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor='smart-protection-timeout'>
              {props.t('Review timeout (seconds)')}
            </FieldLabel>
            <Input
              id='smart-protection-timeout'
              type='number'
              min={1}
              max={60}
              value={props.settings.timeout_seconds}
              onChange={(event) =>
                props.update('timeout_seconds', Number(event.target.value))
              }
            />
          </Field>
          <Field>
            <FieldLabel htmlFor='smart-protection-context'>
              {props.t('Maximum context characters per check')}
            </FieldLabel>
            <Input
              id='smart-protection-context'
              type='number'
              min={1000}
              max={24000}
              value={props.settings.max_context_chars}
              onChange={(event) =>
                props.update('max_context_chars', Number(event.target.value))
              }
            />
          </Field>
          <Field>
            <FieldLabel htmlFor='smart-protection-concurrency'>
              {props.t('Maximum concurrent checks')}
            </FieldLabel>
            <Input
              id='smart-protection-concurrency'
              type='number'
              min={1}
              max={32}
              value={props.settings.max_concurrent}
              onChange={(event) =>
                props.update('max_concurrent', Number(event.target.value))
              }
            />
          </Field>
          <Field>
            <FieldLabel htmlFor='smart-protection-retention'>
              {props.t('Risk record retention (days)')}
            </FieldLabel>
            <Input
              id='smart-protection-retention'
              type='number'
              min={0}
              max={3650}
              value={props.settings.retention_days}
              onChange={(event) =>
                props.update('retention_days', Number(event.target.value))
              }
            />
          </Field>
        </FieldGroup>
        <FieldGroup className='grid gap-4 md:grid-cols-2'>
          <Field orientation='horizontal' className='rounded-lg border p-3'>
            <FieldLabel htmlFor='smart-protection-save'>
              {props.t('Save risk content')}
            </FieldLabel>
            <Switch
              id='smart-protection-save'
              checked={props.settings.save_content}
              onCheckedChange={(value) => props.update('save_content', value)}
            />
          </Field>
          <Field orientation='horizontal' className='rounded-lg border p-3'>
            <FieldLabel htmlFor='smart-protection-email'>
              {props.t('Send warning emails')}
            </FieldLabel>
            <Switch
              id='smart-protection-email'
              checked={props.settings.warning_email}
              onCheckedChange={(value) => props.update('warning_email', value)}
            />
          </Field>
        </FieldGroup>
        <Field>
          <FieldLabel>{props.t('Protected channels')}</FieldLabel>
          <FieldDescription>
            {props.t(
              'Only selected channels are reviewed. Leave all unchecked to keep smart protection inactive.'
            )}
          </FieldDescription>
          <div className='rounded-lg border'>
            <div className='flex gap-2 border-b p-2'>
              <InputGroup className='flex-1'>
                <InputGroupInput
                  value={props.channelSearch}
                  onChange={(event) =>
                    props.setChannelSearch(event.target.value)
                  }
                  placeholder={props.t('Search channels')}
                />
                <InputGroupAddon>
                  <HugeiconsIcon icon={Search01Icon} />
                </InputGroupAddon>
              </InputGroup>
              <Badge variant='secondary'>
                {props.settings.channel_ids.length} {props.t('selected')}
              </Badge>
            </div>
            <div className='grid max-h-72 gap-2 overflow-y-auto p-3 sm:grid-cols-2 lg:grid-cols-3'>
              {props.channelsLoading &&
                [1, 2, 3].map((item) => (
                  <Skeleton key={item} className='h-12' />
                ))}
              {props.filteredChannels.map((channel) => {
                const checked = props.selectedChannels.has(channel.id)
                const toggleChannel = (nextChecked: boolean) => {
                  const next = new Set(props.selectedChannels)
                  if (nextChecked) next.add(channel.id)
                  else next.delete(channel.id)
                  props.update(
                    'channel_ids',
                    [...next].sort((a, b) => a - b)
                  )
                }
                return (
                  <div
                    key={channel.id}
                    className='flex cursor-pointer items-center gap-2 rounded-lg border p-3'
                  >
                    <Checkbox
                      aria-label={`#${channel.id} ${channel.name}`}
                      checked={checked}
                      onCheckedChange={toggleChannel}
                    />
                    <button
                      type='button'
                      className='min-w-0 flex-1 cursor-pointer truncate text-left text-sm font-medium'
                      onClick={() => toggleChannel(!checked)}
                    >
                      #{channel.id} {channel.name}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        </Field>
        <Button type='button' onClick={props.submit} disabled={props.saving}>
          <HugeiconsIcon icon={SaveIcon} data-icon='inline-start' />
          {props.t('Save smart protection settings')}
        </Button>
      </CardContent>
    </Card>
  )
}

function EmailTemplatesTab(
  props: CommonTabProps & {
    updateTemplate: (
      index: number,
      value: Partial<SmartProtectionEmailRule>
    ) => void
  }
) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{props.t('Warning email templates')}</CardTitle>
        <CardDescription>
          {props.t(
            'Templates contain only email content. Conditions and actions belong to protection matching rules.'
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-4'>
        <div className='overflow-x-auto rounded-lg border'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{props.t('Template name')}</TableHead>
                <TableHead>{props.t('Email subject')}</TableHead>
                <TableHead>{props.t('Enabled')}</TableHead>
                <TableHead>{props.t('Email body (HTML)')}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {props.settings.email_rules.map((template, index) => (
                <TableRow key={template.id}>
                  <TableCell>
                    <Input
                      aria-label={`${props.t('Template name')} ${index + 1}`}
                      value={template.name}
                      onChange={(event) =>
                        props.updateTemplate(index, {
                          name: event.target.value,
                        })
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      aria-label={`${props.t('Email subject')} ${index + 1}`}
                      value={template.subject}
                      onChange={(event) =>
                        props.updateTemplate(index, {
                          subject: event.target.value,
                        })
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={template.enabled !== false}
                      onCheckedChange={(value) =>
                        props.updateTemplate(index, { enabled: value })
                      }
                    />
                  </TableCell>
                  <TableCell className='min-w-96'>
                    <Textarea
                      aria-label={`${props.t('Email body (HTML)')} ${index + 1}`}
                      rows={4}
                      value={template.body}
                      onChange={(event) =>
                        props.updateTemplate(index, {
                          body: event.target.value,
                        })
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      type='button'
                      variant='ghost'
                      size='icon-sm'
                      aria-label={props.t('Remove email template')}
                      disabled={props.settings.email_rules.length <= 1}
                      onClick={() =>
                        props.update(
                          'email_rules',
                          props.settings.email_rules.filter(
                            (_, item) => item !== index
                          )
                        )
                      }
                    >
                      <HugeiconsIcon icon={Cancel01Icon} />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <FieldDescription>
          {props.t(
            'Available placeholders: {{username}}, {{safety}}, {{categories}}, {{request_id}}, {{model}}, {{time}}, {{action}}'
          )}
        </FieldDescription>
        <div className='flex gap-2'>
          <Button
            type='button'
            variant='outline'
            onClick={() =>
              props.update('email_rules', [
                ...props.settings.email_rules,
                makeTemplate(
                  { body: DEFAULT_BODY },
                  props.settings.email_rules.length
                ),
              ])
            }
          >
            <HugeiconsIcon icon={Add01Icon} data-icon='inline-start' />
            {props.t('Add email template')}
          </Button>
          <Button type='button' onClick={props.submit} disabled={props.saving}>
            <HugeiconsIcon icon={SaveIcon} data-icon='inline-start' />
            {props.t('Save smart protection settings')}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function RulesTab(
  props: CommonTabProps & {
    updateRule: (index: number, value: Partial<SmartProtectionRule>) => void
    toggleCategory: (index: number, category: string) => void
  }
) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{props.t('Protection matching rules')}</CardTitle>
        <CardDescription>
          {props.t(
            'Safety is the rule gate. Any or all matching only applies to the selected Categories; separate rules are evaluated independently.'
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-4'>
        <div className='overflow-x-auto rounded-lg border'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{props.t('Rule name')}</TableHead>
                <TableHead>{props.t('Conditions')}</TableHead>
                <TableHead>{props.t('Actions')}</TableHead>
                <TableHead>{props.t('Warning template')}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {props.settings.blocked_rules.map((rule, index) => (
                <TableRow key={rule.id}>
                  <TableCell className='min-w-44 align-top'>
                    <Input
                      aria-label={`${props.t('Rule name')} ${index + 1}`}
                      value={rule.name}
                      onChange={(event) =>
                        props.updateRule(index, { name: event.target.value })
                      }
                    />
                  </TableCell>
                  <TableCell className='min-w-96 align-top'>
                    <div className='flex flex-col gap-2'>
                      <div className='flex gap-1'>
                        <Button
                          type='button'
                          size='sm'
                          variant={
                            rule.match_mode === 'any' ? 'secondary' : 'outline'
                          }
                          onClick={() =>
                            props.updateRule(index, { match_mode: 'any' })
                          }
                        >
                          {props.t('Any selected condition')}
                        </Button>
                        <Button
                          type='button'
                          size='sm'
                          variant={
                            rule.match_mode === 'all' ? 'secondary' : 'outline'
                          }
                          onClick={() =>
                            props.updateRule(index, { match_mode: 'all' })
                          }
                        >
                          {props.t('All selected conditions')}
                        </Button>
                      </div>
                      <div className='flex flex-wrap gap-1'>
                        {['', ...SAFETIES].map((safety) => (
                          <Button
                            key={safety || 'any'}
                            type='button'
                            size='sm'
                            variant={
                              rule.safety === safety ? 'secondary' : 'outline'
                            }
                            onClick={() => props.updateRule(index, { safety })}
                          >
                            {safety
                              ? props.t(SAFETY_KEYS[safety])
                              : props.t('Any Safety')}
                          </Button>
                        ))}
                      </div>
                      <div className='flex flex-wrap gap-1'>
                        {CATEGORIES.map((category) => (
                          <Button
                            key={category}
                            type='button'
                            size='sm'
                            variant={
                              rule.categories.includes(category)
                                ? 'secondary'
                                : 'outline'
                            }
                            onClick={() =>
                              props.toggleCategory(index, category)
                            }
                          >
                            {props.t(CATEGORY_KEYS[category])}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className='min-w-44 align-top'>
                    <FieldGroup className='gap-2'>
                      <Field orientation='horizontal'>
                        <Switch
                          checked={rule.record}
                          onCheckedChange={(value) =>
                            props.updateRule(index, { record: value })
                          }
                        />
                        <FieldLabel>{props.t('Record event')}</FieldLabel>
                      </Field>
                      <Field orientation='horizontal'>
                        <Switch
                          checked={rule.send_email}
                          onCheckedChange={(value) =>
                            props.updateRule(index, {
                              send_email: value,
                              email_template_id: value
                                ? rule.email_template_id ||
                                  props.settings.email_rules[0]?.id ||
                                  ''
                                : rule.email_template_id,
                            })
                          }
                        />
                        <FieldLabel>{props.t('Send email')}</FieldLabel>
                      </Field>
                      <Field orientation='horizontal'>
                        <Switch
                          checked={rule.block}
                          onCheckedChange={(value) =>
                            props.updateRule(index, { block: value })
                          }
                        />
                        <FieldLabel>{props.t('Block request')}</FieldLabel>
                      </Field>
                    </FieldGroup>
                  </TableCell>
                  <TableCell className='min-w-48 align-top'>
                    <Select
                      items={props.settings.email_rules.map((template) => ({
                        value: template.id || '',
                        label: template.name || props.t('Unnamed template'),
                      }))}
                      disabled={!rule.send_email}
                      value={rule.email_template_id || ''}
                      onValueChange={(value) =>
                        props.updateRule(index, {
                          email_template_id:
                            typeof value === 'string' ? value : '',
                        })
                      }
                    >
                      <SelectTrigger className='w-full'>
                        <SelectValue>
                          {props.settings.email_rules.find(
                            (template) => template.id === rule.email_template_id
                          )?.name || props.t('Unnamed template')}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {props.settings.email_rules.map((template) => (
                            <SelectItem
                              key={template.id}
                              value={template.id || ''}
                            >
                              {template.name || props.t('Unnamed template')}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className='align-top'>
                    <Button
                      type='button'
                      variant='ghost'
                      size='icon-sm'
                      aria-label={props.t('Remove rule')}
                      onClick={() =>
                        props.update(
                          'blocked_rules',
                          props.settings.blocked_rules.filter(
                            (_, item) => item !== index
                          )
                        )
                      }
                    >
                      <HugeiconsIcon icon={Delete02Icon} />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className='flex gap-2'>
          <Button
            type='button'
            variant='outline'
            onClick={() =>
              props.update('blocked_rules', [
                ...props.settings.blocked_rules,
                makeRule({ record: true }, props.settings.blocked_rules.length),
              ])
            }
          >
            <HugeiconsIcon icon={Add01Icon} data-icon='inline-start' />
            {props.t('Add rule')}
          </Button>
          <Button type='button' onClick={props.submit} disabled={props.saving}>
            <HugeiconsIcon icon={SaveIcon} data-icon='inline-start' />
            {props.t('Save smart protection settings')}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

type EventsData = Awaited<ReturnType<typeof getSmartProtectionEvents>>
function EventsTab(props: {
  t: CommonTabProps['t']
  data?: EventsData
  loading: boolean
  eventSearch: string
  setEventSearch: (value: string) => void
  search: () => void
  eventPage: number
  setEventPage: (value: number | ((page: number) => number)) => void
  eventPageSize: number
  setEventPageSize: (value: number) => void
  totalPages: number
  openDetails: (id: number) => void
  openClear: () => void
}) {
  const pageNumbers = getPageNumbers(props.eventPage, props.totalPages)
  const events = props.data?.items ?? []
  const pageItems = pageNumbers.reduce<
    Array<{ value: number | '...'; key: string }>
  >((items, value) => {
    const pageValue = value === '...' ? value : Number(value)
    const ellipsisCount = items.filter((item) => item.value === '...').length
    items.push({
      value: pageValue,
      key:
        pageValue === '...' ? `ellipsis-${ellipsisCount}` : `page-${pageValue}`,
    })
    return items
  }, [])

  return (
    <Card>
      <CardHeader className='flex flex-row items-start justify-between gap-4'>
        <div>
          <CardTitle>{props.t('Recent protection events')}</CardTitle>
          <CardDescription>
            {props.t(
              'Review recorded protection actions and their email delivery status.'
            )}
          </CardDescription>
        </div>
        <div className='flex gap-2'>
          <Button
            type='button'
            variant='destructive'
            size='sm'
            disabled={!props.data?.total}
            onClick={props.openClear}
          >
            {props.t('Clear protection events')}
          </Button>
        </div>
      </CardHeader>
      <CardContent className='flex flex-col gap-4'>
        <div className='flex gap-2'>
          <InputGroup className='flex-1'>
            <InputGroupInput
              value={props.eventSearch}
              onChange={(event) => props.setEventSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') props.search()
              }}
              placeholder={props.t('Search protection events')}
            />
            <InputGroupAddon>
              <HugeiconsIcon icon={Search01Icon} />
            </InputGroupAddon>
          </InputGroup>
          <Button type='button' variant='outline' onClick={props.search}>
            {props.t('Search')}
          </Button>
        </div>
        {props.loading &&
          [1, 2, 3].map((item) => <Skeleton key={item} className='h-12' />)}
        {!props.loading && events.length === 0 && (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>{props.t('No protection events yet')}</EmptyTitle>
            </EmptyHeader>
          </Empty>
        )}
        {events.length > 0 && (
          <div className='overflow-x-auto rounded-lg border'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{props.t('User')}</TableHead>
                  <TableHead>{props.t('Account status')}</TableHead>
                  <TableHead>{props.t('Channel')}</TableHead>
                  <TableHead>{props.t('Model')}</TableHead>
                  <TableHead>{props.t('Safety')}</TableHead>
                  <TableHead>{props.t('Categories')}</TableHead>
                  <TableHead>{props.t('Action')}</TableHead>
                  <TableHead>{props.t('Email')}</TableHead>
                  <TableHead>{props.t('Time')}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell>
                      {event.username || event.email || props.t('Unknown user')}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          event.user_status === 1 ? 'secondary' : 'outline'
                        }
                      >
                        {props.t(statusKey(event.user_status))}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {event.channel_name || `#${event.channel_id}`}
                    </TableCell>
                    <TableCell>{event.model_name}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          event.safety === 'Unsafe' ? 'destructive' : 'outline'
                        }
                      >
                        {props.t(SAFETY_KEYS[event.safety] || event.safety)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className='flex flex-wrap gap-1'>
                        {parseCategories(event.categories).map((category) => (
                          <Badge key={category} variant='secondary'>
                            {props.t(CATEGORY_KEYS[category] || category)}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      {event.action === 'blocked'
                        ? props.t('Blocked')
                        : props.t('Observed')}
                    </TableCell>
                    <TableCell>
                      {event.email_status ? props.t(event.email_status) : '-'}
                    </TableCell>
                    <TableCell className='whitespace-nowrap'>
                      {new Date(event.created_at * 1000).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Button
                        type='button'
                        variant='ghost'
                        size='icon-sm'
                        aria-label={props.t('View details')}
                        onClick={() => props.openDetails(event.id)}
                      >
                        <HugeiconsIcon icon={EyeIcon} />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <div className='flex min-w-0 items-center justify-end overflow-clip'>
          <div className='flex min-w-0 shrink-0 items-center gap-2 sm:gap-3'>
            <div className='flex shrink-0 items-baseline gap-1.5 text-xs font-medium whitespace-nowrap sm:text-sm'>
              <span className='text-muted-foreground/80'>
                {props.t('Total:')}
              </span>
              <span className='tabular-nums'>
                {(props.data?.total || 0).toLocaleString()}
              </span>
            </div>
            <div className='flex shrink-0 items-center gap-1.5'>
              <span className='text-muted-foreground/80 hidden text-sm font-medium whitespace-nowrap lg:block'>
                {props.t('Rows per page')}
              </span>
              <Select
                items={EVENT_PAGE_SIZE_ITEMS}
                value={`${props.eventPageSize}`}
                onValueChange={(value) => props.setEventPageSize(Number(value))}
              >
                <SelectTrigger className='h-8 w-[70px] font-medium tabular-nums'>
                  <SelectValue>{props.eventPageSize}</SelectValue>
                </SelectTrigger>
                <SelectContent side='top' alignItemWithTrigger={false}>
                  <SelectGroup>
                    {EVENT_PAGE_SIZE_OPTIONS.map((pageSize) => (
                      <SelectItem key={pageSize} value={`${pageSize}`}>
                        {pageSize}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <Button
              type='button'
              variant='outline'
              size='icon-sm'
              className='hidden sm:inline-flex'
              aria-label={props.t('Go to first page')}
              disabled={props.eventPage <= 1}
              onClick={() => props.setEventPage(1)}
            >
              <ChevronsLeft aria-hidden='true' />
            </Button>
            <Button
              type='button'
              variant='outline'
              size='icon-sm'
              aria-label={props.t('Go to previous page')}
              disabled={props.eventPage <= 1}
              onClick={() => props.setEventPage((page) => page - 1)}
            >
              <ChevronLeft aria-hidden='true' />
            </Button>
            {pageItems.map((pageItem) =>
              pageItem.value === '...' ? (
                <span
                  key={pageItem.key}
                  className='text-muted-foreground/60 px-0.5 text-sm'
                >
                  ...
                </span>
              ) : (
                <Button
                  key={pageItem.key}
                  type='button'
                  variant={
                    props.eventPage === pageItem.value ? 'default' : 'outline'
                  }
                  className='h-8 min-w-8 px-2 tabular-nums'
                  aria-label={props.t('Go to page {{page}}', {
                    page: pageItem.value,
                  })}
                  onClick={() => props.setEventPage(pageItem.value as number)}
                >
                  {pageItem.value}
                </Button>
              )
            )}
            <Button
              type='button'
              variant='outline'
              size='icon-sm'
              aria-label={props.t('Go to next page')}
              disabled={props.eventPage >= props.totalPages}
              onClick={() => props.setEventPage((page) => page + 1)}
            >
              <ChevronRight aria-hidden='true' />
            </Button>
            <Button
              type='button'
              variant='outline'
              size='icon-sm'
              className='hidden sm:inline-flex'
              aria-label={props.t('Go to last page')}
              disabled={props.eventPage >= props.totalPages}
              onClick={() => props.setEventPage(props.totalPages)}
            >
              <ChevronsRight aria-hidden='true' />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
