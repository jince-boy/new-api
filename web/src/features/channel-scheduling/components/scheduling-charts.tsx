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
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

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
  ChartLegendContent,
  ChartTooltipContent,
} from '@/components/ui/chart'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty'

import {
  buildSchedulingChartData,
  formatSchedulingTime,
} from '../lib/chart-data'
import type { SchedulingPool } from '../lib/scheduling-analytics'
import { FirstTokenLatencyChart } from './first-token-latency-chart'
import { SchedulingTrendChart } from './scheduling-trend-chart'

interface SchedulingChartsProps {
  pool: SchedulingPool
}

export function SchedulingCharts(props: SchedulingChartsProps) {
  const { t } = useTranslation()
  const chartData = useMemo(
    () => buildSchedulingChartData(props.pool.channels),
    [props.pool.channels]
  )
  const requestConfig = useMemo<ChartConfig>(() => {
    const config: ChartConfig = {}
    for (const series of chartData.series) {
      config[series.requestKey] = { label: series.label, color: series.color }
    }
    return config
  }, [chartData.series])
  const allocationConfig = useMemo<ChartConfig>(
    () => ({
      targetShare: {
        label: t('Target share from current weight'),
        color: 'var(--chart-2)',
      },
      actualShare: {
        label: t('Actual request share'),
        color: 'var(--chart-1)',
      },
    }),
    [t]
  )

  if (chartData.timeline.length === 0) {
    return (
      <Card>
        <CardContent className='py-12'>
          <Empty>
            <EmptyHeader>
              <EmptyTitle>{t('No real-time data for this pool')}</EmptyTitle>
              <EmptyDescription>
                {t('Charts appear after this group and pool handle requests.')}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </CardContent>
      </Card>
    )
  }

  const allocationHeight = Math.max(260, chartData.allocation.length * 46)
  const weightSeries = chartData.series.map((series) => ({
    key: series.weightKey,
    label: series.label,
    color: series.color,
  }))
  const inflightSeries = chartData.series.map((series) => ({
    key: series.inflightKey,
    label: series.label,
    color: series.color,
  }))

  return (
    <div className='grid gap-4 xl:grid-cols-2'>
      <FirstTokenLatencyChart pool={props.pool} data={chartData} />

      <SchedulingTrendChart
        title={t('Effective scheduling weight over time')}
        description={t(
          'Shows the weight actually used after rolling TTFT and current load adjustments.'
        )}
        data={chartData.timeline}
        series={weightSeries}
        allowDecimals
        yAxisWidth={58}
      />

      <SchedulingTrendChart
        title={t('In-flight requests by channel')}
        description={t(
          'Shows current concurrent requests on each channel and helps identify temporary load concentration.'
        )}
        data={chartData.timeline}
        series={inflightSeries}
        allowDecimals={false}
        yAxisWidth={42}
      />

      <Card>
        <CardHeader>
          <CardTitle>{t('Requests assigned over time')}</CardTitle>
          <CardDescription>
            {t(
              'Each stacked bar shows how requests in that interval were distributed across channels.'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={requestConfig} className='h-80 w-full'>
            <BarChart
              accessibilityLayer
              data={chartData.timeline}
              margin={{ top: 8, right: 12, left: 0, bottom: 4 }}
            >
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey='timestamp'
                type='number'
                scale='time'
                domain={['dataMin', 'dataMax']}
                tickFormatter={formatSchedulingTime}
                minTickGap={28}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                allowDecimals={false}
                width={36}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(value) =>
                      formatSchedulingTime(Number(value))
                    }
                  />
                }
              />
              <Legend content={<ChartLegendContent />} />
              {chartData.series.map((series) => (
                <Bar
                  key={series.requestKey}
                  dataKey={series.requestKey}
                  stackId='requests'
                  fill={`var(--color-${series.requestKey})`}
                  maxBarSize={36}
                  isAnimationActive={false}
                />
              ))}
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('Current allocation balance')}</CardTitle>
          <CardDescription>
            {t(
              'Target share comes from the current scheduling weight. Actual share is measured from requests in the chart window.'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer
            config={allocationConfig}
            className='w-full'
            style={{ height: allocationHeight }}
          >
            <BarChart
              accessibilityLayer
              data={chartData.allocation}
              layout='vertical'
              margin={{ top: 8, right: 16, left: 8, bottom: 4 }}
            >
              <CartesianGrid horizontal={false} />
              <XAxis
                type='number'
                domain={[0, 100]}
                tickFormatter={(value: number) => `${value}%`}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                dataKey='channel'
                type='category'
                width={150}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip content={<ChartTooltipContent />} />
              <Legend content={<ChartLegendContent />} />
              <Bar
                dataKey='targetShare'
                fill='var(--color-targetShare)'
                radius={[0, 4, 4, 0]}
                isAnimationActive={false}
              />
              <Bar
                dataKey='actualShare'
                fill='var(--color-actualShare)'
                radius={[0, 4, 4, 0]}
                isAnimationActive={false}
              />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>
    </div>
  )
}
