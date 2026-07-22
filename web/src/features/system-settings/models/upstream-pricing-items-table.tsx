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
import { ArrowUpRight, Loader2, RefreshCcw, Search } from 'lucide-react'
import { useDeferredValue, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  DataTablePagination,
  DataTableView,
  useDataTable,
} from '@/components/data-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'

import type { UpstreamPricingItem } from '../types'
import { UpstreamPricingItemDetails } from './upstream-pricing-item-details'
import { CapabilityList, ProviderMark } from './upstream-pricing-display'
import {
  formatContext,
  formatPrice,
  getProviderIdentity,
  type ProviderOption,
} from './upstream-pricing-utils'
import { UpstreamProviderFilter } from './upstream-provider-filter'
import type { ResolutionsMap } from './upstream-ratio-sync-helpers'

type UpstreamPricingItemsTableProps = {
  items: UpstreamPricingItem[]
  resolutions: ResolutionsMap
  isDisabled: boolean
  isSyncing: boolean
  lastFetchedAt: number | null
  onRefresh: () => void
  onSelectItem: (item: UpstreamPricingItem) => void
  onUnselectItem: (itemKey: string) => void
  onBulkSelect: (items: UpstreamPricingItem[]) => void
  onBulkUnselect: (items: UpstreamPricingItem[]) => void
}

export function UpstreamPricingItemsTable(props: UpstreamPricingItemsTableProps) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [selectedProviders, setSelectedProviders] = useState<string[]>([])
  const deferredSearch = useDeferredValue(search)

  const providerOptions = useMemo(() => {
    const providers = new Map<string, ProviderOption>()
    for (const item of props.items) {
      const provider = getProviderIdentity(item)
      const current = providers.get(provider.id)
      providers.set(provider.id, {
        ...provider,
        count: (current?.count || 0) + 1,
      })
    }
    return [...providers.values()].sort((a, b) =>
      a.name.localeCompare(b.name)
    )
  }, [props.items])

  const filteredItems = useMemo(() => {
    const keyword = deferredSearch.trim().toLowerCase()
    const providerSet = new Set(selectedProviders)
    return props.items.filter((item) => {
      const provider = getProviderIdentity(item)
      if (providerSet.size > 0 && !providerSet.has(provider.id)) return false
      if (!keyword) return true
      return [
        item.model_name,
        item.model_id,
        provider.name,
        provider.id,
      ].some((value) => value?.toLowerCase().includes(keyword))
    })
  }, [deferredSearch, props.items, selectedProviders])

  const columns = useMemo<ColumnDef<UpstreamPricingItem>[]>(() => {
    const selectableItems = filteredItems.filter(
      (item) => Object.keys(item.sync_values).length > 0
    )
    const selectedCount = selectableItems.filter(
      (item) => Object.keys(props.resolutions[item.key] || {}).length > 0
    ).length
    const allSelected =
      selectableItems.length > 0 && selectedCount === selectableItems.length

    return [
      {
        id: 'select',
        header: () => (
          <Checkbox
            checked={allSelected}
            indeterminate={selectedCount > 0 && !allSelected}
            disabled={props.isDisabled || selectableItems.length === 0}
            onCheckedChange={(checked) => {
              if (checked) props.onBulkSelect(selectableItems)
              else props.onBulkUnselect(selectableItems)
            }}
            aria-label={t('Select all (filtered)')}
          />
        ),
        cell: ({ row }) => {
          const canSync = Object.keys(row.original.sync_values).length > 0
          return (
            <Checkbox
              checked={
                Object.keys(props.resolutions[row.original.key] || {}).length > 0
              }
              disabled={props.isDisabled || !canSync}
              onCheckedChange={(checked) => {
                if (checked) props.onSelectItem(row.original)
                else props.onUnselectItem(row.original.key)
              }}
            />
          )
        },
        size: 36,
      },
      {
        accessorKey: 'model_name',
        header: t('Model'),
        cell: ({ row }) => (
          <div className='min-w-[190px] max-w-[240px] leading-tight'>
            <div className='truncate font-medium'>{row.original.model_name}</div>
            <div className='text-muted-foreground mt-0.5 truncate font-mono text-[10px]'>
              {row.original.model_id || row.original.model_name}
            </div>
          </div>
        ),
      },
      {
        accessorKey: 'provider_name',
        header: t('Provider'),
        cell: ({ row }) => {
          const provider = getProviderIdentity(row.original)
          return (
            <ProviderMark
              iconKey={provider.iconKey}
              name={provider.name}
              providerId={row.original.provider_id}
            />
          )
        },
      },
      {
        accessorKey: 'input_price',
        header: t('Input price'),
        cell: ({ row }) => (
          <span className='flex items-center gap-1 font-mono'>
            {formatPrice(row.original.input_price)}
            {(row.original.tiers?.length || 0) > 1 && (
              <ArrowUpRight className='size-3 text-blue-600' aria-label={t('Tier')} />
            )}
          </span>
        ),
      },
      {
        accessorKey: 'output_price',
        header: t('Output price'),
        cell: ({ row }) => (
          <span className='flex items-center gap-1 font-mono'>
            {formatPrice(row.original.output_price)}
            {(row.original.tiers?.length || 0) > 1 && (
              <ArrowUpRight className='size-3 text-blue-600' aria-label={t('Tier')} />
            )}
          </span>
        ),
      },
      {
        accessorKey: 'cache_read_price',
        header: t('Cache Read'),
        cell: ({ row }) => (
          <span className='font-mono'>
            {formatPrice(row.original.cache_read_price)}
            {(row.original.tiers?.length || 0) > 1 && (
              <ArrowUpRight className='ml-1 inline size-3 text-blue-600' aria-label={t('Tier')} />
            )}
          </span>
        ),
      },
      {
        accessorKey: 'cache_write_price',
        header: t('Cache Write'),
        cell: ({ row }) => (
          <span className='font-mono'>
            {formatPrice(row.original.cache_write_price)}
            {(row.original.tiers?.length || 0) > 1 && (
              <ArrowUpRight className='ml-1 inline size-3 text-blue-600' aria-label={t('Tier')} />
            )}
          </span>
        ),
      },
      {
        accessorKey: 'context',
        header: t('Context'),
        cell: ({ row }) => (
          <span className='font-mono'>{formatContext(row.original.context)}</span>
        ),
      },
      {
        accessorKey: 'capabilities',
        header: t('Capabilities'),
        cell: ({ row }) => (
          <CapabilityList capabilities={row.original.capabilities || []} />
        ),
      },
      {
        accessorKey: 'last_updated',
        header: t('Updated'),
        cell: ({ row }) => (
          <span className='font-mono'>{row.original.last_updated || '-'}</span>
        ),
      },
      {
        id: 'details',
        header: '',
        cell: ({ row }) => <UpstreamPricingItemDetails item={row.original} />,
      },
    ]
  }, [filteredItems, props, t])

  const { table } = useDataTable({
    data: filteredItems,
    columns,
    getRowId: (item) => item.key,
    initialPagination: { pageIndex: 0, pageSize: 50 },
    withFilteredRowModel: false,
    withSortedRowModel: false,
    withFacetedRowModel: false,
  })

  if (props.items.length === 0) {
    return (
      <div className='flex h-64 flex-col items-center justify-center gap-3 rounded-md border text-[12px]'>
        {props.isSyncing && (
          <Loader2 className='text-muted-foreground size-7 animate-spin' />
        )}
        <p className='text-muted-foreground'>
          {props.isSyncing ? t('Fetching upstream prices...') : 'models.dev'}
        </p>
        {!props.isSyncing && (
          <Button type='button' size='sm' onClick={props.onRefresh}>
            <RefreshCcw data-icon='inline-start' />
            {t('Refresh')}
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className='flex h-full min-h-[520px] flex-col gap-2 text-[12px]'>
      <div className='flex shrink-0 flex-col gap-2 lg:flex-row lg:items-center'>
        <div className='relative min-w-0 flex-1'>
          <Search className='text-muted-foreground absolute top-1/2 left-2 size-3.5 -translate-y-1/2' />
          <Input
            placeholder={t(
              'Search model name, provider, endpoint, or tag...'
            )}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              table.setPageIndex(0)
            }}
            disabled={props.isDisabled}
            className='h-8 ps-7 text-[12px]'
          />
        </div>
        <UpstreamProviderFilter
          options={providerOptions}
          selected={selectedProviders}
          disabled={props.isDisabled}
          onChange={(providers) => {
            setSelectedProviders(providers)
            table.setPageIndex(0)
          }}
        />
        <div className='text-muted-foreground flex shrink-0 items-center gap-2 whitespace-nowrap'>
          <Badge
            variant='outline'
            className='h-7 rounded-sm px-2 text-[11px] font-normal'
          >
            {t('Total:')} {filteredItems.length.toLocaleString()}
          </Badge>
          {props.lastFetchedAt && (
            <Badge
              variant='outline'
              className='h-7 rounded-sm px-2 text-[11px] font-normal'
            >
              {t('Last updated:')}{' '}
              {new Date(props.lastFetchedAt).toLocaleString()}
            </Badge>
          )}
          <Button
            type='button'
            variant='outline'
            size='sm'
            className='h-8 text-[12px]'
            onClick={props.onRefresh}
            disabled={props.isDisabled}
          >
            <RefreshCcw
              data-icon='inline-start'
              className={props.isSyncing ? 'animate-spin' : undefined}
            />
            {t('Refresh')}
          </Button>
        </div>
      </div>

      <DataTableView
        table={table}
        containerClassName='min-h-0 flex-1 rounded-md'
        tableContainerClassName='h-full min-h-0 overflow-auto'
        tableClassName='min-w-[1480px] text-[12px] [&_td]:text-[12px] [&_td_*]:text-[12px] [&_th]:text-[12px] [&_th_*]:text-[12px]'
        tableHeaderRowClassName='h-8 bg-muted/30'
        tableBodyClassName='[&>tr]:h-12'
        getColumnClassName={(columnId) =>
          columnId === 'capabilities'
            ? 'align-middle whitespace-normal px-2 py-1.5'
            : 'align-middle whitespace-nowrap px-2 py-1.5'
        }
        getRowClassName={(row) =>
          Object.keys(row.original.sync_values).length > 0
            ? 'align-middle'
            : 'align-middle opacity-60'
        }
        emptyContent={t('No results found')}
        emptyCellClassName='h-24 text-center text-[12px]'
      />
      <div className='shrink-0 [&_*]:text-[12px]'>
        <DataTablePagination table={table} />
      </div>
    </div>
  )
}
