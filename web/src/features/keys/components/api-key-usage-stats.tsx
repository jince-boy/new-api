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
import { useTranslation } from 'react-i18next'

import { formatLogQuota } from '@/lib/format'
import { cn } from '@/lib/utils'

import type { ApiKeyUsage } from '../types'

const EMPTY_USAGE: ApiKeyUsage = {
  today: { quota: 0 },
  last_30_days: { quota: 0 },
}

type ApiKeyUsageStatsProps = {
  usage?: ApiKeyUsage
  className?: string
}

type UsagePeriodProps = {
  label: string
  quota: number
}

function UsagePeriod(props: UsagePeriodProps) {
  return (
    <div
      data-slot='api-key-usage-period'
      className='flex h-5 min-w-0 items-center justify-between gap-3 text-xs leading-none'
    >
      <span
        className='text-muted-foreground min-w-0 truncate font-medium'
        title={props.label}
      >
        {props.label}
      </span>
      <span className='shrink-0 font-semibold whitespace-nowrap tabular-nums'>
        {formatLogQuota(props.quota)}
      </span>
    </div>
  )
}

export function ApiKeyUsageStats(props: ApiKeyUsageStatsProps) {
  const { t } = useTranslation()
  const usage = props.usage ?? EMPTY_USAGE

  return (
    <div
      data-slot='api-key-usage-stats'
      className={cn(
        'bg-muted/40 flex min-w-[220px] flex-col rounded-md px-2.5 py-1',
        props.className
      )}
    >
      <UsagePeriod label={t('Today')} quota={usage.today.quota} />
      <UsagePeriod label={t('Last 30 days')} quota={usage.last_30_days.quota} />
    </div>
  )
}
