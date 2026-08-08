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
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from 'recharts'

import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltipContent,
} from '@/components/ui/chart'

import {
  formatSchedulingDuration,
  formatSchedulingTime,
  type SchedulingChartData,
} from '../lib/chart-data'
import type { SchedulingPool } from '../lib/scheduling-analytics'

interface FirstTokenLatencyChartProps {
  pool: SchedulingPool
  data: SchedulingChartData
}

export function FirstTokenLatencyChart(props: FirstTokenLatencyChartProps) {
  const { t } = useTranslation()
  const chartConfig = useMemo<ChartConfig>(() => {
    const config: ChartConfig = {}
    for (const series of props.data.series) {
      config[series.ttftKey] = { label: series.label, color: series.color }
    }
    return config
  }, [props.data.series])
  const channelSummaries = useMemo(
    () =>
      props.pool.channels.map((channel, index) => ({
        channel,
        series: props.data.series[index],
      })),
    [props.data.series, props.pool.channels]
  )

  return (
    <Card className='xl:col-span-2'>
      <CardHeader>
        <CardTitle>{t('First-token latency by channel')}</CardTitle>
        <CardDescription>
          {t(
            'Each line is one channel. Lower and steadier values mean faster, more predictable first-token delivery.'
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-5'>
        <div className='grid gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5'>
          {channelSummaries.map(({ channel, series }) => (
            <div
              key={channel.channel_id}
              className='flex min-w-0 flex-col gap-2 rounded-md border p-3'
            >
              <div className='flex min-w-0 items-center gap-2'>
                <span
                  className='size-2.5 shrink-0 rounded-full'
                  style={{ backgroundColor: series.color }}
                  aria-hidden='true'
                />
                <span className='truncate text-sm font-medium'>
                  {channel.channel_name} #{channel.channel_id}
                </span>
              </div>
              <div className='text-xl font-semibold tabular-nums'>
                {formatSchedulingDuration(channel.estimated_ttft_ms)}
              </div>
              <div className='text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs'>
                <span>
                  {t('Latest sample')}:{' '}
                  {formatSchedulingDuration(channel.last_ttft_ms)}
                </span>
                <span>
                  {t('Samples')}: {channel.samples}
                </span>
              </div>
              <Badge
                variant={
                  channel.state === 'degraded' ? 'destructive' : 'secondary'
                }
                className='self-start'
              >
                {channel.state === 'degraded'
                  ? t('Latency reduced')
                  : t('Normal rotation')}
              </Badge>
            </div>
          ))}
        </div>

        <ChartContainer config={chartConfig} className='h-96 w-full'>
          <LineChart
            accessibilityLayer
            data={props.data.timeline}
            margin={{ top: 10, right: 16, left: 8, bottom: 4 }}
          >
            <CartesianGrid vertical={false} strokeDasharray='3 3' />
            <XAxis
              dataKey='timestamp'
              type='number'
              scale='time'
              domain={['dataMin', 'dataMax']}
              tickFormatter={formatSchedulingTime}
              minTickGap={32}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              domain={[0, 'auto']}
              width={64}
              tickFormatter={(value: number) =>
                value === 0 ? '0 ms' : formatSchedulingDuration(value)
              }
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              content={
                <ChartTooltipContent
                  indicator='line'
                  labelFormatter={(value) =>
                    formatSchedulingTime(Number(value))
                  }
                  formatter={(value, name, item) => (
                    <>
                      <span
                        className='size-2 shrink-0 rounded-full'
                        style={{ backgroundColor: item.color }}
                        aria-hidden='true'
                      />
                      <div className='flex min-w-52 flex-1 items-center justify-between gap-4'>
                        <span className='text-muted-foreground truncate'>
                          {chartConfig[String(name)]?.label ?? String(name)}
                        </span>
                        <span className='font-mono font-medium tabular-nums'>
                          {formatSchedulingDuration(Number(value))}
                        </span>
                      </div>
                    </>
                  )}
                />
              }
            />
            {props.data.series.map((series) => (
              <Line
                key={series.ttftKey}
                dataKey={series.ttftKey}
                type='linear'
                stroke={`var(--color-${series.ttftKey})`}
                strokeWidth={2.5}
                dot={{ r: 2, strokeWidth: 0 }}
                activeDot={{ r: 5, strokeWidth: 2 }}
                connectNulls
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
