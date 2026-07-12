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

import { Badge } from '@/components/ui/badge'
import { getLobeIcon } from '@/lib/lobe-icon'

import { CAPABILITY_LABELS } from './upstream-pricing-utils'

export function ProviderMark(props: {
  iconKey: string
  name: string
  providerId?: string
}) {
  return (
    <div className='flex min-w-0 items-center gap-2'>
      <span className='flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-background'>
        {getLobeIcon(`${props.iconKey}.Color`, 16)}
      </span>
      <span className='min-w-0 leading-tight'>
        <span className='block truncate font-medium'>{props.name}</span>
        {props.providerId && props.providerId !== props.name && (
          <span className='text-muted-foreground block truncate text-[10px]'>
            {props.providerId}
          </span>
        )}
      </span>
    </div>
  )
}

export function CapabilityList(props: { capabilities: string[] }) {
  const { t } = useTranslation()
  if (props.capabilities.length === 0) return <span>-</span>
  return (
    <div className='flex min-w-[220px] flex-wrap gap-1'>
      {props.capabilities.map((capability) => (
        <Badge
          key={capability}
          variant='secondary'
          className='h-5 rounded-sm px-1.5 text-[10px] font-normal whitespace-nowrap'
        >
          {t(CAPABILITY_LABELS[capability] || capability)}
        </Badge>
      ))}
    </div>
  )
}
