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
import type { ChannelSchedulingSetting, SchedulingChannel } from '../types'

export interface SchedulingPool {
  key: string
  group: string
  model: string
  priority: number
  channels: SchedulingChannel[]
}

export interface SchedulingGroupMetrics {
  poolCount: number
  capabilityCount: number
  requests: number
  rps: number
  errors: number
  successRate: number | null
  averageTtftMs: number | null
  medianTtftMs: number | null
  inflight: number
  degradedCount: number
}

export function listConfiguredSchedulingGroups(
  setting?: ChannelSchedulingSetting
): string[] {
  if (!setting) return []
  const groups = new Set<string>()
  for (const [group, strategy] of Object.entries(setting.group_strategies)) {
    const normalized = group.trim()
    if (strategy === 'intelligent' && normalized) groups.add(normalized)
  }
  return [...groups].sort((left, right) => left.localeCompare(right))
}

export function listSchedulingPools(
  channels: SchedulingChannel[],
  group: string
): SchedulingPool[] {
  const pools = new Map<string, SchedulingPool>()
  for (const channel of channels) {
    if (channel.group !== group) continue
    const key = JSON.stringify([channel.model, channel.priority])
    const existing = pools.get(key)
    if (existing) {
      existing.channels.push(channel)
      continue
    }
    pools.set(key, {
      key,
      group,
      model: channel.model,
      priority: channel.priority,
      channels: [channel],
    })
  }
  return [...pools.values()].sort((left, right) => {
    if (left.priority !== right.priority) return right.priority - left.priority
    return left.model.localeCompare(right.model)
  })
}

export function calculateSchedulingGroupMetrics(
  pools: SchedulingPool[],
  generatedAt: number
): SchedulingGroupMetrics {
  const channels = pools.flatMap((pool) => pool.channels)
  let requests = 0
  let recentRequests = 0
  let successes = 0
  let errors = 0
  let inflight = 0
  let degradedCount = 0
  let weightedTtftTotal = 0
  let ttftSampleCount = 0
  const ttftEstimates: number[] = []
  const recentCutoff = generatedAt - 10

  for (const channel of channels) {
    inflight += channel.inflight
    if (channel.state === 'degraded') degradedCount++
    if (channel.estimated_ttft_ms > 0) {
      ttftEstimates.push(channel.estimated_ttft_ms)
      const samples = Math.max(1, channel.samples)
      weightedTtftTotal += channel.estimated_ttft_ms * samples
      ttftSampleCount += samples
    }
    for (const point of channel.series) {
      requests += point.request_count
      successes += point.success_count
      errors += point.error_count
      if (point.ts > recentCutoff) recentRequests += point.request_count
    }
  }

  ttftEstimates.sort((left, right) => left - right)
  let medianTtftMs: number | null = null
  if (ttftEstimates.length > 0) {
    const middle = Math.floor(ttftEstimates.length / 2)
    medianTtftMs =
      ttftEstimates.length % 2 === 1
        ? ttftEstimates[middle]
        : Math.round((ttftEstimates[middle - 1] + ttftEstimates[middle]) / 2)
  }

  const completed = successes + errors
  return {
    poolCount: pools.length,
    capabilityCount: channels.length,
    requests,
    rps: Math.round((recentRequests / 10) * 100) / 100,
    errors,
    successRate: completed > 0 ? successes / completed : null,
    averageTtftMs:
      ttftSampleCount > 0
        ? Math.round(weightedTtftTotal / ttftSampleCount)
        : null,
    medianTtftMs,
    inflight,
    degradedCount,
  }
}

export function countSchedulingPoolRequests(
  channels: SchedulingChannel[]
): number {
  let requests = 0
  for (const channel of channels) {
    for (const point of channel.series) requests += point.request_count
  }
  return requests
}
