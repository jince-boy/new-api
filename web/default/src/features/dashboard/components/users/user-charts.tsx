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
import { useEffect, useMemo, useState, useRef, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { VChart } from '@visactor/react-vchart'
import { Users, Loader2, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { getRollingDateRange, type TimeGranularity } from '@/lib/time'
import { VCHART_OPTION } from '@/lib/vchart'
import { useThemeCustomization } from '@/context/theme-customization-provider'
import { useTheme } from '@/context/theme-provider'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  ToggleGroup,
  ToggleGroupItem,
} from '@/components/ui/toggle-group'
import { getUserQuotaDataByUsers } from '@/features/dashboard/api'
import {
  DASHBOARD_RANK_BASE_COUNT,
  DASHBOARD_RANK_CHART_HEADER_HEIGHT,
  DASHBOARD_RANK_DESKTOP_CHART_HEIGHT,
  DASHBOARD_RANK_DESKTOP_ROW_HEIGHT,
  DASHBOARD_QUICK_RANGE_PRESETS,
  DEFAULT_DASHBOARD_QUICK_RANGE,
  DEFAULT_TIME_GRANULARITY,
  TIME_GRANULARITY_OPTIONS,
} from '@/features/dashboard/constants'
import {
  buildQuickRangeDashboardFilters,
  getDefaultDays,
  saveGranularity,
  processUserChartData,
} from '@/features/dashboard/lib'
import type { ProcessedUserChartData } from '@/features/dashboard/types'

let themeManagerPromise: Promise<
  (typeof import('@visactor/vchart'))['ThemeManager']
> | null = null

const USER_CHARTS: {
  value: string
  labelKey: string
  specKey: keyof ProcessedUserChartData
}[] = [
  {
    value: 'rank',
    labelKey: 'User Consumption Ranking',
    specKey: 'spec_user_rank',
  },
  {
    value: 'trend',
    labelKey: 'User Consumption Trend',
    specKey: 'spec_user_trend',
  },
]

const TOP_USER_LIMIT_OPTIONS = [5, 10, 20, 50]

export function UserCharts() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { resolvedTheme } = useTheme()
  const { customization } = useThemeCustomization()
  const [themeReady, setThemeReady] = useState(false)
  const themeManagerRef = useRef<
    (typeof import('@visactor/vchart'))['ThemeManager'] | null
  >(null)

  const [timeGranularity, setTimeGranularity] = useState<TimeGranularity>(
    DEFAULT_TIME_GRANULARITY
  )
  const [activeQuickRange, setActiveQuickRange] = useState<string | null>(
    DEFAULT_DASHBOARD_QUICK_RANGE
  )
  const [topUserLimit, setTopUserLimit] = useState(10)
  const [timeRange, setTimeRange] = useState(() => {
    const result = buildQuickRangeDashboardFilters(DEFAULT_DASHBOARD_QUICK_RANGE)
    const start = result.filters.start_timestamp as Date
    const end = result.filters.end_timestamp as Date
    return {
      start_timestamp: Math.floor(start.getTime() / 1000),
      end_timestamp: Math.floor(end.getTime() / 1000),
    }
  })

  const handleRangeChange = useCallback((days: number) => {
    setActiveQuickRange(null)
    const { start, end } = getRollingDateRange(days)
    setTimeRange({
      start_timestamp: Math.floor(start.getTime() / 1000),
      end_timestamp: Math.floor(end.getTime() / 1000),
    })
  }, [])

  const handleQuickRangeChange = useCallback(
    (value: string[]) => {
      const next = value.find((item) => item !== activeQuickRange)
      if (!next) return

      const result = buildQuickRangeDashboardFilters(next, {
        time_granularity: timeGranularity,
      })

      setActiveQuickRange(result.presetKey)
      setTimeGranularity(result.filters.time_granularity || timeGranularity)
      setTimeRange({
        start_timestamp: Math.floor(
          (result.filters.start_timestamp as Date).getTime() / 1000
        ),
        end_timestamp: Math.floor(
          (result.filters.end_timestamp as Date).getTime() / 1000
        ),
      })
    },
    [activeQuickRange, timeGranularity]
  )

  const handleGranularityChange = useCallback(
    (g: TimeGranularity) => {
      setTimeGranularity(g)
      saveGranularity(g)
      const days = getDefaultDays(g)
      handleRangeChange(days)
    },
    [handleRangeChange]
  )

  useEffect(() => {
    const updateTheme = async () => {
      setThemeReady(false)
      if (!themeManagerPromise) {
        themeManagerPromise = import('@visactor/vchart').then(
          (m) => m.ThemeManager
        )
      }
      const ThemeManager = await themeManagerPromise
      themeManagerRef.current = ThemeManager
      ThemeManager.setCurrentTheme(resolvedTheme === 'dark' ? 'dark' : 'light')
      setThemeReady(true)
    }
    updateTheme()
  }, [resolvedTheme])

  const { data: userData, isLoading } = useQuery({
    queryKey: ['dashboard', 'user-quota', timeRange],
    queryFn: () => getUserQuotaDataByUsers(timeRange),
    select: (res) => (res.success ? res.data : []),
    staleTime: 60_000,
  })

  const handleRefresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['dashboard', 'user-quota'] })
  }, [queryClient])

  const chartData = useMemo(
    () =>
      processUserChartData(
        isLoading ? [] : (userData ?? []),
        timeGranularity,
        t,
        topUserLimit,
        customization.preset
      ),
    [
      userData,
      isLoading,
      timeGranularity,
      t,
      topUserLimit,
      customization.preset,
    ]
  )

  return (
    <div className='space-y-3'>
      <div className='flex flex-wrap items-center gap-1.5 pb-1 sm:gap-2'>
        <ToggleGroup
          value={activeQuickRange ? [activeQuickRange] : []}
          onValueChange={handleQuickRangeChange}
          aria-label={t('Quick Range')}
          variant='outline'
          size='sm'
          spacing={0}
          className='max-w-full overflow-x-auto'
        >
          {DASHBOARD_QUICK_RANGE_PRESETS.map((preset) => (
            <ToggleGroupItem
              key={preset.key}
              value={preset.key}
              className={cn(
                'px-2.5 text-xs',
                activeQuickRange === preset.key && 'bg-muted'
              )}
            >
              {t(preset.label)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        <Button variant='outline' size='sm' onClick={handleRefresh}>
          <RefreshCw data-icon='inline-start' />
          {t('Refresh')}
        </Button>

        <Tabs
          value={timeGranularity}
          onValueChange={(value) =>
            handleGranularityChange(value as TimeGranularity)
          }
          className='shrink-0'
        >
          <TabsList>
            {TIME_GRANULARITY_OPTIONS.map((opt) => (
              <TabsTrigger
                key={opt.value}
                value={opt.value}
                className='px-2.5 text-xs'
              >
                {t(opt.label)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <Tabs
          value={String(topUserLimit)}
          onValueChange={(value) => setTopUserLimit(Number(value))}
          className='shrink-0'
        >
          <TabsList>
            <span className='text-muted-foreground px-2 text-xs font-medium whitespace-nowrap'>
              {t('Top Users')}
            </span>
            {TOP_USER_LIMIT_OPTIONS.map((limit) => (
              <TabsTrigger
                key={limit}
                value={String(limit)}
                className='px-2.5 text-xs'
              >
                {t('Top {{count}}', { count: limit })}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {isLoading && (
          <Loader2 className='text-muted-foreground size-4 animate-spin' />
        )}
      </div>

      <div className='grid gap-3'>
        {USER_CHARTS.map((chart) => {
          const spec = chartData[chart.specKey]
          const isRankChart = chart.value === 'rank'
          const rankValueCount =
            isRankChart && Array.isArray(spec?.data?.[0]?.values)
              ? spec.data[0].values.length
              : 0
          const rankChartHeight = isRankChart
            ? DASHBOARD_RANK_CHART_HEADER_HEIGHT +
              Math.max(rankValueCount, DASHBOARD_RANK_BASE_COUNT) *
                DASHBOARD_RANK_DESKTOP_ROW_HEIGHT
            : undefined
          const chartElement =
            themeReady &&
            spec && (
              <VChart
                key={`user-${chart.value}-${topUserLimit}-${resolvedTheme}-${customization.preset}`}
                spec={{
                  ...spec,
                  theme: resolvedTheme === 'dark' ? 'dark' : 'light',
                  background: 'transparent',
                }}
                option={VCHART_OPTION}
              />
            )

          return (
            <div
              key={chart.value}
              className='overflow-hidden rounded-lg border'
            >
              <div className='flex w-full items-center gap-2 border-b px-3 py-2 sm:px-5 sm:py-3'>
                <Users className='text-muted-foreground/60 size-4' />
                <div className='text-sm font-semibold'>{t(chart.labelKey)}</div>
              </div>

              <div className='h-[300px] p-1.5 sm:h-96 sm:p-2'>
                {isLoading ? (
                  <Skeleton className='h-full w-full' />
                ) : isRankChart ? (
                  <div
                    className='overflow-y-auto'
                    style={{ height: DASHBOARD_RANK_DESKTOP_CHART_HEIGHT }}
                  >
                    <div style={{ height: rankChartHeight }}>
                      {chartElement}
                    </div>
                  </div>
                ) : (
                  chartElement
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
