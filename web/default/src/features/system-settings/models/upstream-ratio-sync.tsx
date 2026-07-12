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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckSquare, RefreshCcw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'

import {
  fetchUpstreamRatios,
  getUpstreamChannels,
  updateSystemOption,
} from '../api'
import type {
  DifferencesMap,
  RatioType,
  UpstreamChannel,
  UpstreamConfig,
  UpstreamPricingItem,
} from '../types'
import { ChannelSelectorDialog } from './channel-selector-dialog'
import {
  ConflictConfirmDialog,
  type ConflictItem,
} from './conflict-confirm-dialog'
import {
  DEFAULT_ENDPOINT,
  MODELS_DEV_PRESET_ENDPOINT,
  MODELS_DEV_PRESET_ID,
  OFFICIAL_CHANNEL_ENDPOINT,
  OFFICIAL_CHANNEL_ID,
  OPENROUTER_CHANNEL_TYPE,
  OPENROUTER_ENDPOINT,
} from './constants'
import {
  NUMERIC_SYNC_FIELDS,
  RATIO_SYNC_FIELDS,
  applyResolutionRemovalPlan,
  applyResolutionSelection,
  applyResolutionSelections,
  deleteResolutionField,
  type ResolutionRemovalPlan,
  type ResolutionSelection,
  type ResolutionsMap,
} from './upstream-ratio-sync-helpers'
import { UpstreamPricingItemsTable } from './upstream-pricing-items-table'
import { UpstreamRatioSyncTable } from './upstream-ratio-sync-table'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type UpstreamRatioSyncProps = {
  modelRatios: {
    ModelPrice: string
    ModelRatio: string
    CompletionRatio: string
    CacheRatio: string
    CreateCacheRatio: string
    ImageRatio: string
    AudioRatio: string
    AudioCompletionRatio: string
    'billing_setting.billing_mode': string
    'billing_setting.billing_expr': string
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// The two synthesized presets always carry stable negative IDs assigned by
// `controller/ratio_sync.go`; matching by ID alone is sufficient and avoids
// fragile name/base_url comparisons.
function getDefaultEndpointForChannel(channel: UpstreamChannel): string {
  if (channel.id === MODELS_DEV_PRESET_ID) return MODELS_DEV_PRESET_ENDPOINT
  if (channel.id === OFFICIAL_CHANNEL_ID) return OFFICIAL_CHANNEL_ENDPOINT
  if (channel.type === OPENROUTER_CHANNEL_TYPE) return OPENROUTER_ENDPOINT
  return DEFAULT_ENDPOINT
}

function optionKeyBySyncField(ratioType: string): string {
  const explicit: Record<string, string> = {
    billing_mode: 'billing_setting.billing_mode',
    billing_expr: 'billing_setting.billing_expr',
  }
  if (explicit[ratioType]) return explicit[ratioType]
  return ratioType
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('')
}

function parseJsonRecord<T>(raw: string | undefined | null): Record<string, T> {
  try {
    return JSON.parse(raw || '{}') as Record<string, T>
  } catch {
    return {}
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function UpstreamRatioSync({ modelRatios }: UpstreamRatioSyncProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const [channelDialogOpen, setChannelDialogOpen] = useState(false)
  const [conflictDialogOpen, setConflictDialogOpen] = useState(false)
  const [selectedChannelIds, setSelectedChannelIds] = useState<number[]>([])
  const [channelEndpoints, setChannelEndpoints] = useState<
    Record<number, string>
  >({})
  const [upstreamItems, setUpstreamItems] = useState<UpstreamPricingItem[]>([])
  const [differences, setDifferences] = useState<DifferencesMap>({})
  const [viewMode, setViewMode] = useState<'details' | 'differences'>('details')
  const [resolutions, setResolutions] = useState<ResolutionsMap>({})
  const [syncTargets, setSyncTargets] = useState<Record<string, string>>({})
  const [targetDialogOpen, setTargetDialogOpen] = useState(false)
  const [conflictItems, setConflictItems] = useState<ConflictItem[]>([])
  const [confirmLoading, setConfirmLoading] = useState(false)

  const { data: channelsData } = useQuery({
    queryKey: ['upstream-channels'],
    queryFn: getUpstreamChannels,
    enabled: channelDialogOpen,
  })

  // Memoize the channels list so the effect below only re-runs when the query
  // data actually changes, instead of on every render (the `|| []` fallback
  // would otherwise produce a new array reference each render).
  const channels = useMemo(() => channelsData?.data ?? [], [channelsData?.data])

  useEffect(() => {
    if (channels.length === 0) return
    setChannelEndpoints((prev) => {
      let mutated = false
      const next = { ...prev }
      for (const channel of channels) {
        if (!next[channel.id]) {
          next[channel.id] = getDefaultEndpointForChannel(channel)
          mutated = true
        }
      }
      return mutated ? next : prev
    })
  }, [channels])

  const fetchMutation = useMutation({
    mutationFn: fetchUpstreamRatios,
    onSuccess: (data) => {
      if (!data.success) {
        toast.error(data.message || t('Failed to fetch upstream prices'))
        return
      }

      const { differences: diffs = {}, items = [], test_results } = data.data

      const errorResults = test_results.filter((r) => r.status === 'error')
      if (errorResults.length > 0) {
        const errorMsg = errorResults
          .map((r) => `${r.name}: ${r.error}`)
          .join(', ')
        toast.warning(t('Some channels failed: {{errorMsg}}', { errorMsg }))
      }

      setUpstreamItems(items)
      setDifferences(diffs)
      setResolutions({})
      setSyncTargets({})
      setViewMode(items.length > 0 ? 'details' : 'differences')

      if (items.length === 0 && Object.keys(diffs).length === 0) {
        toast.success(t('No price differences found'))
      } else {
        toast.success(t('Upstream prices fetched successfully'))
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || t('Failed to fetch upstream prices'))
    },
  })

  const { mutate: syncMutate, isPending: isSyncPending } = useMutation({
    mutationFn: async (updates: Array<{ key: string; value: string }>) => {
      for (const update of updates) {
        const result = await updateSystemOption(update)
        if (!result.success) {
          throw new Error(result.message || t('Failed to sync prices'))
        }
      }
    },
    onSuccess: () => {
      toast.success(t('Prices synced successfully'))
      queryClient.invalidateQueries({ queryKey: ['system-options'] })

      setResolutions({})
      setSyncTargets({})
    },
    onError: (error: Error) => {
      toast.error(error.message || t('Failed to sync prices'))
    },
  })

  const handleOpenChannelDialog = () => {
    setChannelDialogOpen(true)
  }

  const handleConfirmChannelSelection = (selectedIds: number[]) => {
    const selectedChannels = channels.filter((ch) =>
      selectedIds.includes(ch.id)
    )

    if (selectedChannels.length === 0) {
      toast.warning(t('Please select at least one channel'))
      return
    }

    const upstreams: UpstreamConfig[] = selectedChannels.map((ch) => ({
      id: ch.id,
      name: ch.name,
      base_url: ch.base_url,
      endpoint: channelEndpoints[ch.id] || DEFAULT_ENDPOINT,
    }))

    fetchMutation.mutate({ upstreams, timeout: 10 })
  }

  const handleSelectItem = useCallback((item: UpstreamPricingItem) => {
    setResolutions((prev) => ({
      ...prev,
      [item.key]: { ...item.sync_values },
    }))
    setSyncTargets((prev) => ({
      ...prev,
      [item.key]: prev[item.key] || item.model_id || item.model_name,
    }))
  }, [])

  const handleUnselectItem = useCallback((itemKey: string) => {
    setResolutions((prev) => {
      const next = { ...prev }
      delete next[itemKey]
      return next
    })
    setSyncTargets((prev) => {
      const next = { ...prev }
      delete next[itemKey]
      return next
    })
  }, [])

  const handleBulkSelect = useCallback((items: UpstreamPricingItem[]) => {
    setResolutions((prev) => {
      const next = { ...prev }
      items.forEach((item) => {
        next[item.key] = { ...item.sync_values }
      })
      return next
    })
    setSyncTargets((prev) => {
      const next = { ...prev }
      items.forEach((item) => {
        next[item.key] = next[item.key] || item.model_id || item.model_name
      })
      return next
    })
  }, [])

  const handleSelectValue = useCallback(
    (
      model: string,
      ratioType: RatioType,
      value: number | string,
      sourceName: string
    ) => {
      setResolutions((prev) =>
        applyResolutionSelection(prev, differences, {
          model,
          ratioType,
          value,
          sourceName,
        })
      )
    },
    [differences]
  )

  const handleSelectValues = useCallback(
    (selections: ResolutionSelection[]) => {
      if (selections.length === 0) return
      setResolutions((prev) =>
        applyResolutionSelections(prev, differences, selections)
      )
    },
    [differences]
  )

  const handleBulkUnselect = useCallback((items: UpstreamPricingItem[]) => {
    setResolutions((prev) => {
      const next = { ...prev }
      items.forEach((item) => {
        delete next[item.key]
      })
      return next
    })
    setSyncTargets((prev) => {
      const next = { ...prev }
      items.forEach((item) => {
        delete next[item.key]
      })
      return next
    })
  }, [])

  const handleUnselectValue = useCallback(
    (model: string, ratioType: RatioType) => {
      setResolutions((prev) => deleteResolutionField(prev, model, ratioType))
    },
    []
  )

  const handleUnselectValues = useCallback((plan: ResolutionRemovalPlan) => {
    if (plan.size === 0) return
    setResolutions((prev) => applyResolutionRemovalPlan(prev, plan))
  }, [])

  const parsedRatios = useMemo(() => {
    return {
      ModelRatio: parseJsonRecord<number>(modelRatios.ModelRatio),
      CompletionRatio: parseJsonRecord<number>(modelRatios.CompletionRatio),
      CacheRatio: parseJsonRecord<number>(modelRatios.CacheRatio),
      CreateCacheRatio: parseJsonRecord<number>(modelRatios.CreateCacheRatio),
      ImageRatio: parseJsonRecord<number>(modelRatios.ImageRatio),
      AudioRatio: parseJsonRecord<number>(modelRatios.AudioRatio),
      AudioCompletionRatio: parseJsonRecord<number>(
        modelRatios.AudioCompletionRatio
      ),
      ModelPrice: parseJsonRecord<number>(modelRatios.ModelPrice),
      'billing_setting.billing_mode': parseJsonRecord<string>(
        modelRatios['billing_setting.billing_mode']
      ),
      'billing_setting.billing_expr': parseJsonRecord<string>(
        modelRatios['billing_setting.billing_expr']
      ),
    }
  }, [modelRatios])

  type ParsedRatios = typeof parsedRatios

  const getLocalBillingCategory = (
    model: string,
    currentRatios: ParsedRatios
  ): 'price' | 'ratio' | 'tiered' | null => {
    if (currentRatios.ModelPrice[model] !== undefined) return 'price'
    if (currentRatios['billing_setting.billing_expr'][model] !== undefined) {
      return 'tiered'
    }
    if (
      currentRatios.ModelRatio[model] !== undefined ||
      currentRatios.CompletionRatio[model] !== undefined ||
      currentRatios.CacheRatio[model] !== undefined ||
      currentRatios.CreateCacheRatio[model] !== undefined ||
      currentRatios.ImageRatio[model] !== undefined ||
      currentRatios.AudioRatio[model] !== undefined ||
      currentRatios.AudioCompletionRatio[model] !== undefined
    ) {
      return 'ratio'
    }
    return null
  }

  const performSync = useCallback(
    async (currentRatios: ParsedRatios): Promise<boolean> => {
      const finalRatios: Record<string, Record<string, number | string>> = {
        ModelRatio: { ...currentRatios.ModelRatio },
        CompletionRatio: { ...currentRatios.CompletionRatio },
        CacheRatio: { ...currentRatios.CacheRatio },
        CreateCacheRatio: { ...currentRatios.CreateCacheRatio },
        ImageRatio: { ...currentRatios.ImageRatio },
        AudioRatio: { ...currentRatios.AudioRatio },
        AudioCompletionRatio: { ...currentRatios.AudioCompletionRatio },
        ModelPrice: { ...currentRatios.ModelPrice },
        'billing_setting.billing_mode': {
          ...currentRatios['billing_setting.billing_mode'],
        },
        'billing_setting.billing_expr': {
          ...currentRatios['billing_setting.billing_expr'],
        },
      }

      Object.entries(resolutions).forEach(([itemKey, ratios]) => {
        const model =
          viewMode === 'details' ? syncTargets[itemKey]?.trim() : itemKey
        if (!model) return
        const selectedTypes = Object.keys(ratios)
        const hasPrice = selectedTypes.includes('model_price')
        const hasTiered = selectedTypes.includes('billing_expr')
        const hasRatio = selectedTypes.some((rt) =>
          RATIO_SYNC_FIELDS.includes(rt as RatioType)
        )

        if (hasPrice) {
          delete finalRatios.ModelRatio[model]
          delete finalRatios.CompletionRatio[model]
          delete finalRatios.CacheRatio[model]
          delete finalRatios.CreateCacheRatio[model]
          delete finalRatios.ImageRatio[model]
          delete finalRatios.AudioRatio[model]
          delete finalRatios.AudioCompletionRatio[model]
          delete finalRatios['billing_setting.billing_mode'][model]
          delete finalRatios['billing_setting.billing_expr'][model]
        }
        if (hasRatio || hasTiered) {
          delete finalRatios.ModelPrice[model]
        }
        if (hasRatio && !hasTiered) {
          delete finalRatios['billing_setting.billing_mode'][model]
          delete finalRatios['billing_setting.billing_expr'][model]
        }

        Object.entries(ratios).forEach(([ratioType, value]) => {
          const optionKey = optionKeyBySyncField(ratioType)
          finalRatios[optionKey][model] = NUMERIC_SYNC_FIELDS.has(ratioType)
            ? Number(value)
            : value
        })
      })

      const updates = Object.entries(finalRatios).map(([key, value]) => ({
        key,
        value: JSON.stringify(value, null, 2),
      }))

      return new Promise<boolean>((resolve) => {
        syncMutate(updates, {
          onSuccess: () => resolve(true),
          onError: () => resolve(false),
        })
      })
    },
    [resolutions, syncMutate, syncTargets, viewMode]
  )

  const findSourceChannel = (
    model: string,
    ratioType: RatioType,
    value: number | string
  ): string => {
    const upstreams = differences[model]?.[ratioType]?.upstreams
    if (!upstreams) return 'Unknown'
    return Object.entries(upstreams).find(([, upstreamValue]) =>
      upstreamValue === value
    )?.[0] ?? 'Unknown'
  }

  const handleApplyDifferenceSync = () => {
    const currentRatios = parsedRatios
    const conflicts: ConflictItem[] = []
    const fixedPriceLabel = t('Fixed price')
    const modelRatioLabel = t('Model ratio')
    const completionRatioLabel = t('Completion ratio')

    Object.entries(resolutions).forEach(([model, ratios]) => {
      const localCategory = getLocalBillingCategory(model, currentRatios)
      const selectedTypes = Object.keys(ratios)
      const newCategory = 'model_price' in ratios ? 'price' : 'ratio'
      if (!localCategory || localCategory === 'tiered' || localCategory === newCategory) {
        return
      }

      const currentDescription =
        localCategory === 'price'
          ? `${fixedPriceLabel}: ${currentRatios.ModelPrice[model]}`
          : `${modelRatioLabel}: ${currentRatios.ModelRatio[model] ?? '-'}\n${completionRatioLabel}: ${currentRatios.CompletionRatio[model] ?? '-'}`
      const newDescription =
        newCategory === 'price'
          ? `${fixedPriceLabel}: ${ratios.model_price}`
          : `${modelRatioLabel}: ${ratios.model_ratio ?? '-'}\n${completionRatioLabel}: ${ratios.completion_ratio ?? '-'}`
      const channels = selectedTypes
        .map((ratioType) =>
          findSourceChannel(model, ratioType as RatioType, ratios[ratioType])
        )
        .filter((channel, index, values) => values.indexOf(channel) === index)
        .join(', ')

      conflicts.push({
        channel: channels,
        model,
        current: currentDescription,
        newVal: newDescription,
      })
    })

    if (conflicts.length > 0) {
      setConflictItems(conflicts)
      setConflictDialogOpen(true)
      return
    }

    toast.info(t('Syncing prices, please wait...'))
    performSync(currentRatios)
  }

  const handleApplySync = () => {
    if (viewMode === 'details') {
      setTargetDialogOpen(true)
      return
    }
    handleApplyDifferenceSync()
  }

  const selectedItems = useMemo(
    () => upstreamItems.filter((item) => resolutions[item.key]),
    [upstreamItems, resolutions]
  )

  const localModelOptions = useMemo(() => {
    const names = new Set<string>()
    Object.values(parsedRatios).forEach((record) => {
      Object.keys(record).forEach((model) => names.add(model))
    })
    upstreamItems.forEach((item) => {
      names.add(item.model_id || item.model_name)
    })
    return [...names]
      .sort()
      .map((model) => ({ value: model, label: model }))
  }, [parsedRatios, upstreamItems])

  const handleConfirmTargetMapping = () => {
    const currentRatios = parsedRatios
    const conflicts: ConflictItem[] = []

    const fixedPriceLabel = t('Fixed price')
    const modelRatioLabel = t('Model ratio')
    const completionRatioLabel = t('Completion ratio')

    for (const item of selectedItems) {
      const model = syncTargets[item.key]?.trim()
      const ratios = resolutions[item.key]
      if (!model) {
        toast.error(t('Model name is required'))
        return
      }
      const localCat = getLocalBillingCategory(model, currentRatios)
      const selectedTypes = Object.keys(ratios)
      let newCat: 'price' | 'ratio' | 'tiered'
      if ('model_price' in ratios) {
        newCat = 'price'
      } else if ('billing_expr' in ratios) {
        newCat = 'tiered'
      } else if (RATIO_SYNC_FIELDS.some((rt) => selectedTypes.includes(rt))) {
        newCat = 'ratio'
      } else {
        newCat = 'tiered'
      }

      if (localCat && newCat !== 'tiered' && localCat !== newCat) {
        let currentDesc = `${modelRatioLabel}: ${currentRatios.ModelRatio[model] ?? '-'}\n${completionRatioLabel}: ${currentRatios.CompletionRatio[model] ?? '-'}`
        if (localCat === 'price') {
          currentDesc = `${fixedPriceLabel}: ${currentRatios.ModelPrice[model]}`
        } else if (localCat === 'tiered') {
          currentDesc = `${t('Expression billing')}: ${currentRatios['billing_setting.billing_expr'][model] ?? '-'}`
        }

        const newDesc =
          newCat === 'price'
            ? `${fixedPriceLabel}: ${ratios.model_price}`
            : `${modelRatioLabel}: ${ratios.model_ratio ?? '-'}\n${completionRatioLabel}: ${ratios.completion_ratio ?? '-'}`

        conflicts.push({
          channel: item.source_name,
          model,
          current: currentDesc,
          newVal: newDesc,
        })
      }
    }

    if (conflicts.length > 0) {
      setConflictItems(conflicts)
      setConflictDialogOpen(true)
      return
    }

    setTargetDialogOpen(false)
    toast.info(t('Syncing prices, please wait...'))
    performSync(currentRatios)
  }

  const handleConfirmConflict = async () => {
    setConfirmLoading(true)
    try {
      const success = await performSync(parsedRatios)
      if (success) {
        setConflictDialogOpen(false)
        setTargetDialogOpen(false)
      }
    } finally {
      setConfirmLoading(false)
    }
  }

  const hasSelections = Object.keys(resolutions).length > 0
  const isLoading = fetchMutation.isPending || isSyncPending || confirmLoading

  return (
    <div className='flex h-full min-h-0 flex-col gap-4'>
      <div className='flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
        <div className='flex flex-col gap-2 sm:flex-row'>
          <Button onClick={handleOpenChannelDialog} disabled={isLoading}>
            <RefreshCcw className='mr-2 h-4 w-4' />
            {t('Select Sync Channels')}
          </Button>
          <Button
            variant='secondary'
            onClick={handleApplySync}
            disabled={!hasSelections || isLoading}
          >
            {(isSyncPending || confirmLoading) && (
              <span className='mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent' />
            )}
            <CheckSquare className='mr-2 h-4 w-4' />
            {t('Apply Sync')}
          </Button>
        </div>
        {upstreamItems.length > 0 && Object.keys(differences).length > 0 && (
          <div className='bg-muted flex rounded-md p-1'>
            <Button
              type='button'
              size='sm'
              variant={viewMode === 'details' ? 'secondary' : 'ghost'}
              onClick={() => {
                setViewMode('details')
                setResolutions({})
              }}
            >
              {t('Details')}
            </Button>
            <Button
              type='button'
              size='sm'
              variant={viewMode === 'differences' ? 'secondary' : 'ghost'}
              onClick={() => {
                setViewMode('differences')
                setResolutions({})
                setSyncTargets({})
              }}
            >
              {t('Current Price')}
            </Button>
          </div>
        )}
      </div>

      <div className='min-h-0 flex-1'>
        {viewMode === 'details' ? (
          <UpstreamPricingItemsTable
            items={upstreamItems}
            resolutions={resolutions}
            isDisabled={isLoading}
            isSyncing={fetchMutation.isPending}
            onSelectItem={handleSelectItem}
            onUnselectItem={handleUnselectItem}
            onBulkSelect={handleBulkSelect}
            onBulkUnselect={handleBulkUnselect}
          />
        ) : (
          <UpstreamRatioSyncTable
            differences={differences}
            resolutions={resolutions}
            isDisabled={isLoading}
            isSyncing={fetchMutation.isPending}
            onSelectValue={handleSelectValue}
            onSelectValues={handleSelectValues}
            onUnselectValue={handleUnselectValue}
            onUnselectValues={handleUnselectValues}
          />
        )}
      </div>

      <Dialog
        open={targetDialogOpen}
        onOpenChange={setTargetDialogOpen}
        title={t('Confirm Selection')}
        contentClassName='sm:max-w-4xl'
        footer={
          <>
            <Button
              type='button'
              variant='outline'
              onClick={() => setTargetDialogOpen(false)}
              disabled={isLoading}
            >
              {t('Cancel')}
            </Button>
            <Button
              type='button'
              onClick={handleConfirmTargetMapping}
              disabled={isLoading || selectedItems.length === 0}
            >
              {t('Confirm')}
            </Button>
          </>
        }
      >
        <div className='space-y-3'>
          {selectedItems.map((item) => (
            <div
              key={item.key}
              className='grid gap-2 rounded-md border p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:items-center'
            >
              <div className='min-w-0'>
                <div className='text-muted-foreground text-xs'>
                  {item.provider_name || item.source_name}
                </div>
                <div className='truncate font-medium'>{item.model_name}</div>
                {item.model_id && item.model_id !== item.model_name && (
                  <div className='text-muted-foreground truncate font-mono text-xs'>
                    {item.model_id}
                  </div>
                )}
              </div>
              <div className='min-w-0'>
                <div className='text-muted-foreground mb-1 text-xs'>
                  {t('Replacement Model')}
                </div>
                <Combobox
                  options={localModelOptions}
                  value={syncTargets[item.key] || ''}
                  onValueChange={(value) =>
                    setSyncTargets((prev) => ({
                      ...prev,
                      [item.key]: value || '',
                    }))
                  }
                  placeholder={t('Select Model')}
                  searchPlaceholder={t('Search model name...')}
                  allowCustomValue
                />
              </div>
            </div>
          ))}
        </div>
      </Dialog>

      <ChannelSelectorDialog
        open={channelDialogOpen}
        onOpenChange={setChannelDialogOpen}
        channels={channels}
        selectedChannelIds={selectedChannelIds}
        onSelectedChannelIdsChange={setSelectedChannelIds}
        channelEndpoints={channelEndpoints}
        onChannelEndpointsChange={setChannelEndpoints}
        onConfirm={handleConfirmChannelSelection}
      />

      <ConflictConfirmDialog
        open={conflictDialogOpen}
        onOpenChange={setConflictDialogOpen}
        conflicts={conflictItems}
        onConfirm={handleConfirmConflict}
        isLoading={confirmLoading}
      />
    </div>
  )
}
