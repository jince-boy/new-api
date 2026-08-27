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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

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
        <Select
          items={props.groups.map((group) => ({ value: group, label: group }))}
          value={props.selectedGroup || null}
          disabled={props.groups.length === 0}
          onValueChange={(value) => props.onGroupChange(value ?? '')}
        >
          <SelectTrigger id='scheduling-analysis-group' className='w-full'>
            <SelectValue placeholder={t('No service groups available')} />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            <SelectGroup>
              {props.groups.length === 0 ? (
                <SelectItem value='__empty__' disabled>
                  {t('No service groups available')}
                </SelectItem>
              ) : (
                props.groups.map((group) => (
                  <SelectItem key={group} value={group}>
                    {group}
                  </SelectItem>
                ))
              )}
            </SelectGroup>
          </SelectContent>
        </Select>
        <FieldDescription>
          {t('Overview and pool details are isolated to this service group.')}
        </FieldDescription>
      </Field>

      {props.showPool ? (
        <Field>
          <FieldLabel htmlFor='scheduling-analysis-pool'>
            {t('Analysis pool')}
          </FieldLabel>
          <Select
            items={props.pools.map((pool) => ({
              value: pool.key,
              label: t(
                '{{model}} · static priority {{priority}} · {{count}} channels',
                {
                  model: pool.model,
                  priority: pool.priority,
                  count: pool.channels.length,
                }
              ),
            }))}
            value={props.selectedPoolKey || null}
            disabled={props.pools.length === 0}
            onValueChange={(value) => props.onPoolChange(value ?? '')}
          >
            <SelectTrigger id='scheduling-analysis-pool' className='w-full'>
              <SelectValue placeholder={t('No active scheduling pools')} />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              <SelectGroup>
                {props.pools.length === 0 ? (
                  <SelectItem value='__empty__' disabled>
                    {t('No active scheduling pools')}
                  </SelectItem>
                ) : (
                  props.pools.map((pool) => (
                    <SelectItem key={pool.key} value={pool.key}>
                      {t(
                        '{{model}} · static priority {{priority}} · {{count}} channels',
                        {
                          model: pool.model,
                          priority: pool.priority,
                          count: pool.channels.length,
                        }
                      )}
                    </SelectItem>
                  ))
                )}
              </SelectGroup>
            </SelectContent>
          </Select>
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
