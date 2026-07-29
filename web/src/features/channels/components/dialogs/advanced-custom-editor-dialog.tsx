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
  Add01Icon,
  ArrowDown01Icon,
  ArrowDownToLineIcon,
  ArrowRight01Icon,
  ArrowUp01Icon,
  CheckmarkCircle02Icon,
  CodeIcon,
  Delete02Icon,
  InformationCircleIcon,
  MagicWand01Icon,
  Route01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { type ComponentProps, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
import { JsonCodeEditor } from '@/components/json-code-editor'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

import {
  ADVANCED_CUSTOM_AUTH_MODE_OPTIONS,
  ADVANCED_CUSTOM_CONVERTER_OPTIONS,
  ADVANCED_CUSTOM_INCOMING_PATH_OPTIONS,
  ADVANCED_CUSTOM_MODEL_LIST_LABEL,
  ADVANCED_CUSTOM_MODEL_LIST_PATH,
  ADVANCED_CUSTOM_TEMPLATE_OPTIONS,
  type AdvancedCustomAuthMode,
  buildAdvancedCustomAuth,
  createAdvancedCustomConfig,
  createAdvancedCustomRoute,
  getAdvancedCustomAuthMode,
  getAdvancedCustomConverterDefaults,
  getAdvancedCustomConverterOptions,
  getAdvancedCustomIncomingPathLabel,
  getAdvancedCustomModelRuleKind,
  getAdvancedCustomRegexModelPattern,
  getAdvancedCustomTemplateConfig,
  getAdvancedCustomUpstreamPathPlaceholder,
  getDefaultAdvancedCustomIncomingPath,
  isAdvancedCustomIncomingPathAllowed,
  normalizeAdvancedCustomConfig,
  parseAdvancedCustomRouteModels,
  parseAdvancedCustomConfig,
  stringifyAdvancedCustomConfig,
  validateAdvancedCustomConfig,
} from '../../lib/advanced-custom'
import type {
  AdvancedCustomAuthType,
  AdvancedCustomConfig,
  AdvancedCustomConverter,
  AdvancedCustomRoute,
} from '../../types'
import { AdvancedCustomTaskEditor } from './advanced-custom-task-editor'

type AdvancedCustomEditorDialogProps = {
  open: boolean
  value: string
  onOpenChange: (open: boolean) => void
  onSave: (value: string) => void
}

type AdvancedCustomEditMode = 'visual' | 'json'

const longSelectContentClass = 'w-[360px] max-w-[calc(100vw-2rem)]'
const longSelectItemClass =
  'items-start py-2 [&_[data-slot=select-item-text]]:min-w-0 [&_[data-slot=select-item-text]]:shrink [&_[data-slot=select-item-text]]:whitespace-normal'
const upstreamPathDescriptionKey =
  'Use a path to append it to the channel Base URL, or enter a full URL to override the Base URL for this route.'
const catchAllOrderErrorMessage =
  'Catch-all route must be last for the same incoming path'
const emptyAdvancedRoutes: AdvancedCustomRoute[] = []

type AdvancedCustomRouteRow = {
  route: AdvancedCustomRoute
  routeKey: string
  index: number
}

type AdvancedCustomRouteGroup = {
  incomingPath: string
  routeRows: AdvancedCustomRouteRow[]
}

function getOptionLabel(
  options: ReadonlyArray<{ value: string; label: string }>,
  value: string
) {
  return options.find((option) => option.value === value)?.label || value
}

function getRouteIncomingPath(route: AdvancedCustomRoute): string {
  return (route.incoming_path || '').trim()
}

function isCatchAllRoute(route: AdvancedCustomRoute): boolean {
  return !route.models || route.models.length === 0
}

function buildRouteGroups(
  routeRows: AdvancedCustomRouteRow[]
): AdvancedCustomRouteGroup[] {
  const groups: AdvancedCustomRouteGroup[] = []
  const groupByPath = new Map<string, AdvancedCustomRouteGroup>()

  for (const routeRow of routeRows) {
    const incomingPath = getRouteIncomingPath(routeRow.route)
    let group = groupByPath.get(incomingPath)
    if (!group) {
      group = { incomingPath, routeRows: [] }
      groupByPath.set(incomingPath, group)
      groups.push(group)
    }
    group.routeRows.push(routeRow)
  }

  return groups
}

export function AdvancedCustomEditorDialog({
  open,
  value,
  onOpenChange,
  onSave,
}: AdvancedCustomEditorDialogProps) {
  const { t } = useTranslation()
  const routeKeyCounterRef = useRef(0)
  const [config, setConfig] = useState<AdvancedCustomConfig>(
    () => parseAdvancedCustomConfig(value) || createAdvancedCustomConfig()
  )
  const [routeKeys, setRouteKeys] = useState<string[]>(() => {
    const initialConfig =
      parseAdvancedCustomConfig(value) || createAdvancedCustomConfig()
    const normalized = normalizeAdvancedCustomConfig(initialConfig)
    return (normalized.advanced_routes || []).map(
      (_, routeIndex) => `advanced-custom-route-initial-${routeIndex}`
    )
  })
  const [editMode, setEditMode] = useState<AdvancedCustomEditMode>('visual')
  const [jsonText, setJsonText] = useState(() =>
    stringifyAdvancedCustomConfig(
      parseAdvancedCustomConfig(value) || createAdvancedCustomConfig()
    )
  )
  const [jsonError, setJsonError] = useState('')
  const [templateKey, setTemplateKey] = useState(
    ADVANCED_CUSTOM_TEMPLATE_OPTIONS[0]?.value || ''
  )
  const templateLabel = useMemo(
    () => getOptionLabel(ADVANCED_CUSTOM_TEMPLATE_OPTIONS, templateKey),
    [templateKey]
  )

  const normalizedConfig = useMemo(
    () => normalizeAdvancedCustomConfig(config),
    [config]
  )
  const routes = normalizedConfig.advanced_routes || emptyAdvancedRoutes
  const routeRows = useMemo(
    () =>
      routes.map((route, index) => ({
        route,
        index,
        routeKey:
          routeKeys.at(index) ||
          route.incoming_path ||
          route.upstream_path ||
          route.converter ||
          'advanced-custom-route',
      })),
    [routeKeys, routes]
  )
  const routeGroups = useMemo(() => buildRouteGroups(routeRows), [routeRows])
  const usedIncomingPaths = useMemo(
    () => new Set(routeGroups.map((routeGroup) => routeGroup.incomingPath)),
    [routeGroups]
  )
  const availableIncomingPathOptions = useMemo(
    () =>
      ADVANCED_CUSTOM_INCOMING_PATH_OPTIONS.filter(
        (option) => !usedIncomingPaths.has(option.value)
      ),
    [usedIncomingPaths]
  )
  const validationError = useMemo(
    () => validateAdvancedCustomConfig(normalizedConfig),
    [normalizedConfig]
  )
  const canFixCatchAllOrder =
    validationError?.message === catchAllOrderErrorMessage

  const createRouteKey = () => {
    routeKeyCounterRef.current += 1
    return `advanced-custom-route-${routeKeyCounterRef.current}`
  }

  const createRouteKeys = (count: number) =>
    Array.from({ length: count }, () => createRouteKey())

  const updateRoute = (index: number, patch: Partial<AdvancedCustomRoute>) => {
    setConfig((current) => {
      const next = normalizeAdvancedCustomConfig(current)
      const nextRoutes = [...(next.advanced_routes || [])]
      nextRoutes[index] = { ...nextRoutes[index], ...patch }
      return { ...next, advanced_routes: nextRoutes }
    })
  }

  const replaceRoutes = (
    nextRoutes: AdvancedCustomRoute[],
    nextRouteKeys = routeRows.map((routeRow) => routeRow.routeKey)
  ) => {
    setConfig((current) => {
      const next = normalizeAdvancedCustomConfig(current)
      return { ...next, advanced_routes: nextRoutes }
    })
    setRouteKeys(nextRouteKeys)
  }

  const addRoute = (incomingPath: string | null) => {
    if (!incomingPath || usedIncomingPaths.has(incomingPath)) return
    setConfig((current) => {
      const next = normalizeAdvancedCustomConfig(current)
      return {
        ...next,
        advanced_routes: [
          ...(next.advanced_routes || []),
          {
            ...createAdvancedCustomRoute(),
            incoming_path: incomingPath,
            upstream_path: incomingPath,
          },
        ],
      }
    })
    setRouteKeys((current) => [...current, createRouteKey()])
  }

  const addRouteForIncomingPath = (incomingPath: string) => {
    const resolvedIncomingPath = incomingPath || '/v1/chat/completions'
    setConfig((current) => {
      const next = normalizeAdvancedCustomConfig(current)
      return {
        ...next,
        advanced_routes: [
          ...(next.advanced_routes || []),
          {
            ...createAdvancedCustomRoute(),
            incoming_path: resolvedIncomingPath,
            upstream_path: resolvedIncomingPath,
          },
        ],
      }
    })
    setRouteKeys((current) => [...current, createRouteKey()])
  }

  const removeRoute = (index: number) => {
    setConfig((current) => {
      const next = normalizeAdvancedCustomConfig(current)
      return {
        ...next,
        advanced_routes: (next.advanced_routes || []).filter(
          (_, routeIndex) => routeIndex !== index
        ),
      }
    })
    setRouteKeys((current) =>
      current.filter((_, routeIndex) => routeIndex !== index)
    )
  }

  const updateGroupIncomingPath = (
    group: AdvancedCustomRouteGroup,
    nextIncomingPath: string | null
  ) => {
    const resolvedIncomingPath = nextIncomingPath || '/v1/chat/completions'
    const groupRouteIndexes = new Set(
      group.routeRows.map((routeRow) => routeRow.index)
    )
    const nextRoutes = routes.map((route, routeIndex) => {
      if (!groupRouteIndexes.has(routeIndex)) return route
      if (resolvedIncomingPath === ADVANCED_CUSTOM_MODEL_LIST_PATH) {
        return {
          ...route,
          incoming_path: resolvedIncomingPath,
          upstream_path: ADVANCED_CUSTOM_MODEL_LIST_PATH,
          converter: 'none' as const,
          models: [],
        }
      }
      const converter = route.converter || 'none'
      return {
        ...route,
        incoming_path: resolvedIncomingPath,
        converter: isAdvancedCustomIncomingPathAllowed(
          resolvedIncomingPath,
          converter
        )
          ? converter
          : 'none',
      }
    })
    replaceRoutes(nextRoutes)
  }

  const swapRoutes = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return
    const nextRoutes = [...routes]
    const nextRouteKeys = routeRows.map((routeRow) => routeRow.routeKey)
    const fromRoute = nextRoutes[fromIndex]
    nextRoutes[fromIndex] = nextRoutes[toIndex]
    nextRoutes[toIndex] = fromRoute
    const fromRouteKey = nextRouteKeys[fromIndex]
    nextRouteKeys[fromIndex] = nextRouteKeys[toIndex]
    nextRouteKeys[toIndex] = fromRouteKey
    replaceRoutes(nextRoutes, nextRouteKeys)
  }

  const moveRouteWithinGroup = (index: number, direction: -1 | 1) => {
    const incomingPath = getRouteIncomingPath(routes[index])
    const samePathIndexes = routes
      .map((route, routeIndex) => ({ route, routeIndex }))
      .filter(({ route }) => getRouteIncomingPath(route) === incomingPath)
      .map(({ routeIndex }) => routeIndex)
    const position = samePathIndexes.indexOf(index)
    const nextIndex = samePathIndexes.at(position + direction)
    if (nextIndex === undefined) return
    swapRoutes(index, nextIndex)
  }

  const moveRouteToGroupEnd = (index: number) => {
    const incomingPath = getRouteIncomingPath(routes[index])
    let lastSamePathIndex = -1
    for (let routeIndex = routes.length - 1; routeIndex >= 0; routeIndex -= 1) {
      if (getRouteIncomingPath(routes[routeIndex]) === incomingPath) {
        lastSamePathIndex = routeIndex
        break
      }
    }
    if (lastSamePathIndex < 0 || index === lastSamePathIndex) return

    const nextRoutes = [...routes]
    const nextRouteKeys = routeRows.map((routeRow) => routeRow.routeKey)
    const [route] = nextRoutes.splice(index, 1)
    const [routeKey] = nextRouteKeys.splice(index, 1)
    nextRoutes.splice(lastSamePathIndex, 0, route)
    nextRouteKeys.splice(lastSamePathIndex, 0, routeKey)
    replaceRoutes(nextRoutes, nextRouteKeys)
  }

  const fixCatchAllOrder = () => {
    const routeRowsByPath = new Map<string, AdvancedCustomRouteRow[]>()
    for (const routeRow of routeRows) {
      const incomingPath = getRouteIncomingPath(routeRow.route)
      routeRowsByPath.set(incomingPath, [
        ...(routeRowsByPath.get(incomingPath) || []),
        routeRow,
      ])
    }

    const orderedRowsByPath = new Map<string, AdvancedCustomRouteRow[]>()
    for (const [incomingPath, rows] of routeRowsByPath) {
      orderedRowsByPath.set(incomingPath, [
        ...rows.filter((routeRow) => !isCatchAllRoute(routeRow.route)),
        ...rows.filter((routeRow) => isCatchAllRoute(routeRow.route)),
      ])
    }

    const nextRows = routeRows.map((routeRow) => {
      const incomingPath = getRouteIncomingPath(routeRow.route)
      const orderedRows = orderedRowsByPath.get(incomingPath)
      return orderedRows?.shift() || routeRow
    })
    replaceRoutes(
      nextRows.map((routeRow) => routeRow.route),
      nextRows.map((routeRow) => routeRow.routeKey)
    )
  }

  const parseJsonEditorConfig = (): AdvancedCustomConfig | null => {
    const parsed = parseAdvancedCustomConfig(jsonText)
    if (!parsed) {
      setJsonError(t('Invalid JSON'))
      return null
    }

    const error = validateAdvancedCustomConfig(parsed)
    if (error) {
      setJsonError(t(error.message))
      return null
    }

    setJsonError('')
    return parsed
  }

  const switchToVisualMode = () => {
    const parsed = parseJsonEditorConfig()
    if (!parsed) return
    const normalized = normalizeAdvancedCustomConfig(parsed)
    setConfig(normalized)
    setRouteKeys(createRouteKeys(normalized.advanced_routes?.length || 0))
    setEditMode('visual')
  }

  const switchToJsonMode = () => {
    setJsonText(stringifyAdvancedCustomConfig(normalizedConfig))
    setJsonError('')
    setEditMode('json')
  }

  const handleJsonChange = (nextValue: string) => {
    setJsonText(nextValue)
    if (jsonError) setJsonError('')
  }

  const applyTemplate = (mode: 'fill' | 'append') => {
    const templateConfig = getAdvancedCustomTemplateConfig(templateKey)
    let nextConfig = templateConfig

    if (mode === 'append') {
      const baseConfig =
        editMode === 'json' ? parseJsonEditorConfig() : normalizedConfig
      if (!baseConfig) return
      const base = normalizeAdvancedCustomConfig(baseConfig)
      const template = normalizeAdvancedCustomConfig(templateConfig)
      nextConfig = {
        advanced_routes: [
          ...(base.advanced_routes || []),
          ...(template.advanced_routes || []),
        ],
      }
    }

    const normalized = normalizeAdvancedCustomConfig(nextConfig)
    setConfig(normalized)
    setRouteKeys(createRouteKeys(normalized.advanced_routes?.length || 0))
    setJsonText(stringifyAdvancedCustomConfig(normalized))
    setJsonError('')
  }

  const saveConfig = () => {
    if (editMode === 'json') {
      const parsed = parseJsonEditorConfig()
      if (!parsed) {
        toast.error(t('Please fix JSON errors before saving'))
        return
      }
      onSave(stringifyAdvancedCustomConfig(parsed))
      onOpenChange(false)
      return
    }

    if (validationError) {
      toast.error(t(validationError.message))
      return
    }
    onSave(stringifyAdvancedCustomConfig(normalizedConfig))
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('Configure advanced custom routing')}
      description={t(
        'Choose a starter template, then describe which client requests should be sent to each upstream API.'
      )}
      contentClassName='flex max-h-[94vh] flex-col gap-0 p-0 sm:max-w-6xl'
      headerClassName='border-b px-6 py-4'
      footerClassName='border-t px-6 py-4'
      contentHeight='76vh'
      footer={
        <>
          <Button
            type='button'
            variant='outline'
            onClick={() => onOpenChange(false)}
          >
            {t('Cancel')}
          </Button>
          <Button type='button' onClick={saveConfig}>
            <HugeiconsIcon
              icon={CheckmarkCircle02Icon}
              data-icon='inline-start'
            />
            {t('Save changes')}
          </Button>
        </>
      }
    >
      <Tabs
        value={editMode}
        onValueChange={(nextMode) => {
          if (nextMode === 'visual') {
            switchToVisualMode()
            return
          }
          switchToJsonMode()
        }}
        className='gap-0'
      >
        <div className='bg-muted/20 border-b px-5 py-3'>
          <TabsList aria-label={t('Mode')}>
            <TabsTrigger value='visual'>
              <HugeiconsIcon icon={Route01Icon} data-icon='inline-start' />
              {t('Guided setup')}
            </TabsTrigger>
            <TabsTrigger value='json'>
              <HugeiconsIcon icon={CodeIcon} data-icon='inline-start' />
              {t('JSON Text')}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value='visual'>
          <div className='flex flex-col gap-5 p-5'>
            <RouteSetupGuide />

            <Card size='sm'>
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  <HugeiconsIcon icon={MagicWand01Icon} aria-hidden='true' />
                  {t('Start from a provider template')}
                </CardTitle>
                <CardDescription>
                  {t(
                    'Templates fill common routes for you. You can adjust every field before saving.'
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className='grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-end'>
                <Field>
                  <FieldLabel>{t('Template')}</FieldLabel>
                  <Select
                    items={ADVANCED_CUSTOM_TEMPLATE_OPTIONS}
                    value={templateKey}
                    onValueChange={(nextValue) =>
                      setTemplateKey(
                        nextValue ||
                          ADVANCED_CUSTOM_TEMPLATE_OPTIONS[0]?.value ||
                          ''
                      )
                    }
                  >
                    <SelectTrigger className='w-full'>
                      <SelectValue className='min-w-0 truncate'>
                        {t(templateLabel)}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent
                      alignItemWithTrigger={false}
                      className={longSelectContentClass}
                    >
                      <SelectGroup>
                        {ADVANCED_CUSTOM_TEMPLATE_OPTIONS.map((option) => (
                          <SelectItem
                            key={option.value}
                            value={option.value}
                            className={longSelectItemClass}
                          >
                            <span className='min-w-0 leading-snug break-words whitespace-normal'>
                              {t(option.label)}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                <Button
                  type='button'
                  variant='outline'
                  onClick={() => applyTemplate('fill')}
                >
                  {t('Fill Template')}
                </Button>
                <Button
                  type='button'
                  variant='ghost'
                  onClick={() => applyTemplate('append')}
                >
                  {t('Append Template')}
                </Button>
              </CardContent>
            </Card>

            {validationError ? (
              <Alert variant='destructive'>
                <AlertDescription className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
                  <span>
                    {validationError.routeIndex !== undefined
                      ? `${t('Route')} ${validationError.routeIndex + 1}: `
                      : ''}
                    {t(validationError.message)}
                  </span>
                  {canFixCatchAllOrder ? (
                    <Button
                      type='button'
                      variant='outline'
                      size='sm'
                      onClick={fixCatchAllOrder}
                    >
                      {t('Fix order')}
                    </Button>
                  ) : null}
                </AlertDescription>
              </Alert>
            ) : null}

            <div className='flex flex-col gap-3'>
              <div className='flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between'>
                <div>
                  <h3 className='text-base font-semibold'>
                    {t('Public API endpoints')}
                  </h3>
                  <p className='text-muted-foreground mt-1 max-w-2xl text-sm'>
                    {t(
                      'Each endpoint receives one kind of client request. Add provider routes inside it to decide where matching models go.'
                    )}
                  </p>
                </div>
                <Select
                  items={availableIncomingPathOptions}
                  value={null}
                  onValueChange={(incomingPath) => {
                    if (typeof incomingPath === 'string') {
                      addRoute(incomingPath)
                    }
                  }}
                >
                  <SelectTrigger
                    size='sm'
                    disabled={availableIncomingPathOptions.length === 0}
                  >
                    <HugeiconsIcon icon={Add01Icon} data-icon='inline-start' />
                    <SelectValue placeholder={t('Add endpoint')} />
                  </SelectTrigger>
                  <SelectContent
                    align='end'
                    alignItemWithTrigger={false}
                    className={longSelectContentClass}
                  >
                    <SelectGroup>
                      {availableIncomingPathOptions.map((option) => (
                        <SelectItem
                          key={option.value}
                          value={option.value}
                          className={longSelectItemClass}
                        >
                          <div className='flex min-w-0 flex-col gap-1 leading-snug whitespace-normal'>
                            <span>{option.label}</span>
                            <span className='text-muted-foreground font-mono text-xs break-all'>
                              {option.value}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>

              <div className='flex flex-col gap-4'>
                {routeGroups.map((routeGroup) => (
                  <RouteGroupEditor
                    key={
                      routeGroup.incomingPath || 'advanced-custom-empty-path'
                    }
                    group={routeGroup}
                    usedIncomingPaths={usedIncomingPaths}
                    validationError={validationError}
                    onAddRoute={() =>
                      addRouteForIncomingPath(routeGroup.incomingPath)
                    }
                    onIncomingPathChange={(nextIncomingPath) =>
                      updateGroupIncomingPath(routeGroup, nextIncomingPath)
                    }
                    onMoveRoute={(index, direction) =>
                      moveRouteWithinGroup(index, direction)
                    }
                    onMoveRouteToEnd={moveRouteToGroupEnd}
                    onRemoveRoute={removeRoute}
                    onRouteChange={updateRoute}
                  />
                ))}
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value='json'>
          <div className='flex flex-col gap-3 p-5'>
            <Alert>
              <AlertDescription>
                {t(
                  'Use the JSON editor when you need to copy a complete configuration or edit advanced values directly.'
                )}
              </AlertDescription>
            </Alert>
            <JsonCodeEditor
              value={jsonText}
              onChange={handleJsonChange}
              placeholder={stringifyAdvancedCustomConfig(
                getAdvancedCustomTemplateConfig(templateKey)
              )}
              heightClassName='h-[520px] min-h-[420px] max-h-[60vh]'
              aria-invalid={Boolean(jsonError)}
              ariaLabel={t('JSON Text')}
            />
            <p className='text-muted-foreground text-xs'>
              {t('Edit JSON text directly. Format will be validated on save.')}
            </p>
            {jsonError ? (
              <p className='text-destructive text-xs'>{jsonError}</p>
            ) : null}
          </div>
        </TabsContent>
      </Tabs>
    </Dialog>
  )
}

function RouteSetupGuide() {
  const { t } = useTranslation()
  const steps = [
    {
      number: '1',
      title: t('Choose a public endpoint'),
      description: t(
        'Select the API path your users will call, such as chat, image, audio, or video.'
      ),
    },
    {
      number: '2',
      title: t('Decide which models match'),
      description: t(
        'Enter model names for a provider route, or leave the final route empty as the fallback.'
      ),
    },
    {
      number: '3',
      title: t('Connect the upstream API'),
      description: t(
        'Set its URL, protocol conversion, authentication, and optional request or task mapping.'
      ),
    },
  ]

  return (
    <Card size='sm'>
      <CardHeader>
        <CardTitle>{t('How routing works')}</CardTitle>
        <CardDescription>
          {t(
            'A request is matched from left to right. The first matching provider route handles it.'
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className='grid gap-3 lg:grid-cols-3'>
        {steps.map((step) => (
          <div
            key={step.number}
            className='bg-muted/30 flex min-w-0 gap-3 rounded-lg border p-3'
          >
            <Badge className='size-7 shrink-0 justify-center rounded-full p-0'>
              {step.number}
            </Badge>
            <div className='min-w-0'>
              <p className='font-medium'>{step.title}</p>
              <p className='text-muted-foreground mt-1 text-xs leading-relaxed'>
                {step.description}
              </p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function RouteGroupEditor({
  group,
  usedIncomingPaths,
  validationError,
  onAddRoute,
  onIncomingPathChange,
  onMoveRoute,
  onMoveRouteToEnd,
  onRemoveRoute,
  onRouteChange,
}: {
  group: AdvancedCustomRouteGroup
  usedIncomingPaths: ReadonlySet<string>
  validationError: ReturnType<typeof validateAdvancedCustomConfig>
  onAddRoute: () => void
  onIncomingPathChange: (incomingPath: string | null) => void
  onMoveRoute: (index: number, direction: -1 | 1) => void
  onMoveRouteToEnd: (index: number) => void
  onRemoveRoute: (index: number) => void
  onRouteChange: (index: number, patch: Partial<AdvancedCustomRoute>) => void
}) {
  const { t } = useTranslation()
  const incomingPath = group.incomingPath || '/v1/chat/completions'
  const isModelListGroup = incomingPath === ADVANCED_CUSTOM_MODEL_LIST_PATH
  const incomingPathLabel = getAdvancedCustomIncomingPathLabel(incomingPath)
  const catchAllRoute = group.routeRows.find((routeRow) =>
    isCatchAllRoute(routeRow.route)
  )
  const catchAllRoutePosition = catchAllRoute
    ? group.routeRows.findIndex(
        (routeRow) => routeRow.index === catchAllRoute.index
      )
    : -1
  const hasCatchAll = catchAllRoute !== undefined
  const catchAllIsLast =
    !hasCatchAll || catchAllRoutePosition === group.routeRows.length - 1
  const groupHasError =
    validationError?.routeIndex !== undefined &&
    group.routeRows.some(
      (routeRow) => routeRow.index === validationError.routeIndex
    )

  return (
    <Card className={cn(groupHasError && 'ring-destructive/60 ring-1')}>
      <CardHeader className='border-b'>
        <div className='min-w-0'>
          <div className='flex flex-wrap items-center gap-2'>
            <CardTitle>{t('Public endpoint')}</CardTitle>
            <Badge variant='secondary'>
              {group.routeRows.length} {t('Routes')}
            </Badge>
            {isModelListGroup ? (
              <Badge variant='outline'>
                {ADVANCED_CUSTOM_MODEL_LIST_LABEL}
              </Badge>
            ) : (
              <Badge variant={hasCatchAll ? 'outline' : 'secondary'}>
                {hasCatchAll ? t('Fallback route') : t('Model-scoped only')}
              </Badge>
            )}
            {!isModelListGroup && !catchAllIsLast ? (
              <Badge variant='destructive'>{t('Fallback must be last')}</Badge>
            ) : null}
          </div>
          <CardDescription className='mt-1'>
            {t(
              'This is the public API path your users call. Provider routes below decide which upstream receives the request.'
            )}
          </CardDescription>
        </div>

        {!isModelListGroup ? (
          <CardAction>
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={onAddRoute}
            >
              <HugeiconsIcon icon={Add01Icon} data-icon='inline-start' />
              {t('Add provider route')}
            </Button>
          </CardAction>
        ) : null}
      </CardHeader>

      <CardContent className='flex flex-col gap-4'>
        <Field>
          <FieldLabel>{t('Incoming Path')}</FieldLabel>
          <Select
            items={ADVANCED_CUSTOM_INCOMING_PATH_OPTIONS}
            value={incomingPath}
            onValueChange={onIncomingPathChange}
          >
            <SelectTrigger className='w-full max-w-xl'>
              <SelectValue className='min-w-0 truncate'>
                {incomingPathLabel}
              </SelectValue>
            </SelectTrigger>
            <SelectContent
              alignItemWithTrigger={false}
              className={longSelectContentClass}
            >
              <SelectGroup>
                {ADVANCED_CUSTOM_INCOMING_PATH_OPTIONS.map((option) => (
                  <SelectItem
                    key={option.value}
                    value={option.value}
                    disabled={
                      (option.value !== incomingPath &&
                        usedIncomingPaths.has(option.value)) ||
                      (option.value === ADVANCED_CUSTOM_MODEL_LIST_PATH &&
                        group.routeRows.length > 1)
                    }
                    className={longSelectItemClass}
                  >
                    <div className='flex min-w-0 flex-col gap-1 leading-snug whitespace-normal'>
                      <span>{option.label}</span>
                      <span className='text-muted-foreground font-mono text-xs break-all'>
                        {option.value}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <FieldDescription>
            {isModelListGroup
              ? t(
                  'This endpoint discovers upstream OpenAI models and does not use model matching.'
                )
              : t(
                  'Provider routes are checked from top to bottom. Keep the empty fallback route last.'
                )}
          </FieldDescription>
        </Field>

        {groupHasError && validationError ? (
          <p className='text-destructive text-sm'>
            {validationError.routeIndex !== undefined
              ? `${t('Route')} ${validationError.routeIndex + 1}: `
              : ''}
            {t(validationError.message)}
          </p>
        ) : null}

        <div className='flex flex-col gap-3'>
          {group.routeRows.map((routeRow, position) => {
            const canMoveUp = position > 0
            const canMoveDown = position < group.routeRows.length - 1
            const catchAllOutOfOrder =
              isCatchAllRoute(routeRow.route) && canMoveDown
            const routeErrorMessage =
              validationError?.routeIndex === routeRow.index
                ? validationError.message
                : undefined

            return (
              <RouteEditor
                key={routeRow.routeKey}
                route={routeRow.route}
                index={routeRow.index}
                errorMessage={routeErrorMessage}
                canMoveUp={canMoveUp}
                canMoveDown={canMoveDown}
                catchAllOutOfOrder={catchAllOutOfOrder}
                onChange={(patch) => onRouteChange(routeRow.index, patch)}
                onMoveDown={() => onMoveRoute(routeRow.index, 1)}
                onMoveUp={() => onMoveRoute(routeRow.index, -1)}
                onMoveCatchAllToEnd={() => onMoveRouteToEnd(routeRow.index)}
                onRemove={() => onRemoveRoute(routeRow.index)}
              />
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

function RouteEditor({
  route,
  index,
  errorMessage,
  canMoveUp,
  canMoveDown,
  catchAllOutOfOrder,
  onChange,
  onMoveUp,
  onMoveDown,
  onMoveCatchAllToEnd,
  onRemove,
}: {
  route: AdvancedCustomRoute
  index: number
  errorMessage?: string
  canMoveUp: boolean
  canMoveDown: boolean
  catchAllOutOfOrder: boolean
  onChange: (patch: Partial<AdvancedCustomRoute>) => void
  onMoveUp: () => void
  onMoveDown: () => void
  onMoveCatchAllToEnd: () => void
  onRemove: () => void
}) {
  const { t } = useTranslation()
  const converter = route.converter || 'none'
  const authMode = getAdvancedCustomAuthMode(route)
  const incomingPath =
    route.incoming_path || getDefaultAdvancedCustomIncomingPath(converter)
  const isModelListRoute = incomingPath === ADVANCED_CUSTOM_MODEL_LIST_PATH
  const converterOptions = useMemo(
    () => getAdvancedCustomConverterOptions(incomingPath),
    [incomingPath]
  )
  const converterTriggerLabel =
    ADVANCED_CUSTOM_CONVERTER_OPTIONS.find(
      (option) => option.value === converter
    )?.triggerLabel ||
    getOptionLabel(ADVANCED_CUSTOM_CONVERTER_OPTIONS, converter)
  const authLabel = getOptionLabel(ADVANCED_CUSTOM_AUTH_MODE_OPTIONS, authMode)
  const isNativeConverter = converter === 'none'
  const modelsInputValue = route.models?.join(', ') || ''
  const parsedRouteModels = parseAdvancedCustomRouteModels(modelsInputValue)
  const isFallback = !isModelListRoute && parsedRouteModels.length === 0

  const setConverter = (nextConverter: AdvancedCustomConverter) => {
    let nextIncomingPath = incomingPath
    if (!isAdvancedCustomIncomingPathAllowed(nextIncomingPath, nextConverter)) {
      nextIncomingPath = getDefaultAdvancedCustomIncomingPath(nextConverter)
    }
    const defaults = getAdvancedCustomConverterDefaults(
      nextConverter,
      nextIncomingPath
    )
    onChange({
      converter: nextConverter,
      incoming_path: nextIncomingPath,
      upstream_path: defaults.upstream_path,
      auth: defaults.auth,
    })
  }

  const setAuthMode = (mode: AdvancedCustomAuthMode) => {
    onChange({ auth: buildAdvancedCustomAuth(mode, route.auth) })
  }

  const setModelsInput = (value: string) => {
    onChange({
      models: value === '' ? [] : value.split(','),
    })
  }

  const normalizeModelsInput = (value: string) => {
    onChange({ models: parseAdvancedCustomRouteModels(value) })
  }

  const updateAuth = (
    field: Exclude<keyof NonNullable<AdvancedCustomRoute['auth']>, 'type'>,
    value: string
  ) => {
    const currentAuth = route.auth
    if (!currentAuth || currentAuth.type === 'none') return
    onChange({
      auth: {
        type: currentAuth.type as AdvancedCustomAuthType,
        name: currentAuth.name || '',
        value: currentAuth.value || '',
        [field]: value,
      },
    })
  }

  let modelSummary = parsedRouteModels.join(', ')
  if (isModelListRoute) {
    modelSummary = ADVANCED_CUSTOM_MODEL_LIST_LABEL
  } else if (isFallback) {
    modelSummary = t('Any unmatched model')
  }
  const upstreamSummary = route.upstream_path?.trim() || t('Not configured')

  return (
    <Card
      size='sm'
      className={cn(errorMessage && 'ring-destructive/60 ring-1')}
    >
      <CardHeader>
        <div className='flex flex-wrap items-center gap-2'>
          <Badge className='size-7 justify-center rounded-full p-0'>
            {index + 1}
          </Badge>
          <CardTitle>{t('Route')}</CardTitle>
          {isModelListRoute ? (
            <Badge variant='outline'>{ADVANCED_CUSTOM_MODEL_LIST_LABEL}</Badge>
          ) : null}
          {!isModelListRoute && isFallback ? (
            <Badge variant='outline'>{t('Fallback')}</Badge>
          ) : null}
        </div>
        <CardDescription>
          {isFallback
            ? t('Handles models that were not matched by routes above it.')
            : t(
                'Handles requests whose client model matches one of these rules.'
              )}
        </CardDescription>
        <CardAction className='flex items-center gap-1'>
          <TooltipIconButton
            label={t('Move route up')}
            icon={ArrowUp01Icon}
            disabled={!canMoveUp}
            onClick={onMoveUp}
          />
          <TooltipIconButton
            label={t('Move route down')}
            icon={ArrowDown01Icon}
            disabled={!canMoveDown}
            onClick={onMoveDown}
          />
          {catchAllOutOfOrder ? (
            <TooltipIconButton
              label={t('Move fallback to end')}
              icon={ArrowDownToLineIcon}
              onClick={onMoveCatchAllToEnd}
            />
          ) : null}
          <TooltipIconButton
            label={t('Delete')}
            icon={Delete02Icon}
            onClick={onRemove}
          />
        </CardAction>
      </CardHeader>

      <CardContent className='flex flex-col gap-5'>
        <div className='bg-muted/30 grid items-stretch gap-2 rounded-lg border p-3 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-center'>
          <RouteFlowNode label={t('Client model')} value={modelSummary} />
          <HugeiconsIcon
            icon={ArrowRight01Icon}
            className='text-muted-foreground hidden lg:block'
            aria-hidden='true'
          />
          <RouteFlowNode label={t('Upstream path')} value={upstreamSummary} />
          <HugeiconsIcon
            icon={ArrowRight01Icon}
            className='text-muted-foreground hidden lg:block'
            aria-hidden='true'
          />
          <RouteFlowNode
            label={t('Converter')}
            value={t(converterTriggerLabel)}
          />
        </div>

        <FieldGroup className='gap-4'>
          <div className='grid gap-4 lg:grid-cols-2'>
            <Field data-invalid={Boolean(errorMessage)}>
              <FieldLabel>
                {t('Client model')}
                <ModelRuleHelpPopover />
              </FieldLabel>
              {isModelListRoute && parsedRouteModels.length === 0 ? (
                <div className='flex h-9 items-center'>
                  <Badge variant='outline'>
                    {ADVANCED_CUSTOM_MODEL_LIST_LABEL}
                  </Badge>
                </div>
              ) : (
                <>
                  <Input
                    value={modelsInputValue}
                    onChange={(event) => setModelsInput(event.target.value)}
                    onBlur={(event) => normalizeModelsInput(event.target.value)}
                    placeholder={
                      isFallback
                        ? t('Leave empty for fallback')
                        : t('e.g. gpt-4o, gemini-2.5-flash')
                    }
                    aria-invalid={Boolean(errorMessage)}
                  />
                  <FieldDescription>
                    {t(
                      'Separate exact names with commas. The first matching route wins.'
                    )}
                  </FieldDescription>
                  <div className='flex flex-wrap gap-1'>
                    {isFallback ? (
                      <Badge variant='outline'>{t('Fallback')}</Badge>
                    ) : (
                      parsedRouteModels.map((model) => {
                        const ruleKind = getAdvancedCustomModelRuleKind(model)
                        const displayModel =
                          ruleKind === 'regex'
                            ? getAdvancedCustomRegexModelPattern(model) || model
                            : model
                        return (
                          <Badge
                            key={model}
                            variant={
                              ruleKind === 'regex' ? 'outline' : 'secondary'
                            }
                            className='max-w-full gap-1.5 font-mono'
                          >
                            <span className='font-sans text-[10px] font-semibold tracking-normal uppercase'>
                              {t(ruleKind === 'regex' ? 'Regex' : 'Exact')}
                            </span>
                            <span className='truncate'>{displayModel}</span>
                          </Badge>
                        )
                      })
                    )}
                  </div>
                </>
              )}
            </Field>

            <Field>
              <FieldLabel>{t('Upstream path')}</FieldLabel>
              <Input
                value={route.upstream_path || ''}
                onChange={(event) =>
                  onChange({ upstream_path: event.target.value })
                }
                placeholder={getAdvancedCustomUpstreamPathPlaceholder(
                  converter,
                  incomingPath
                )}
              />
              <FieldDescription>
                {t(upstreamPathDescriptionKey)}
              </FieldDescription>
            </Field>
          </div>

          <div className='grid gap-4 lg:grid-cols-2'>
            <Field>
              <FieldLabel>{t('Converter')}</FieldLabel>
              <Select
                value={converter}
                disabled={isModelListRoute && converter === 'none'}
                onValueChange={(value) =>
                  setConverter(value as AdvancedCustomConverter)
                }
              >
                <SelectTrigger className='w-full'>
                  <SelectValue className='min-w-0 truncate'>
                    {t(converterTriggerLabel)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent
                  alignItemWithTrigger={false}
                  className={longSelectContentClass}
                >
                  <SelectGroup>
                    {converterOptions.map((option) => (
                      <SelectItem
                        key={option.value}
                        value={option.value}
                        className={longSelectItemClass}
                      >
                        <span className='min-w-0 leading-snug break-words whitespace-normal'>
                          {t(option.label)}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldDescription>
                {isNativeConverter
                  ? t(
                      'Native forwarding keeps the request shape and enables custom JSON or async task mapping below.'
                    )
                  : t(
                      'The selected converter translates between the client protocol and the upstream protocol.'
                    )}
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel>{t('Auth')}</FieldLabel>
              <Select
                value={authMode}
                onValueChange={(value) =>
                  setAuthMode(value as AdvancedCustomAuthMode)
                }
              >
                <SelectTrigger className='w-full'>
                  <SelectValue className='min-w-0 truncate'>
                    {t(authLabel)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  <SelectGroup>
                    {ADVANCED_CUSTOM_AUTH_MODE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {t(option.label)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldDescription>
                {t(
                  'Use the channel key automatically, or define a custom header or query parameter.'
                )}
              </FieldDescription>
            </Field>
          </div>

          {authMode === 'header' || authMode === 'query' ? (
            <div className='bg-muted/30 grid gap-4 rounded-lg border p-3 lg:grid-cols-2'>
              <Field>
                <FieldLabel>{t('Auth name')}</FieldLabel>
                <Input
                  value={route.auth?.name || ''}
                  onChange={(event) => updateAuth('name', event.target.value)}
                  placeholder={
                    authMode === 'header' ? 'Authorization' : 'api_key'
                  }
                />
              </Field>
              <Field>
                <FieldLabel>{t('Auth value')}</FieldLabel>
                <Input
                  value={route.auth?.value || ''}
                  onChange={(event) => updateAuth('value', event.target.value)}
                  placeholder={
                    authMode === 'header' ? 'Bearer {api_key}' : '{api_key}'
                  }
                />
              </Field>
            </div>
          ) : null}
        </FieldGroup>

        {errorMessage ? (
          <p className='text-destructive text-sm'>{t(errorMessage)}</p>
        ) : null}

        {!isModelListRoute ? (
          <AdvancedCustomTaskEditor route={route} onChange={onChange} />
        ) : null}
      </CardContent>
    </Card>
  )
}

function RouteFlowNode(props: { label: string; value: string }) {
  return (
    <div className='min-w-0'>
      <p className='text-muted-foreground text-xs'>{props.label}</p>
      <p
        className='mt-1 truncate font-mono text-sm font-medium'
        title={props.value}
      >
        {props.value}
      </p>
    </div>
  )
}

function ModelRuleHelpPopover() {
  const { t } = useTranslation()

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type='button'
            variant='ghost'
            size='icon'
            className='text-muted-foreground hover:text-foreground size-6'
            aria-label={t('Client model matching help')}
          />
        }
      >
        <HugeiconsIcon icon={InformationCircleIcon} aria-hidden='true' />
      </PopoverTrigger>
      <PopoverContent
        align='start'
        side='bottom'
        sideOffset={8}
        className='w-[min(22rem,calc(100vw-2rem))] gap-3 p-3'
      >
        <PopoverHeader className='gap-1'>
          <PopoverTitle>{t('Client model matching')}</PopoverTitle>
          <PopoverDescription className='text-xs leading-relaxed'>
            {t(
              'Rules match the original model value from the client request body.'
            )}
          </PopoverDescription>
        </PopoverHeader>
        <div className='text-muted-foreground flex flex-col gap-2 text-xs leading-relaxed'>
          <p>
            {t(
              'Use exact model names such as gpt-4o, or regex rules prefixed with re: such as re:^gemini-.'
            )}
          </p>
          <p>
            {t(
              'Separate multiple rules with English commas. For regex patterns that need commas, switch to JSON Text.'
            )}
          </p>
          <p>
            {t(
              'Leave the final split empty as the fallback for models not matched above.'
            )}
          </p>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function TooltipIconButton({
  label,
  icon,
  disabled,
  onClick,
}: {
  label: string
  icon: ComponentProps<typeof HugeiconsIcon>['icon']
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <TooltipProvider delay={100}>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type='button'
              variant='ghost'
              size='icon'
              disabled={disabled}
              onClick={onClick}
            />
          }
        >
          <HugeiconsIcon
            icon={icon}
            data-icon='inline-start'
            aria-hidden='true'
          />
          <span className='sr-only'>{label}</span>
        </TooltipTrigger>
        <TooltipContent side='top'>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
