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
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
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
import { cn } from '@/lib/utils'

import {
  formatSchedulingTime,
  type SchedulingTimelinePoint,
} from '../lib/chart-data'

interface SchedulingTrendSeries {
  key: string
  label: string
  color: string
}

interface SchedulingTrendChartProps {
  title: string
  description: string
  data: SchedulingTimelinePoint[]
  series: SchedulingTrendSeries[]
  className?: string
  valueSuffix?: string
  allowDecimals?: boolean
  yAxisWidth?: number
}

export function SchedulingTrendChart(props: SchedulingTrendChartProps) {
  const chartConfig = useMemo<ChartConfig>(() => {
    const config: ChartConfig = {}
    for (const series of props.series) {
      config[series.key] = { label: series.label, color: series.color }
    }
    return config
  }, [props.series])

  return (
    <Card className={cn(props.className)}>
      <CardHeader>
        <CardTitle>{props.title}</CardTitle>
        <CardDescription>{props.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className='h-80 w-full'>
          <LineChart
            accessibilityLayer
            data={props.data}
            margin={{ top: 8, right: 12, left: 8, bottom: 4 }}
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
              allowDecimals={props.allowDecimals}
              width={props.yAxisWidth ?? 54}
              tickFormatter={(value: number) =>
                props.valueSuffix ? `${value}${props.valueSuffix}` : `${value}`
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
                />
              }
            />
            <Legend content={<ChartLegendContent />} />
            {props.series.map((series) => (
              <Line
                key={series.key}
                dataKey={series.key}
                type='monotone'
                stroke={`var(--color-${series.key})`}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
