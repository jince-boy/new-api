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
import {
  Activity,
  Boxes,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Gauge,
  Radio,
  Route,
  Timer,
  TrendingDown,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

import type {
  SchedulingPool,
  SchedulingGroupMetrics,
} from '../lib/scheduling-analytics'

interface OverviewCardsProps {
  group: string
  pool: SchedulingPool
  metrics: SchedulingGroupMetrics
}

export function OverviewCards(props: OverviewCardsProps) {
  const { t } = useTranslation()
  const cards = [
    {
      label: t('Active scheduling pools'),
      description: t('Independent model and priority pools in this group.'),
      value: props.metrics.poolCount.toLocaleString(),
      icon: Boxes,
    },
    {
      label: t('Capabilities in rotation'),
      description: t(
        'Channel and model capabilities currently participating in this group.'
      ),
      value: props.metrics.capabilityCount.toLocaleString(),
      icon: Route,
    },
    {
      label: t('Requests in chart window'),
      description: t('Requests retained for every pool in this group.'),
      value: props.metrics.requests.toLocaleString(),
      icon: Activity,
    },
    {
      label: t('Current RPS'),
      description: t('Requests assigned during the latest 10 seconds.'),
      value: props.metrics.rps.toLocaleString(undefined, {
        maximumFractionDigits: 2,
      }),
      icon: Gauge,
    },
    {
      label: t('Average rolling TTFT'),
      description: t(
        'Sample-weighted average of the current channel TTFT estimates.'
      ),
      value:
        props.metrics.averageTtftMs === null
          ? '-'
          : `${props.metrics.averageTtftMs.toLocaleString()} ms`,
      icon: Timer,
    },
    {
      label: t('Median rolling TTFT'),
      description: t(
        'Median of the current rolling TTFT estimate for each channel.'
      ),
      value:
        props.metrics.medianTtftMs === null
          ? '-'
          : `${props.metrics.medianTtftMs.toLocaleString()} ms`,
      icon: Clock3,
    },
    {
      label: t('In-flight now'),
      description: t('Requests currently assigned across this group.'),
      value: props.metrics.inflight.toLocaleString(),
      icon: Radio,
    },
    {
      label: t('Upstream success rate'),
      description: t('Successful completions in the real-time chart window.'),
      value:
        props.metrics.successRate === null
          ? '-'
          : `${(props.metrics.successRate * 100).toFixed(1)}%`,
      icon: CheckCircle2,
    },
    {
      label: t('Errors in chart window'),
      description: t('Failed upstream attempts retained for this group.'),
      value: props.metrics.errors.toLocaleString(),
      icon: CircleAlert,
    },
    {
      label: t('Latency-reduced capabilities'),
      description: t(
        'Capabilities currently receiving less traffic because of latency.'
      ),
      value: props.metrics.degradedCount.toLocaleString(),
      icon: TrendingDown,
    },
  ]

  return (
    <div className='flex flex-col gap-3'>
      <div className='flex flex-col gap-1'>
        <h2 className='text-base font-semibold'>
          {t('Group-wide live metrics')}
        </h2>
        <p className='text-muted-foreground text-sm'>
          {t(
            'Cards cover every active pool in {{group}}. Charts below show only {{model}} at static priority {{priority}}.',
            {
              group: props.group || '-',
              model: props.pool.model,
              priority: props.pool.priority,
            }
          )}
        </p>
      </div>

      <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5'>
        {cards.map((card) => (
          <Card key={card.label} className='min-h-32'>
            <CardHeader className='grid grid-cols-[1fr_auto] gap-2 pb-1'>
              <CardTitle className='text-sm leading-5'>{card.label}</CardTitle>
              <card.icon
                className='text-muted-foreground size-4'
                aria-hidden='true'
              />
            </CardHeader>
            <CardContent className='flex flex-col gap-2'>
              <div className='text-2xl font-semibold tabular-nums'>
                {card.value}
              </div>
              <CardDescription className='text-xs leading-4'>
                {card.description}
              </CardDescription>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
