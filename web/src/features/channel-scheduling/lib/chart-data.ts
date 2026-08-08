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
import dayjs from 'dayjs'

import type { SchedulingChannel } from '../types'

const CHART_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
] as const

export interface SchedulingChartSeries {
  key: string
  label: string
  color: string
  ttftKey: string
  weightKey: string
  inflightKey: string
  requestKey: string
}

export type SchedulingTimelinePoint = {
  timestamp: number
} & Record<string, number | null>

export interface SchedulingAllocationPoint {
  channel: string
  actualShare: number
  targetShare: number
}

export interface SchedulingChartData {
  series: SchedulingChartSeries[]
  timeline: SchedulingTimelinePoint[]
  allocation: SchedulingAllocationPoint[]
}

export function buildSchedulingChartData(
  channels: SchedulingChannel[]
): SchedulingChartData {
  const series = channels.map((channel, index) => {
    const key = `channel_${channel.channel_id}`
    return {
      key,
      label: `${channel.channel_name} (#${channel.channel_id})`,
      color: CHART_COLORS[index % CHART_COLORS.length],
      ttftKey: `${key}_ttft`,
      weightKey: `${key}_weight`,
      inflightKey: `${key}_inflight`,
      requestKey: `${key}_requests`,
    }
  })
  const timelineByTimestamp = new Map<number, SchedulingTimelinePoint>()

  for (let channelIndex = 0; channelIndex < channels.length; channelIndex++) {
    const channel = channels[channelIndex]
    const channelSeries = series[channelIndex]
    for (const point of channel.series) {
      if (!Number.isFinite(point.ts) || point.ts <= 0) continue
      let timelinePoint = timelineByTimestamp.get(point.ts)
      if (!timelinePoint) {
        timelinePoint = { timestamp: point.ts }
        timelineByTimestamp.set(point.ts, timelinePoint)
      }
      timelinePoint[channelSeries.ttftKey] =
        point.avg_ttft_ms > 0 ? point.avg_ttft_ms : null
      timelinePoint[channelSeries.weightKey] = point.effective_weight
      timelinePoint[channelSeries.inflightKey] = point.inflight
      timelinePoint[channelSeries.requestKey] = point.request_count
    }
  }

  const totalEffectiveWeight = channels.reduce(
    (total, channel) => total + Math.max(0, channel.effective_weight),
    0
  )
  const allocation = channels.map((channel, index) => ({
    channel: series[index].label,
    actualShare: Math.round(channel.actual_share * 10_000) / 100,
    targetShare:
      totalEffectiveWeight > 0
        ? Math.round(
            (Math.max(0, channel.effective_weight) / totalEffectiveWeight) *
              10_000
          ) / 100
        : 0,
  }))

  return {
    series,
    timeline: [...timelineByTimestamp.values()].sort(
      (left, right) => left.timestamp - right.timestamp
    ),
    allocation,
  }
}

export function formatSchedulingTime(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return '--:--:--'
  const value = dayjs.unix(timestamp)
  return value.isValid() ? value.format('HH:mm:ss') : '--:--:--'
}

export function formatSchedulingDateTime(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return '-'
  const value = dayjs.unix(timestamp)
  return value.isValid() ? value.format('MM-DD HH:mm:ss') : '-'
}

export function formatSchedulingDuration(milliseconds: number): string {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return '-'
  if (milliseconds < 1000) return `${Math.round(milliseconds)} ms`
  const seconds = milliseconds / 1000
  const digits = seconds >= 10 ? 1 : 2
  return `${seconds.toFixed(digits)} s`
}
