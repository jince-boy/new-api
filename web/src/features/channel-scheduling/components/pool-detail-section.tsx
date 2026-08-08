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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import { formatSchedulingDuration } from '../lib/chart-data'
import {
  countSchedulingPoolRequests,
  type SchedulingPool,
} from '../lib/scheduling-analytics'

interface PoolDetailSectionProps {
  pool: SchedulingPool
}

export function PoolDetailSection(props: PoolDetailSectionProps) {
  const { t } = useTranslation()
  const recentRequests = countSchedulingPoolRequests(props.pool.channels)
  const totalEffectiveWeight = props.pool.channels.reduce(
    (total, channel) => total + Math.max(0, channel.effective_weight),
    0
  )

  return (
    <section className='overflow-hidden rounded-lg border'>
      <header className='bg-muted/40 flex flex-col gap-2 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between'>
        <h3 className='truncate font-semibold'>{props.pool.model}</h3>
        <div className='flex flex-wrap gap-2'>
          <Badge variant='outline'>
            {t('Static priority {{priority}}', {
              priority: props.pool.priority,
            })}
          </Badge>
          <Badge variant='secondary'>
            {t('{{count}} channels', { count: props.pool.channels.length })}
          </Badge>
          <Badge variant='secondary'>
            {t('{{count}} recent requests', { count: recentRequests })}
          </Badge>
        </div>
      </header>

      <div className='overflow-x-auto'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('Channel')}</TableHead>
              <TableHead>{t('First-token time')}</TableHead>
              <TableHead>{t('Scheduling weight')}</TableHead>
              <TableHead>{t('Traffic allocation')}</TableHead>
              <TableHead>{t('Current load')}</TableHead>
              <TableHead>{t('Scheduler state')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {props.pool.channels.map((channel) => {
              const channelWindowRequests = channel.series.reduce(
                (total, point) => total + point.request_count,
                0
              )
              const targetShare =
                totalEffectiveWeight > 0
                  ? (Math.max(0, channel.effective_weight) /
                      totalEffectiveWeight) *
                    100
                  : 0

              return (
                <TableRow key={channel.channel_id}>
                  <TableCell className='min-w-48'>
                    <div className='flex flex-col gap-0.5'>
                      <span className='font-medium'>
                        {channel.channel_name}
                      </span>
                      <span className='text-muted-foreground text-xs tabular-nums'>
                        #{channel.channel_id}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className='min-w-52'>
                    <div className='flex flex-col gap-1'>
                      <span className='text-base font-semibold tabular-nums'>
                        {formatSchedulingDuration(channel.estimated_ttft_ms)}
                      </span>
                      <span className='text-muted-foreground text-xs'>
                        {t('Latest sample')}:{' '}
                        {formatSchedulingDuration(channel.last_ttft_ms)}
                        {' · '}
                        {t('Samples')}: {channel.samples}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className='min-w-48'>
                    <div className='flex flex-col gap-1'>
                      <span className='text-base font-semibold tabular-nums'>
                        {channel.effective_weight.toFixed(2)}
                      </span>
                      <span className='text-muted-foreground text-xs tabular-nums'>
                        {t('Base')}: {channel.base_weight}
                        {' · '}
                        {t('Factor')}: {channel.performance_factor.toFixed(3)}x
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className='min-w-52'>
                    <div className='flex flex-col gap-1 text-sm tabular-nums'>
                      <span>
                        <span className='text-muted-foreground'>
                          {t('Target')}:
                        </span>{' '}
                        <span className='font-medium'>
                          {targetShare.toFixed(1)}%
                        </span>
                      </span>
                      <span>
                        <span className='text-muted-foreground'>
                          {t('Actual')}:
                        </span>{' '}
                        <span className='font-medium'>
                          {(channel.actual_share * 100).toFixed(1)}%
                        </span>
                      </span>
                      <span className='text-muted-foreground text-xs'>
                        {t('Requests in chart window')}:{' '}
                        {channelWindowRequests.toLocaleString()}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className='min-w-28'>
                    <span className='text-base font-semibold tabular-nums'>
                      {channel.inflight}
                    </span>
                  </TableCell>
                  <TableCell className='min-w-36'>
                    <Badge
                      variant={
                        channel.state === 'degraded'
                          ? 'destructive'
                          : 'secondary'
                      }
                    >
                      {channel.state === 'degraded'
                        ? t('Latency reduced')
                        : t('Normal rotation')}
                    </Badge>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </section>
  )
}
