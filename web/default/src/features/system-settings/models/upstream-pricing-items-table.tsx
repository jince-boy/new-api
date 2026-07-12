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
import type { ColumnDef } from '@tanstack/react-table'
import { Info, Loader2, Search } from 'lucide-react'
import { type ReactNode, useDeferredValue, useMemo, useState } from 'react'
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
import { DynamicPricingBreakdown } from '@/features/pricing/components/dynamic-pricing-breakdown'

import type { UpstreamPricingItem, UpstreamPricingTier } from '../types'
import type { ResolutionsMap } from './upstream-ratio-sync-helpers'

type UpstreamPricingItemsTableProps = {
  items: UpstreamPricingItem[]
  resolutions: ResolutionsMap
  isDisabled: boolean
  isSyncing: boolean
  onSelectItem: (item: UpstreamPricingItem) => void
  onUnselectItem: (itemKey: string) => void
  onBulkSelect: (items: UpstreamPricingItem[]) => void
  onBulkUnselect: (items: UpstreamPricingItem[]) => void
}

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
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 6 })}`
}

function formatContext(value: number | null | undefined): string {
  if (!value || !Number.isFinite(value)) return '-'
  if (value >= 1_000_000) {
    const millions = value / 1_000_000
    return `${Number.isInteger(millions) ? millions.toFixed(0) : millions.toFixed(1)}M`
  }
  if (value >= 1000) {
    const thousands = value / 1000
    return `${Number.isInteger(thousands) ? thousands.toFixed(0) : thousands.toFixed(1)}K`
  }
  return String(value)
}

function DetailField(props: { label: string; value: ReactNode }) {
  return (
    <div className='grid grid-cols-[120px_1fr] border-b text-sm last:border-b-0'>
      <div className='bg-muted/40 text-muted-foreground px-3 py-2'>
        {props.label}
      </div>
      <div className='min-w-0 px-3 py-2'>{props.value || '-'}</div>
    </div>
  )
}

function TierCard(props: { tier: UpstreamPricingTier }) {
  const { t } = useTranslation()
  const entries = [
    ['Input', props.tier.input_price],
    ['Output', props.tier.output_price],
    ['Cache Read', props.tier.cache_read_price],
    ['Cache Write', props.tier.cache_write_price],
  ] as const

  return (
    <div className='rounded-md border p-3'>
      <div className='mb-2 flex items-center justify-between gap-2'>
        <div className='font-medium'>{props.tier.label || 'base'}</div>
        {props.tier.condition && (
          <Badge variant='outline' className='font-mono text-xs'>
            {props.tier.condition}
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

function ModelDetailsDialog(props: { item: UpstreamPricingItem }) {
  const { t } = useTranslation()
  const capabilities = props.item.capabilities || []

  return (
    <Dialog
      title={props.item.model_name}
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
        <DetailField
          label={t('Model')}
          value={props.item.model_id || props.item.model_name}
        />
        <DetailField
          label={t('Provider')}
          value={props.item.provider_name || props.item.source_name}
        />
        <DetailField
          label={t('Type')}
          value={t(TYPE_LABELS[props.item.type || ''] || props.item.type || 'Text')}
        />
        <DetailField
          label={t('Capabilities')}
          value={
            capabilities.length > 0 ? (
              <div className='flex flex-wrap gap-1'>
                {capabilities.map((capability) => (
                  <Badge key={capability} variant='secondary'>
                    {t(CAPABILITY_LABELS[capability] || capability)}
                  </Badge>
                ))}
              </div>
            ) : null
          }
        />
        <DetailField label={t('Description')} value={props.item.description} />
        <DetailField label={t('Published')} value={props.item.release_date} />
        <DetailField label={t('Updated')} value={props.item.last_updated} />
        <DetailField label={t('Context')} value={formatContext(props.item.context)} />
      </div>

      {props.item.tiers && props.item.tiers.length > 0 && (
        <div>
          <div className='mb-2 text-sm font-medium'>{t('Billing Details')}</div>
          <div className='grid gap-2 md:grid-cols-2'>
            {props.item.tiers.map((tier) => (
              <TierCard
                key={`${tier.label}-${tier.condition ?? 'base'}`}
                tier={tier}
              />
            ))}
          </div>
        </div>
      )}

      {props.item.billing_expr && (
        <div>
          <DynamicPricingBreakdown billingExpr={props.item.billing_expr} compact />
          <div className='mt-3'>
            <div className='text-muted-foreground mb-1 text-xs font-medium'>
              {t('Raw expression')}
            </div>
            <code className='bg-muted block rounded-md p-2 text-xs break-all'>
              {props.item.billing_expr}
            </code>
          </div>
        </div>
      )}
    </Dialog>
  )
}

export function UpstreamPricingItemsTable(props: UpstreamPricingItemsTableProps) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)

  const filteredItems = useMemo(() => {
    const keyword = deferredSearch.trim().toLowerCase()
    if (!keyword) return props.items
    return props.items.filter((item) =>
      [
        item.model_name,
        item.model_id,
        item.provider_name,
        item.provider_id,
        item.source_name,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(keyword))
    )
  }, [deferredSearch, props.items])

  const columns = useMemo<ColumnDef<UpstreamPricingItem>[]>(() => {
    const selectedCount = filteredItems.filter(
      (item) => Object.keys(props.resolutions[item.key] || {}).length > 0
    ).length
    const allSelected =
      filteredItems.length > 0 && selectedCount === filteredItems.length

    return [
      {
        id: 'select',
        header: () => (
          <Checkbox
            checked={allSelected}
            indeterminate={selectedCount > 0 && !allSelected}
            disabled={props.isDisabled || filteredItems.length === 0}
            onCheckedChange={(checked) => {
              if (checked) props.onBulkSelect(filteredItems)
              else props.onBulkUnselect(filteredItems)
            }}
            aria-label={t('Select all (filtered)')}
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={Object.keys(props.resolutions[row.original.key] || {}).length > 0}
            disabled={props.isDisabled}
            onCheckedChange={(checked) => {
              if (checked) props.onSelectItem(row.original)
              else props.onUnselectItem(row.original.key)
            }}
          />
        ),
        size: 48,
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
        cell: ({ row }) => row.original.provider_name || row.original.source_name,
      },
      {
        accessorKey: 'input_price',
        header: t('Input price'),
        cell: ({ row }) => <span className='font-mono'>{formatPrice(row.original.input_price)}/M</span>,
      },
      {
        accessorKey: 'output_price',
        header: t('Output price'),
        cell: ({ row }) => <span className='font-mono'>{formatPrice(row.original.output_price)}/M</span>,
      },
      {
        accessorKey: 'context',
        header: t('Context'),
        cell: ({ row }) => <span className='font-mono'>{formatContext(row.original.context)}</span>,
      },
      {
        id: 'details',
        header: '',
        cell: ({ row }) => <ModelDetailsDialog item={row.original} />,
      },
    ]
  }, [filteredItems, props, t])

  const { table } = useDataTable({
    data: filteredItems,
    columns,
    getRowId: (item) => item.key,
    initialPagination: { pageIndex: 0, pageSize: 20 },
    withFilteredRowModel: false,
    withSortedRowModel: false,
    withFacetedRowModel: false,
  })

  if (props.items.length === 0) {
    return (
      <div className='flex h-64 flex-col items-center justify-center gap-3 rounded-md border'>
        {props.isSyncing && <Loader2 className='text-muted-foreground h-8 w-8 animate-spin' />}
        <p className='text-muted-foreground text-sm'>
          {props.isSyncing
            ? t('Fetching upstream prices...')
            : t('Select sync channels to compare prices')}
        </p>
      </div>
    )
  }

  return (
    <div className='flex h-full min-h-[520px] flex-col gap-4'>
      <div className='relative shrink-0'>
        <Search className='text-muted-foreground absolute top-1/2 left-2 h-4 w-4 -translate-y-1/2' />
        <Input
          placeholder={t('Search model name...')}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          disabled={props.isDisabled}
          className='ps-8'
        />
      </div>
      <DataTableView
        table={table}
        containerClassName='min-h-0 flex-1 rounded-md'
        tableContainerClassName='h-full min-h-0 overflow-x-auto'
        getColumnClassName={() => 'align-middle whitespace-nowrap'}
        getRowClassName={() => 'align-middle'}
        emptyContent={t('No results found')}
        emptyCellClassName='h-24 text-center'
      />
      <div className='shrink-0'>
        <DataTablePagination table={table} />
      </div>
    </div>
  )
}
