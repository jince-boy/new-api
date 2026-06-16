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
import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { VChart } from '@visactor/react-vchart'
import { KeyRound, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { computeTimeRange } from '@/lib/time'
import { VCHART_OPTION } from '@/lib/vchart'
import { useThemeCustomization } from '@/context/theme-customization-provider'
import { useTheme } from '@/context/theme-provider'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { getTokenRanking } from '@/features/dashboard/api'
import {
  DASHBOARD_RANK_BAR_HEIGHT,
  DASHBOARD_RANK_BASE_COUNT,
  DASHBOARD_RANK_CHART_HEADER_HEIGHT,
  DASHBOARD_RANK_DESKTOP_CHART_HEIGHT,
  DASHBOARD_RANK_DESKTOP_ROW_HEIGHT,
} from '@/features/dashboard/constants'
import { buildQueryParams, getDefaultDays } from '@/features/dashboard/lib'
import type { DashboardFilters } from '@/features/dashboard/types'

let themeManagerPromise: Promise<
  (typeof import('@visactor/vchart'))['ThemeManager']
> | null = null

const CHART_COLOR_VARIABLES = [
  '--chart-1',
  '--chart-2',
  '--chart-3',
  '--chart-4',
  '--chart-5',
] as const

const RANK_PLACEHOLDER_PREFIX = '__rank_placeholder__'

function isRankPlaceholder(datum: Record<string, unknown> | undefined) {
  return Boolean(datum?.__rankPlaceholder)
}

function isRankPlaceholderKey(value: unknown) {
  return typeof value === 'string' && value.startsWith(RANK_PLACEHOLDER_PREFIX)
}

function padRankValues<T extends Record<string, unknown>>(values: T[]) {
  if (values.length >= DASHBOARD_RANK_BASE_COUNT) return values

  return [
    ...values,
    ...Array.from(
      { length: DASHBOARD_RANK_BASE_COUNT - values.length },
      (_, index) =>
        ({
          User: `${RANK_PLACEHOLDER_PREFIX}${index}`,
          rawTokens: 0,
          Usage: 0,
          Rank: null,
          IsSelf: false,
          __rankPlaceholder: true,
        }) as T
    ),
  ]
}

function getThemeChartColors(themeKey?: string): string[] {
  if (typeof document === 'undefined') return []
  void themeKey

  const bodyStyle = window.getComputedStyle(document.body)
  const rootStyle = window.getComputedStyle(document.documentElement)

  return CHART_COLOR_VARIABLES.map((name) => {
    return (
      bodyStyle.getPropertyValue(name) || rootStyle.getPropertyValue(name)
    ).trim()
  }).filter(Boolean)
}

interface TokenRankingPanelProps {
  filters?: DashboardFilters
  refreshKey?: number
}

function formatTokenMillions(value: number | null | undefined): string {
  const numeric = Number(value) || 0
  return `${(numeric / 1_000_000).toFixed(2)}M`
}

function maskUsername(username: string | null | undefined, fallback: string) {
  const value = username || fallback
  if (value.includes('***')) return value

  const chars = Array.from(value)
  if (chars.length <= 1) return `${value}***`
  if (chars.length === 2) return `${chars[0]}***`
  return `${chars[0]}***${chars[chars.length - 1]}`
}

export function TokenRankingPanel(props: TokenRankingPanelProps) {
  const { t } = useTranslation()
  const { resolvedTheme } = useTheme()
  const { customization } = useThemeCustomization()
  const [themeReady, setThemeReady] = useState(false)
  const themeManagerRef = useRef<
    (typeof import('@visactor/vchart'))['ThemeManager'] | null
  >(null)

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

  const queryParams = useMemo(() => {
    const timeRange = computeTimeRange(
      getDefaultDays(props.filters?.time_granularity),
      props.filters?.start_timestamp,
      props.filters?.end_timestamp
    )
    const params = buildQueryParams(timeRange, props.filters)
    return {
      start_timestamp: params.start_timestamp,
      end_timestamp: params.end_timestamp,
      username: params.username,
    }
  }, [props.filters])

  const { data, isLoading, isError } = useQuery({
    queryKey: ['dashboard', 'token-ranking', queryParams, props.refreshKey],
    queryFn: () => getTokenRanking(queryParams),
    select: (res) => (res.success ? res.data : null),
    staleTime: 60_000,
  })

  const ranking = data?.ranking ?? []
  const isLimited = Boolean(data?.is_limited)
  const chartHeight =
    DASHBOARD_RANK_CHART_HEADER_HEIGHT +
    Math.max(ranking.length, DASHBOARD_RANK_BASE_COUNT) *
      DASHBOARD_RANK_DESKTOP_ROW_HEIGHT
  const chartColorRange = useMemo(
    () => getThemeChartColors(customization.preset),
    [customization.preset]
  )

  const chartValues = useMemo(() => {
    const maskedNames = new Map<string, number>()
    const values = ranking.map((item) => {
      let displayName =
        isLimited && !item.is_self
          ? maskUsername(item.username, t('User'))
          : item.username || t('User')

      if (isLimited && !item.is_self) {
        const count = (maskedNames.get(displayName) ?? 0) + 1
        maskedNames.set(displayName, count)
        if (count > 1) displayName = `${displayName} #${count}`
      }

      return {
        User: displayName,
        rawTokens: item.token_used,
        Usage: Number(((item.token_used || 0) / 1_000_000).toFixed(4)),
        Rank: item.rank,
        IsSelf: item.is_self,
      }
    })
    return padRankValues(values)
  }, [isLimited, ranking, t])

  const totalTokens = chartValues.reduce(
    (sum, item) => sum + (Number(item.rawTokens) || 0),
    0
  )

  const tokenColorMap = useMemo(
    () =>
      chartValues.reduce<Record<string, string>>((acc, item, index) => {
        if (isRankPlaceholder(item)) {
          acc[item.User] = 'rgba(0, 0, 0, 0)'
          return acc
        }

        const palette = chartColorRange.length > 0 ? chartColorRange : []
        if (palette.length > 0) {
          acc[item.User] = palette[index % palette.length]
        }
        return acc
      }, {}),
    [chartColorRange, chartValues]
  )

  const chartSpec = useMemo(
    () => ({
      type: 'bar',
      data: [
        {
          id: 'tokenRanking',
          values: chartValues,
        },
      ],
      xField: 'rawTokens',
      yField: 'User',
      seriesField: 'User',
      direction: 'horizontal',
      title: {
        visible: true,
        text: t('Token Usage Ranking'),
        subtext: `${t('Total:')} ${formatTokenMillions(totalTokens)}`,
      },
      legends: { visible: false },
      barWidth: DASHBOARD_RANK_BAR_HEIGHT,
      barMinWidth: DASHBOARD_RANK_BAR_HEIGHT,
      barMaxWidth: DASHBOARD_RANK_BAR_HEIGHT,
      color:
        Object.keys(tokenColorMap).length > 0
          ? { specified: tokenColorMap }
          : undefined,
      axes: [
        {
          orient: 'left',
          type: 'band',
          bandSize: DASHBOARD_RANK_DESKTOP_ROW_HEIGHT,
          minBandSize: DASHBOARD_RANK_DESKTOP_ROW_HEIGHT,
          maxBandSize: DASHBOARD_RANK_DESKTOP_ROW_HEIGHT,
          autoRegionSize: true,
          label: {
            formatMethod: (value: unknown) =>
              isRankPlaceholderKey(value) ? '' : String(value),
          },
        },
        { orient: 'bottom', type: 'linear', visible: false },
      ],
      label: {
        visible: true,
        position: 'outside',
        formatMethod: (value: number, datum?: Record<string, unknown>) =>
          isRankPlaceholder(datum) ? '' : formatTokenMillions(value),
        style: { fontSize: 11 },
      },
      tooltip: {
        mark: {
          content: [
            {
              key: (datum: Record<string, unknown>) => datum?.User,
              value: (datum: Record<string, unknown>) =>
                formatTokenMillions(Number(datum?.rawTokens) || 0),
            },
          ],
          updateContent: (
            array: Array<{
              key: string
              value: string | number
              datum?: Record<string, unknown>
            }>
          ) => {
            array = array.filter((item) => !isRankPlaceholder(item.datum))
            for (let i = 0; i < array.length; i++) {
              const rawTokens = array[i].datum?.rawTokens
              const value =
                rawTokens === undefined ? array[i].value : Number(rawTokens)
              array[i].value = formatTokenMillions(Number(value) || 0)
            }
            return array
          },
        },
      },
      bar: {
        style: {
          height: DASHBOARD_RANK_BAR_HEIGHT,
        },
        state: { hover: { stroke: '#000', lineWidth: 1 } },
      },
      crosshair: {
        yField: { visible: false },
      },
      barBackground: {
        visible: true,
        style: {
          fill: 'rgba(0, 0, 0, 0)',
          height: DASHBOARD_RANK_BAR_HEIGHT,
        },
        state: {
          hover: {
            fill: 'rgba(100, 116, 139, 0.10)',
            height: DASHBOARD_RANK_BAR_HEIGHT,
          },
        },
      },
      background: { fill: 'transparent' },
      animation: true,
    }),
    [chartValues, tokenColorMap, t, totalTokens]
  )

  return (
    <div className='overflow-hidden rounded-lg border'>
      <div className='flex flex-col gap-2 border-b px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:px-5 sm:py-3'>
        <div className='flex min-w-0 items-center gap-2'>
          <KeyRound className='text-muted-foreground/60 size-4 shrink-0' />
          <div className='truncate text-sm font-semibold'>
            {t('Token Usage Ranking')}
          </div>
          {isLoading && (
            <Loader2 className='text-muted-foreground size-3.5 animate-spin' />
          )}
        </div>
        <div className='flex flex-wrap items-center gap-1.5'>
          <Badge variant='outline'>
            {data?.is_limited
              ? t('Top {{count}}', { count: data.limit || 10 })
              : t('All Rankings')}
          </Badge>
          <Badge variant='secondary'>
            {t('Users: {{count}}', { count: data?.total_users ?? 0 })}
          </Badge>
          {data?.self_rank ? (
            <Badge variant='outline'>
              {t('My Rank: {{rank}}', { rank: data.self_rank })}
            </Badge>
          ) : null}
        </div>
      </div>

      {isLoading ? (
        <div className='p-1.5 sm:p-2'>
          <Skeleton className='h-[300px] w-full sm:h-96' />
        </div>
      ) : isError || !data ? (
        <div className='text-muted-foreground p-6 text-sm'>
          {t('Failed to load token ranking')}
        </div>
      ) : ranking.length === 0 ? (
        <div className='text-muted-foreground flex h-40 items-center justify-center text-sm'>
          {t('No ranking data available')}
        </div>
      ) : (
        <div className='p-1.5 sm:p-2'>
          <div
            className='overflow-y-auto'
            style={{ height: DASHBOARD_RANK_DESKTOP_CHART_HEIGHT }}
          >
            <div style={{ height: chartHeight }}>
              {themeReady && (
                <VChart
                  key={`token-ranking-${ranking.length}-${resolvedTheme}-${customization.preset}`}
                  spec={{
                    ...chartSpec,
                    theme: resolvedTheme === 'dark' ? 'dark' : 'light',
                    background: 'transparent',
                  }}
                  option={VCHART_OPTION}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
