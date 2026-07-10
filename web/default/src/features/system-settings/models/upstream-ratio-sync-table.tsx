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
import { type ColumnDef } from '@tanstack/react-table'
import { Info, Loader2, Search } from 'lucide-react'
import type { ReactNode } from 'react'
import { useDeferredValue, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  DataTablePagination,
  DataTableView,
  useDataTable,
} from '@/components/data-table'
import { Dialog } from '@/components/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { DynamicPricingBreakdown } from '@/features/pricing/components/dynamic-pricing-breakdown'
import { cn } from '@/lib/utils'

import type { UpstreamPricingItem, UpstreamPricingTier } from '../types'
import type { ResolutionsMap } from './upstream-ratio-sync-helpers'

type UpstreamRatioSyncTableProps = {
  items: UpstreamPricingItem[]
  resolutions: ResolutionsMap
  isDisabled: boolean
  isSyncing: boolean
  onSelectItem: (item: UpstreamPricingItem) => void
  onUnselectItem: (itemKey: string) => void
  onBulkSelect: (items: UpstreamPricingItem[]) => void
  onBulkUnselect: (items: UpstreamPricingItem[]) => void
}

type Row = UpstreamPricingItem

const TYPE_LABELS: Record<string, string> = {
  text: 'Text',
  image: 'Image',
  audio: 'Audio',
  video: 'Video',
  embedding: 'Embeddings',
  rerank: 'Rerank',
}

const CAPABILITY_LABELS: Record<string, string> = {
  Reasoning: 'Reasoning',
  'Structured output': 'Structured output',
}

function formatPrice(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '-'
  }
  return `$${value.toLocaleString(undefined, {
    maximumFractionDigits: 6,
  })}`
}

function formatContext(value: number | null | undefined): string {
  if (!value || !Number.isFinite(value)) return '-'
  if (value >= 1_000_000) {
    const n = value / 1_000_000
    return `${Number.isInteger(n) ? n.toFixed(0) : n.toFixed(1)}M`
  }
  if (value >= 1000) {
    const n = value / 1000
    return `${Number.isInteger(n) ? n.toFixed(0) : n.toFixed(1)}K`
  }
  return String(value)
}

function typeLabel(type: string | undefined, t: (key: string) => string) {
  return t(TYPE_LABELS[type || ''] || type || 'Text')
}

function capabilityLabel(value: string, t: (key: string) => string) {
  return t(CAPABILITY_LABELS[value] || value)
}

function hasSelectedRow(resolutions: ResolutionsMap, row: Row): boolean {
  return Object.keys(resolutions[row.key] || {}).length > 0
}

function PriceCell({ value }: { value?: number }) {
  return <span className='font-mono text-sm'>{formatPrice(value)}</span>
}

function PriceHeader({ label }: { label: string }) {
  return (
    <div>
      <div>{label}</div>
      <div className='text-muted-foreground text-xs font-normal'>$/M</div>
    </div>
  )
}

function CapabilityBadges({ row }: { row: Row }) {
  const { t } = useTranslation()
  const capabilities = row.capabilities || []
  if (capabilities.length === 0) return <span className='text-muted-foreground'>-</span>
  return (
    <div className='flex max-w-[520px] flex-wrap gap-1'>
      {capabilities.map((capability) => (
        <Badge
          key={capability}
          variant='secondary'
          className='rounded-sm bg-blue-50 px-1.5 py-0 text-xs font-normal text-blue-700 dark:bg-blue-500/15 dark:text-blue-300'
        >
          {capabilityLabel(capability, t)}
        </Badge>
      ))}
    </div>
  )
}

function DetailField({
  label,
  value,
}: {
  label: string
  value: ReactNode
}) {
  return (
    <div className='grid grid-cols-[120px_1fr] border-b text-sm last:border-b-0'>
      <div className='bg-muted/40 text-muted-foreground px-3 py-2'>{label}</div>
      <div className='min-w-0 px-3 py-2'>{value || '-'}</div>
    </div>
  )
}

function TierCard({ tier }: { tier: UpstreamPricingTier }) {
  const { t } = useTranslation()
  const entries = [
    ['Input', tier.input_price],
    ['Output', tier.output_price],
    ['Cache Read', tier.cache_read_price],
    ['Cache Write', tier.cache_write_price],
  ] as const

  return (
    <div className='rounded-md border p-3'>
      <div className='mb-2 flex items-center justify-between gap-2'>
        <div className='font-medium'>{tier.label || 'base'}</div>
        {tier.condition && (
          <Badge variant='outline' className='font-mono text-xs'>
            {tier.condition}
          </Badge>
        )}
      </div>
      <div className='grid grid-cols-2 gap-x-4 gap-y-2 text-sm'>
        {entries.map(([label, value]) => (
          <div key={label} className='flex items-center justify-between gap-3'>
            <span className='text-muted-foreground'>{t(label)}</span>
            <span className='font-mono'>{formatPrice(value)}/M</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ModelDetailsDialog({ row }: { row: Row }) {
  const { t } = useTranslation()

  return (
    <Dialog
      title={row.model_name}
      trigger={
        <Button type='button' variant='ghost' size='sm'>
          <Info className='h-3.5 w-3.5' />
          {t('Details')}
        </Button>
      }
      contentClassName='sm:max-w-5xl'
      bodyClassName='space-y-4'
    >
      <div className='overflow-hidden rounded-md border'>
        <DetailField label={t('Model')} value={row.model_id || row.model_name} />
        <DetailField
          label={t('Provider')}
          value={
            <div>
              <div>{row.provider_name || row.source_name}</div>
              {row.provider_id && (
                <div className='text-muted-foreground text-xs'>
                  {row.provider_id}
                </div>
              )}
            </div>
          }
        />
        <DetailField label={t('Type')} value={typeLabel(row.type, t)} />
        <DetailField
          label={t('Capabilities')}
          value={<CapabilityBadges row={row} />}
        />
        <DetailField label={t('Description')} value={row.description} />
        <DetailField label={t('Published')} value={row.release_date} />
        <DetailField label={t('Updated')} value={row.last_updated} />
        <DetailField label={t('Context')} value={formatContext(row.context)} />
      </div>

      {row.tiers && row.tiers.length > 0 && (
        <div>
          <div className='mb-2 text-sm font-medium'>{t('Billing Details')}</div>
          <div className='grid gap-2 md:grid-cols-2'>
            {row.tiers.map((tier, index) => (
              <TierCard key={`${tier.label}-${index}`} tier={tier} />
            ))}
          </div>
        </div>
      )}

      {row.billing_expr && (
        <div>
          <DynamicPricingBreakdown billingExpr={row.billing_expr} compact />
          <div className='mt-3'>
            <div className='text-muted-foreground mb-1 text-xs font-medium'>
              {t('Raw expression')}
            </div>
            <code className='bg-muted block rounded-md p-2 text-xs break-all'>
              {row.billing_expr}
            </code>
          </div>
        </div>
      )}
    </Dialog>
  )
}

export function UpstreamRatioSyncTable({
  items,
  resolutions,
  isDisabled,
  isSyncing,
  onSelectItem,
  onUnselectItem,
  onBulkSelect,
  onBulkUnselect,
}: UpstreamRatioSyncTableProps) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [providerFilter, setProviderFilter] = useState<string[]>([])
  const deferredSearch = useDeferredValue(search)

  const providerOptions = useMemo(() => {
    const providers = Array.from(
      new Set(items.map((item) => item.provider_name || item.source_name))
    )
    return providers.filter(Boolean).sort()
  }, [items])

  const filteredData = useMemo(() => {
    let data = items
    if (deferredSearch.trim()) {
      const lower = deferredSearch.trim().toLowerCase()
      data = data.filter((item) =>
        [
          item.model_name,
          item.model_id,
          item.provider_name,
          item.provider_id,
          item.source_name,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(lower))
      )
    }
    if (providerFilter.length > 0) {
      const providers = new Set(providerFilter)
      data = data.filter((item) =>
        providers.has(item.provider_name || item.source_name)
      )
    }
    return data
  }, [items, deferredSearch, providerFilter])

  const columns = useMemo<ColumnDef<Row>[]>(() => {
    const selectedCount = filteredData.filter((row) =>
      hasSelectedRow(resolutions, row)
    ).length
    const selectableCount = filteredData.length
    const allSelected = selectableCount > 0 && selectedCount === selectableCount
    const someSelected = selectedCount > 0 && selectedCount < selectableCount

    return [
      {
        id: 'select',
        header: () => (
          <Checkbox
            checked={allSelected}
            indeterminate={someSelected}
            disabled={isDisabled || selectableCount === 0}
            onCheckedChange={(checked) => {
              if (checked) onBulkSelect(filteredData)
              else onBulkUnselect(filteredData)
            }}
          />
        ),
        cell: ({ row }) => {
          const item = row.original
          return (
            <Checkbox
              checked={hasSelectedRow(resolutions, item)}
              disabled={isDisabled}
              onCheckedChange={(checked) => {
                if (checked) onSelectItem(item)
                else onUnselectItem(item.key)
              }}
            />
          )
        },
      },
      {
        accessorKey: 'model_name',
        header: t('Model'),
        cell: ({ row }) => (
          <div className='min-w-[220px]'>
            <div className='font-medium'>{row.original.model_name}</div>
            {row.original.model_id && row.original.model_id !== row.original.model_name && (
              <div className='text-muted-foreground font-mono text-xs'>
                {row.original.model_id}
              </div>
            )}
          </div>
        ),
      },
      {
        accessorKey: 'provider_name',
        header: t('Provider'),
        cell: ({ row }) => (
          <div className='min-w-[120px]'>
            <div className='font-medium'>
              {row.original.provider_name || row.original.source_name}
            </div>
            {(row.original.provider_id || row.original.source_name) && (
              <div className='text-muted-foreground font-mono text-xs'>
                {row.original.provider_id || row.original.source_name}
              </div>
            )}
          </div>
        ),
      },
      {
        accessorKey: 'type',
        header: t('Type'),
        cell: ({ row }) => (
          <Badge variant='secondary' className='rounded-sm font-normal'>
            {typeLabel(row.original.type, t)}
          </Badge>
        ),
      },
      {
        accessorKey: 'input_price',
        header: () => <PriceHeader label={t('Input price')} />,
        cell: ({ row }) => <PriceCell value={row.original.input_price} />,
      },
      {
        accessorKey: 'output_price',
        header: () => <PriceHeader label={t('Output price')} />,
        cell: ({ row }) => <PriceCell value={row.original.output_price} />,
      },
      {
        accessorKey: 'cache_read_price',
        header: () => <PriceHeader label={t('Cache read price')} />,
        cell: ({ row }) => <PriceCell value={row.original.cache_read_price} />,
      },
      {
        accessorKey: 'cache_write_price',
        header: () => <PriceHeader label={t('Cache create price')} />,
        cell: ({ row }) => <PriceCell value={row.original.cache_write_price} />,
      },
      {
        accessorKey: 'context',
        header: t('Context'),
        cell: ({ row }) => (
          <span className='font-mono text-sm'>
            {formatContext(row.original.context)}
          </span>
        ),
      },
      {
        accessorKey: 'capabilities',
        header: t('Capabilities'),
        cell: ({ row }) => <CapabilityBadges row={row.original} />,
      },
      {
        accessorKey: 'last_updated',
        header: t('Updated'),
        cell: ({ row }) => (
          <span className='font-mono text-sm'>
            {row.original.last_updated || '-'}
          </span>
        ),
      },
      {
        id: 'details',
        header: '',
        cell: ({ row }) => <ModelDetailsDialog row={row.original} />,
      },
    ]
  }, [
    filteredData,
    isDisabled,
    onBulkSelect,
    onBulkUnselect,
    onSelectItem,
    onUnselectItem,
    resolutions,
    t,
  ])

  const { table } = useDataTable({
    data: filteredData,
    columns,
    getRowId: (row) => row.key,
    initialPagination: { pageIndex: 0, pageSize: 20 },
    withFilteredRowModel: false,
    withSortedRowModel: false,
    withFacetedRowModel: false,
  })

  if (items.length === 0) {
    if (isSyncing) {
      return (
        <div className='flex h-64 flex-col items-center justify-center gap-3 rounded-md border'>
          <Loader2 className='text-muted-foreground h-8 w-8 animate-spin' />
          <p className='text-muted-foreground text-sm'>
            {t('Fetching upstream prices...')}
          </p>
        </div>
      )
    }

    return (
      <div className='flex h-64 items-center justify-center rounded-md border'>
        <p className='text-muted-foreground text-sm'>
          {t('Select sync channels to compare prices')}
        </p>
      </div>
    )
  }

  return (
    <div className='space-y-3'>
      <div className='flex flex-col gap-2 xl:flex-row xl:items-center'>
        <div className='relative flex-1'>
          <Search className='text-muted-foreground absolute top-1/2 left-2 h-4 w-4 -translate-y-1/2' />
          <Input
            placeholder={t('Search model name...')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            disabled={isDisabled}
            className='ps-8'
          />
        </div>
        <ProviderFilter
          providers={providerOptions}
          value={providerFilter}
          disabled={isDisabled}
          onChange={setProviderFilter}
        />
        <div className='text-muted-foreground flex shrink-0 items-center gap-2 text-sm'>
          <span>
            {t('Show')} {filteredData.length}
          </span>
          <span className='rounded-md border px-2 py-1 font-mono text-xs'>
            {t('Refresh Cache')}
          </span>
        </div>
      </div>

      <DataTableView
        table={table}
        containerClassName='rounded-md'
        tableContainerClassName='overflow-x-auto'
        getColumnClassName={() => 'align-middle whitespace-nowrap'}
        getRowClassName={() => cn('align-middle')}
        emptyContent={t('No results found')}
        emptyCellClassName='h-24 text-center'
      />

      <DataTablePagination table={table} />
    </div>
  )
}

function ProviderFilter({
  providers,
  value,
  disabled,
  onChange,
}: {
  providers: string[]
  value: string[]
  disabled: boolean
  onChange: (value: string[]) => void
}) {
  const { t } = useTranslation()
  const selected = new Set(value)
  const label =
    value.length === 0
      ? t('Provider')
      : value.length === 1
        ? value[0]
        : `${value[0]} (${value.length})`

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type='button'
            variant='outline'
            className='w-full justify-start xl:w-72'
            disabled={disabled}
          />
        }
      >
        <span className='truncate'>{label}</span>
      </PopoverTrigger>
      <PopoverContent align='end' className='w-72'>
        <div className='max-h-72 space-y-1 overflow-y-auto'>
          {providers.map((provider) => (
            <label
              key={provider}
              className='hover:bg-muted flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm'
            >
              <Checkbox
                checked={selected.has(provider)}
                onCheckedChange={(checked) => {
                  if (checked) {
                    onChange([...value, provider])
                  } else {
                    onChange(value.filter((item) => item !== provider))
                  }
                }}
              />
              <span className='truncate'>{provider}</span>
            </label>
          ))}
        </div>
        {value.length > 0 && (
          <Button
            type='button'
            variant='ghost'
            size='sm'
            className='mt-2 w-full'
            onClick={() => onChange([])}
          >
            {t('Show All')}
          </Button>
        )}
      </PopoverContent>
    </Popover>
  )
}
