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
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckSquare, Loader2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

import { fetchUpstreamRatios, updateSystemOption } from '../api'
import type { RatioType, UpstreamPricingItem } from '../types'
import { ConflictConfirmDialog, type ConflictItem } from './conflict-confirm-dialog'
import {
  MODELS_DEV_PRESET_BASE_URL,
  MODELS_DEV_PRESET_ENDPOINT,
  MODELS_DEV_PRESET_ID,
} from './constants'
import { UpstreamPricingItemsTable } from './upstream-pricing-items-table'
import {
  NUMERIC_SYNC_FIELDS,
  RATIO_SYNC_FIELDS,
  type ResolutionsMap,
} from './upstream-ratio-sync-helpers'

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

const MODELS_DEV_REQUEST = {
  upstreams: [
    {
      id: MODELS_DEV_PRESET_ID,
      name: 'models.dev',
      base_url: MODELS_DEV_PRESET_BASE_URL,
      endpoint: MODELS_DEV_PRESET_ENDPOINT,
    },
  ],
  timeout: 30,
  catalog_only: true,
}

function optionKeyBySyncField(ratioType: string): string {
  if (ratioType === 'billing_mode') return 'billing_setting.billing_mode'
  if (ratioType === 'billing_expr') return 'billing_setting.billing_expr'
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

export function UpstreamRatioSync(props: UpstreamRatioSyncProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [upstreamItems, setUpstreamItems] = useState<UpstreamPricingItem[]>([])
  const [lastFetchedAt, setLastFetchedAt] = useState<number | null>(null)
  const fetchAbortController = useRef<AbortController | null>(null)
  const fetchRequestId = useRef(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [resolutions, setResolutions] = useState<ResolutionsMap>({})
  const [syncTargets, setSyncTargets] = useState<Record<string, string>>({})
  const [targetDialogOpen, setTargetDialogOpen] = useState(false)
  const [conflictDialogOpen, setConflictDialogOpen] = useState(false)
  const [conflictItems, setConflictItems] = useState<ConflictItem[]>([])
  const [confirmLoading, setConfirmLoading] = useState(false)

  const handleRefresh = useCallback(async () => {
    fetchAbortController.current?.abort()
    const controller = new AbortController()
    const requestId = fetchRequestId.current + 1
    fetchAbortController.current = controller
    fetchRequestId.current = requestId
    setIsRefreshing(true)

    try {
      const data = await fetchUpstreamRatios(
        MODELS_DEV_REQUEST,
        controller.signal
      )
      if (!data.success) {
        toast.error(data.message || t('Failed to fetch upstream prices'))
        return
      }

      const items = data.data.items || []
      const errorResults = data.data.test_results.filter(
        (result) => result.status === 'error'
      )
      if (errorResults.length > 0) {
        const errorMsg = errorResults
          .map((result) => `${result.name}: ${result.error}`)
          .join(', ')
        toast.warning(t('Some channels failed: {{errorMsg}}', { errorMsg }))
      }

      const fetchedAt = Date.now()
      setUpstreamItems(items)
      setLastFetchedAt(fetchedAt)
      setResolutions({})
      setSyncTargets({})
      toast.success(t('Upstream prices fetched successfully'))
    } catch (error) {
      const requestError = error as Error & { code?: string }
      if (requestError.code === 'ERR_CANCELED') return
      toast.error(requestError.message || t('Failed to fetch upstream prices'))
    } finally {
      if (fetchRequestId.current === requestId) {
        fetchAbortController.current = null
        setIsRefreshing(false)
      }
    }
  }, [t])

  useEffect(() => {
    handleRefresh()
    return () => fetchAbortController.current?.abort()
  }, [handleRefresh])

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

  const parsedRatios = useMemo(() => {
    return {
      ModelRatio: parseJsonRecord<number>(props.modelRatios.ModelRatio),
      CompletionRatio: parseJsonRecord<number>(props.modelRatios.CompletionRatio),
      CacheRatio: parseJsonRecord<number>(props.modelRatios.CacheRatio),
      CreateCacheRatio: parseJsonRecord<number>(props.modelRatios.CreateCacheRatio),
      ImageRatio: parseJsonRecord<number>(props.modelRatios.ImageRatio),
      AudioRatio: parseJsonRecord<number>(props.modelRatios.AudioRatio),
      AudioCompletionRatio: parseJsonRecord<number>(
        props.modelRatios.AudioCompletionRatio
      ),
      ModelPrice: parseJsonRecord<number>(props.modelRatios.ModelPrice),
      'billing_setting.billing_mode': parseJsonRecord<string>(
        props.modelRatios['billing_setting.billing_mode']
      ),
      'billing_setting.billing_expr': parseJsonRecord<string>(
        props.modelRatios['billing_setting.billing_expr']
      ),
    }
  }, [props.modelRatios])

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
        const model = syncTargets[itemKey]?.trim()
        if (!model) return
        const selectedTypes = Object.keys(ratios)
        const hasPrice = selectedTypes.includes('model_price')
        const hasTiered = selectedTypes.includes('billing_expr')
        const hasRatio = selectedTypes.some((ratioType) =>
          RATIO_SYNC_FIELDS.includes(ratioType as RatioType)
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
    [resolutions, syncMutate, syncTargets]
  )

  const handleSelectItem = useCallback((item: UpstreamPricingItem) => {
    setResolutions((current) => ({
      ...current,
      [item.key]: { ...item.sync_values },
    }))
    setSyncTargets((current) => ({
      ...current,
      [item.key]: current[item.key] || '',
    }))
  }, [])

  const handleUnselectItem = useCallback((itemKey: string) => {
    setResolutions((current) => {
      const next = { ...current }
      delete next[itemKey]
      return next
    })
    setSyncTargets((current) => {
      const next = { ...current }
      delete next[itemKey]
      return next
    })
  }, [])

  const handleBulkSelect = useCallback((items: UpstreamPricingItem[]) => {
    setResolutions((current) => {
      const next = { ...current }
      items.forEach((item) => {
        next[item.key] = { ...item.sync_values }
      })
      return next
    })
    setSyncTargets((current) => {
      const next = { ...current }
      items.forEach((item) => {
        next[item.key] = next[item.key] || ''
      })
      return next
    })
  }, [])

  const handleBulkUnselect = useCallback((items: UpstreamPricingItem[]) => {
    setResolutions((current) => {
      const next = { ...current }
      items.forEach((item) => delete next[item.key])
      return next
    })
    setSyncTargets((current) => {
      const next = { ...current }
      items.forEach((item) => delete next[item.key])
      return next
    })
  }, [])

  const selectedItems = useMemo(
    () => upstreamItems.filter((item) => resolutions[item.key]),
    [resolutions, upstreamItems]
  )

  const handleConfirmTargetMapping = () => {
    const conflicts: ConflictItem[] = []
    for (const item of selectedItems) {
      const model = syncTargets[item.key]?.trim()
      const ratios = resolutions[item.key]
      if (!model) {
        toast.error(t('Model name is required'))
        return
      }

      const currentCategory = getLocalBillingCategory(model, parsedRatios)
      let newCategory: 'price' | 'ratio' | 'tiered' = 'ratio'
      if ('model_price' in ratios) {
        newCategory = 'price'
      } else if ('billing_expr' in ratios) {
        newCategory = 'tiered'
      }
      if (!currentCategory || currentCategory === newCategory) continue

      let currentDescription = `${t('Model ratio')}: ${parsedRatios.ModelRatio[model] ?? '-'}\n${t('Completion ratio')}: ${parsedRatios.CompletionRatio[model] ?? '-'}`
      if (currentCategory === 'price') {
        currentDescription = `${t('Fixed price')}: ${parsedRatios.ModelPrice[model]}`
      } else if (currentCategory === 'tiered') {
        currentDescription = `${t('Expression billing')}: ${parsedRatios['billing_setting.billing_expr'][model]}`
      }

      let newDescription = `${t('Model ratio')}: ${ratios.model_ratio ?? '-'}\n${t('Completion ratio')}: ${ratios.completion_ratio ?? '-'}`
      if (newCategory === 'price') {
        newDescription = `${t('Fixed price')}: ${ratios.model_price}`
      } else if (newCategory === 'tiered') {
        newDescription = `${t('Expression billing')}: ${ratios.billing_expr}`
      }

      conflicts.push({
        channel: item.provider_name || item.source_name,
        model,
        current: currentDescription,
        newVal: newDescription,
      })
    }

    if (conflicts.length > 0) {
      setConflictItems(conflicts)
      setConflictDialogOpen(true)
      return
    }

    setTargetDialogOpen(false)
    toast.info(t('Syncing prices, please wait...'))
    performSync(parsedRatios)
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

  const isLoading = isRefreshing || isSyncPending || confirmLoading

  return (
    <div className='flex h-full min-h-0 flex-col gap-3'>
      <div className='flex shrink-0 items-center justify-between gap-3 text-[12px]'>
        <div className='flex min-w-0 items-center gap-2'>
          <Badge variant='outline' className='h-7 rounded-sm px-2 text-[11px] font-normal'>
            models.dev
          </Badge>
          <span className='text-muted-foreground hidden truncate md:inline'>
            {MODELS_DEV_PRESET_ENDPOINT}
          </span>
        </div>
        <Button
          type='button'
          size='sm'
          className='h-8 text-[12px]'
          onClick={() => setTargetDialogOpen(true)}
          disabled={selectedItems.length === 0 || isLoading}
        >
          {(isSyncPending || confirmLoading) ? (
            <Loader2 data-icon='inline-start' className='animate-spin' />
          ) : (
            <CheckSquare data-icon='inline-start' />
          )}
          {t('Apply Sync')}
        </Button>
      </div>

      <div className='min-h-0 flex-1'>
        <UpstreamPricingItemsTable
          items={upstreamItems}
          resolutions={resolutions}
          isDisabled={isLoading}
          isSyncing={isRefreshing}
          lastFetchedAt={lastFetchedAt}
          onRefresh={handleRefresh}
          onSelectItem={handleSelectItem}
          onUnselectItem={handleUnselectItem}
          onBulkSelect={handleBulkSelect}
          onBulkUnselect={handleBulkUnselect}
        />
      </div>

      <Dialog
        open={targetDialogOpen}
        onOpenChange={setTargetDialogOpen}
        title={t('Confirm Selection')}
        contentClassName='sm:max-w-4xl'
        titleClassName='text-sm'
        bodyClassName='text-[12px]'
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
        <div className='divide-y overflow-hidden rounded-md border'>
          {selectedItems.map((item) => (
            <div
              key={item.key}
              className='grid gap-2 p-3 md:grid-cols-[minmax(0,1fr)_minmax(260px,1fr)] md:items-center'
            >
              <div className='min-w-0'>
                <div className='text-muted-foreground truncate text-[10px]'>
                  {item.provider_name || item.source_name}
                </div>
                <div className='truncate text-[12px] font-medium'>{item.model_name}</div>
                <div className='text-muted-foreground mt-1 flex flex-wrap gap-x-3 text-[10px]'>
                  <span>{t('Input')}: ${item.input_price ?? '-'}</span>
                  <span>{t('Output')}: ${item.output_price ?? '-'}</span>
                  {item.tiers && item.tiers.length > 1 && (
                    <span>{t('{{count}} tiers', { count: item.tiers.length })}</span>
                  )}
                </div>
              </div>
              <div className='min-w-0'>
                <div className='text-muted-foreground mb-1 text-[10px]'>
                  {t('Replacement Model')}
                </div>
                <Input
                  value={syncTargets[item.key] || ''}
                  onChange={(event) =>
                    setSyncTargets((current) => ({
                      ...current,
                      [item.key]: event.target.value,
                    }))
                  }
                  placeholder={t('Enter model name')}
                  autoComplete='off'
                  className='h-8 text-[12px]'
                />
              </div>
            </div>
          ))}
        </div>
      </Dialog>

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
