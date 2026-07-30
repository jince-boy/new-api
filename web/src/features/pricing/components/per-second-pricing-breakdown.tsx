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
import { Tags } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { StaticDataTable } from '@/components/data-table'
import { Badge } from '@/components/ui/badge'

import { formatFixedUnitPrice } from '../lib/price'
import type {
  PerSecondPricingOperator,
  PerSecondPricingRule,
  PricingModel,
} from '../types'

const OPERATOR_LABELS: Record<PerSecondPricingOperator, string> = {
  eq: 'Equals',
  not_eq: 'Does not equal',
  contains: 'Contains',
  not_contains: 'Does not contain',
  exists: 'Exists',
  not_exists: 'Does not exist',
  gt: 'Greater than',
  gte: 'Greater than or equal to',
  lt: 'Less than',
  lte: 'Less than or equal to',
}

type PerSecondPricingRow = {
  key: string
  name: string
  price: number
  conditions: PerSecondPricingRule['conditions']
  isDefault: boolean
}

type PerSecondPricingTableProps = {
  model: PricingModel
  groupRatio?: number
  priceRate: number
  usdExchangeRate: number
  showRechargePrice?: boolean
  showHeader?: boolean
}

function ConditionList(props: {
  conditions: PerSecondPricingRule['conditions']
  isDefault: boolean
}) {
  const { t } = useTranslation()
  if (props.isDefault) {
    return (
      <span className='text-muted-foreground'>{t('All other requests')}</span>
    )
  }
  const occurrences = new Map<string, number>()
  const entries = props.conditions.map((condition) => {
    const baseKey = `${condition.path}-${condition.operator}-${condition.value || ''}`
    const occurrence = (occurrences.get(baseKey) || 0) + 1
    occurrences.set(baseKey, occurrence)
    return { condition, key: `${baseKey}-${occurrence}` }
  })

  return (
    <div className='flex flex-wrap gap-1.5'>
      {entries.map(({ condition, key }) => (
        <span
          key={key}
          className='bg-muted/50 inline-flex max-w-full flex-wrap items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs'
        >
          <code className='text-foreground break-all'>{condition.path}</code>
          <span className='text-muted-foreground'>
            {t(OPERATOR_LABELS[condition.operator])}
          </span>
          {condition.operator !== 'exists' &&
          condition.operator !== 'not_exists' ? (
            <code className='text-foreground break-all'>{condition.value}</code>
          ) : null}
        </span>
      ))}
    </div>
  )
}

export function PerSecondPricingTable(props: PerSecondPricingTableProps) {
  const { t } = useTranslation()
  const rules = props.model.per_second_rules || []
  const rows: PerSecondPricingRow[] = [
    ...rules.map((rule, index) => ({
      key: `rule-${index}`,
      name: rule.name || t('Rule {{number}}', { number: index + 1 }),
      price: rule.price,
      conditions: rule.conditions,
      isDefault: false,
    })),
    {
      key: 'default',
      name: t('Default'),
      price: props.model.model_price || 0,
      conditions: [],
      isDefault: true,
    },
  ]
  const formatPrice = (price: number) =>
    formatFixedUnitPrice(
      price,
      props.groupRatio ?? 1,
      props.showRechargePrice ?? false,
      props.priceRate,
      props.usdExchangeRate
    )

  return (
    <div className='min-w-0'>
      {props.showHeader !== false ? (
        <div className='mb-3 flex items-start gap-2'>
          <span className='mt-0.5 inline-flex size-6 items-center justify-center rounded-lg bg-amber-100 text-amber-700 shadow-sm dark:bg-amber-500/20 dark:text-amber-300'>
            <Tags className='size-3.5' aria-hidden='true' />
          </span>
          <div>
            <div className='text-foreground text-base font-medium'>
              {t('Conditional price rules')}
            </div>
            <div className='text-muted-foreground text-xs'>
              {t(
                'Rules are checked from top to bottom. The first matching rule sets the final price per second; otherwise the default price above is used.'
              )}
            </div>
          </div>
        </div>
      ) : null}

      <div className='space-y-2 sm:hidden'>
        {rows.map((row) => (
          <div key={row.key} className='rounded-lg border p-3'>
            <div className='mb-2 flex items-center justify-between gap-3'>
              <Badge variant={row.isDefault ? 'outline' : 'secondary'}>
                {row.name}
              </Badge>
              <span className='font-mono text-sm font-semibold tabular-nums'>
                {formatPrice(row.price)}
                <span className='text-muted-foreground ml-1 text-[10px] font-normal'>
                  / {t('second')}
                </span>
              </span>
            </div>
            <ConditionList
              conditions={row.conditions}
              isDefault={row.isDefault}
            />
          </div>
        ))}
      </div>

      <StaticDataTable
        className='hidden overflow-hidden rounded-lg sm:block'
        tableClassName='text-sm'
        headerRowClassName='hover:bg-transparent'
        data={rows}
        getRowKey={(row) => row.key}
        columns={[
          {
            id: 'tier',
            header: t('Tier'),
            className:
              'text-muted-foreground text-[10px] font-medium tracking-wider uppercase',
            cellClassName: 'py-2.5 align-top',
            cell: (row) => (
              <Badge variant={row.isDefault ? 'outline' : 'secondary'}>
                {row.name}
              </Badge>
            ),
          },
          {
            id: 'conditions',
            header: t('Conditions (AND)'),
            className:
              'text-muted-foreground text-[10px] font-medium tracking-wider uppercase',
            cellClassName: 'py-2.5 align-top',
            cell: (row) => (
              <ConditionList
                conditions={row.conditions}
                isDefault={row.isDefault}
              />
            ),
          },
          {
            id: 'price',
            header: t('Price per second'),
            className:
              'text-muted-foreground text-right text-[10px] font-medium tracking-wider uppercase',
            cellClassName:
              'py-2.5 text-right align-top font-mono font-semibold tabular-nums',
            cell: (row) => (
              <span>
                {formatPrice(row.price)}
                <span className='text-muted-foreground ml-1 text-[10px] font-normal'>
                  / {t('second')}
                </span>
              </span>
            ),
          },
        ]}
      />
    </div>
  )
}

export function PerSecondPricingBreakdown(
  props: Omit<PerSecondPricingTableProps, 'showHeader'>
) {
  if (!props.model.per_second_rules?.length) return null
  return <PerSecondPricingTable {...props} />
}
