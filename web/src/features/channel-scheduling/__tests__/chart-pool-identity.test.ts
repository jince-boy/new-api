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
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildSchedulingChartData,
  formatSchedulingDateTime,
  formatSchedulingDuration,
  formatSchedulingTime,
} from '../lib/chart-data'
import {
  calculateSchedulingGroupMetrics,
  listConfiguredSchedulingGroups,
  listSchedulingPools,
} from '../lib/scheduling-analytics'
import type { ChannelSchedulingSetting, SchedulingChannel } from '../types'

function schedulingChannel(
  channelId: number,
  group: string,
  model: string,
  priority: number,
  timestamp = 10
): SchedulingChannel {
  return {
    channel_id: channelId,
    channel_name: `channel-${channelId}`,
    group,
    model,
    priority,
    base_weight: 100,
    effective_weight: 80,
    performance_factor: 0.8,
    estimated_ttft_ms: 1200,
    last_ttft_ms: 1100,
    inflight: 1,
    request_count: 4,
    success_count: 4,
    error_count: 0,
    affinity_hits: 0,
    samples: 4,
    actual_share: 0.5,
    state: 'normal',
    last_error: '',
    last_selected_at: 1,
    last_completed_at: 1,
    series: [
      {
        ts: timestamp,
        request_count: 2,
        success_count: 2,
        error_count: 0,
        avg_ttft_ms: 1200,
        effective_weight: 80,
        inflight: 1,
      },
    ],
  }
}

test('pools are isolated by group, model, and static priority', () => {
  const channels = [
    schedulingChannel(1, 'group-1', 'gpt-5', 10),
    schedulingChannel(2, 'group-1', 'gpt-5', 10),
    schedulingChannel(3, 'group-1', 'gpt-5', 5),
    schedulingChannel(4, 'group-2', 'gpt-5', 10),
  ]

  const pools = listSchedulingPools(channels, 'group-1')

  assert.equal(pools.length, 2)
  assert.equal(pools[0].priority, 10)
  assert.deepEqual(
    pools[0].channels.map((channel) => channel.channel_id),
    [1, 2]
  )
  assert.equal(pools[1].priority, 5)
})

test('overview groups come only from explicit intelligent strategy overrides', () => {
  const setting: ChannelSchedulingSetting = {
    default_strategy: 'legacy',
    group_strategies: {
      default: 'legacy',
      vip: 'intelligent',
      premium: 'intelligent',
    },
    minimum_factor: 0.2,
    maximum_factor: 1.5,
    performance_exponent: 0.5,
    inflight_penalty: 0.25,
    warmup_samples: 5,
    sample_window_size: 20,
    sample_max_age_minutes: 15,
    severe_ttft_ms: 60_000,
    failure_threshold: 5,
    failure_window_seconds: 60,
    max_attempts: 8,
    realtime_retention_minutes: 60,
  }

  assert.deepEqual(listConfiguredSchedulingGroups(setting), ['premium', 'vip'])
})

test('chart data drops invalid timestamps and keeps channel series separate', () => {
  const data = buildSchedulingChartData([
    schedulingChannel(1, 'group-1', 'gpt-5', 10, 10),
    schedulingChannel(2, 'group-1', 'gpt-5', 10, Number.NaN),
  ])

  assert.equal(data.series.length, 2)
  assert.notEqual(data.series[0].ttftKey, data.series[1].ttftKey)
  assert.notEqual(data.series[0].weightKey, data.series[1].weightKey)
  assert.notEqual(data.series[0].inflightKey, data.series[1].inflightKey)
  assert.equal(data.timeline.length, 1)
  assert.equal(data.timeline[0][data.series[0].weightKey], 80)
  assert.equal(data.timeline[0][data.series[0].inflightKey], 1)
  assert.equal(formatSchedulingTime(Number.NaN), '--:--:--')
  assert.equal(formatSchedulingDateTime(0), '-')
  assert.equal(formatSchedulingDuration(850), '850 ms')
  assert.equal(formatSchedulingDuration(1250), '1.25 s')
  assert.equal(formatSchedulingDuration(60_000), '60.0 s')
  assert.doesNotMatch(formatSchedulingTime(10), /Invalid Date/)
  assert.doesNotMatch(formatSchedulingDateTime(10), /Invalid Date/)
})

test('group metrics aggregate every pool but keep a ten-second RPS window', () => {
  const channels = [
    schedulingChannel(1, 'group-1', 'gpt-5', 10, 95),
    schedulingChannel(2, 'group-1', 'claude', 10, 80),
  ]
  channels[0].estimated_ttft_ms = 1000
  channels[0].samples = 3
  channels[0].state = 'degraded'
  channels[1].estimated_ttft_ms = 2000
  channels[1].samples = 1
  channels[1].series[0].error_count = 1
  channels[1].series[0].success_count = 1
  const pools = listSchedulingPools(channels, 'group-1')

  const metrics = calculateSchedulingGroupMetrics(pools, 100)

  assert.equal(metrics.poolCount, 2)
  assert.equal(metrics.capabilityCount, 2)
  assert.equal(metrics.requests, 4)
  assert.equal(metrics.rps, 0.2)
  assert.equal(metrics.errors, 1)
  assert.equal(metrics.averageTtftMs, 1250)
  assert.equal(metrics.medianTtftMs, 1500)
  assert.equal(metrics.degradedCount, 1)
})
