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
import { Layers3 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'

import type { SchedulingPool } from '../lib/scheduling-analytics'
import type { SchedulingStrategy } from '../types'

interface SchedulingScopeSelectorProps {
  groups: string[]
  selectedGroup: string
  onGroupChange: (group: string) => void
  pools: SchedulingPool[]
  selectedPoolKey: string
  onPoolChange: (poolKey: string) => void
  strategy: SchedulingStrategy | null
  showPool: boolean
}

export function SchedulingScopeSelector(props: SchedulingScopeSelectorProps) {
  const { t } = useTranslation()

  return (
    <section className='grid gap-4 rounded-lg border p-4 lg:grid-cols-[minmax(14rem,0.7fr)_minmax(18rem,1fr)_auto] lg:items-end'>
      <Field>
        <FieldLabel htmlFor='scheduling-analysis-group'>
          {t('Analysis group')}
        </FieldLabel>
        <NativeSelect
          id='scheduling-analysis-group'
          className='w-full'
          value={props.selectedGroup}
          disabled={props.groups.length === 0}
          onChange={(event) => props.onGroupChange(event.target.value)}
        >
          {props.groups.length === 0 && (
            <NativeSelectOption value=''>
              {t('No service groups available')}
            </NativeSelectOption>
          )}
          {props.groups.map((group) => (
            <NativeSelectOption key={group} value={group}>
              {group}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <FieldDescription>
          {t('Overview and pool details are isolated to this service group.')}
        </FieldDescription>
      </Field>

      {props.showPool ? (
        <Field>
          <FieldLabel htmlFor='scheduling-analysis-pool'>
            {t('Analysis pool')}
          </FieldLabel>
          <NativeSelect
            id='scheduling-analysis-pool'
            className='w-full'
            value={props.selectedPoolKey}
            disabled={props.pools.length === 0}
            onChange={(event) => props.onPoolChange(event.target.value)}
          >
            {props.pools.length === 0 && (
              <NativeSelectOption value=''>
                {t('No active scheduling pools')}
              </NativeSelectOption>
            )}
            {props.pools.map((pool) => (
              <NativeSelectOption key={pool.key} value={pool.key}>
                {t(
                  '{{model}} · static priority {{priority}} · {{count}} channels',
                  {
                    model: pool.model,
                    priority: pool.priority,
                    count: pool.channels.length,
                  }
                )}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <FieldDescription>
            {t('A pool contains channels for one model at one failover level.')}
          </FieldDescription>
        </Field>
      ) : (
        <div className='text-muted-foreground flex min-h-16 items-center gap-2 text-sm'>
          <Layers3 className='size-4' aria-hidden='true' />
          {t('Pools below are separated by model and static priority.')}
        </div>
      )}

      <div className='flex min-h-8 items-center lg:justify-end'>
        {props.strategy && (
          <Badge
            variant={props.strategy === 'intelligent' ? 'default' : 'secondary'}
          >
            {props.strategy === 'intelligent'
              ? t('Intelligent round robin')
              : t('Legacy priority and weight')}
          </Badge>
        )}
      </div>
    </section>
  )
}
