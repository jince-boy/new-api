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

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty'

import type { SchedulingPool } from '../lib/scheduling-analytics'
import type { ChannelFault, ChannelModelFault } from '../types'
import { ManualRecoveryPanel } from './manual-recovery-panel'
import { PoolDetailSection } from './pool-detail-section'

interface PoolTableProps {
  group: string
  pools: SchedulingPool[]
  faults: ChannelModelFault[]
  channelFaults: ChannelFault[]
}

export function PoolTable(props: PoolTableProps) {
  const { t } = useTranslation()

  return (
    <div className='flex flex-col gap-4'>
      <Card>
        <CardHeader>
          <CardTitle>
            {t('Scheduling pools for {{group}}', { group: props.group || '-' })}
          </CardTitle>
        </CardHeader>
        <CardContent className='flex flex-col gap-4'>
          {props.pools.map((pool) => (
            <PoolDetailSection key={pool.key} pool={pool} />
          ))}
          {props.pools.length === 0 && (
            <Empty className='py-10'>
              <EmptyHeader>
                <EmptyTitle>{t('No pools for this group')}</EmptyTitle>
                <EmptyDescription>
                  {t(
                    'A pool appears after intelligent scheduling handles a request for this group.'
                  )}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>
      <ManualRecoveryPanel
        faults={props.faults}
        channelFaults={props.channelFaults}
      />
    </div>
  )
}
