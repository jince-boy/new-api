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

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'

import '@/i18n/config'

import { PoolTable } from '../components/pool-table'
import type { SchedulingPool } from '../lib/scheduling-analytics'
import type { SchedulingChannel } from '../types'

test('pool details show only data that directly affects round-robin scheduling', () => {
  const channel: SchedulingChannel = {
    channel_id: 8,
    channel_name: 'fast-channel',
    group: 'vip',
    model: 'gpt-5',
    priority: 10,
    base_weight: 100,
    effective_weight: 80,
    performance_factor: 0.8,
    estimated_ttft_ms: 1200,
    last_ttft_ms: 1100,
    inflight: 2,
    request_count: 12,
    success_count: 10,
    error_count: 2,
    affinity_hits: 3,
    samples: 9,
    actual_share: 0.5,
    state: 'degraded',
    last_error: 'upstream timeout',
    last_selected_at: 1,
    last_completed_at: 2,
    series: [
      {
        ts: 10,
        request_count: 4,
        success_count: 3,
        error_count: 1,
        avg_ttft_ms: 1200,
        effective_weight: 80,
        inflight: 2,
      },
    ],
  }
  const pool: SchedulingPool = {
    key: 'pool',
    group: 'vip',
    model: 'gpt-5',
    priority: 10,
    channels: [channel],
  }
  const queryClient = new QueryClient()
  const html = renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <PoolTable group='vip' pools={[pool]} faults={[]} channelFaults={[]} />
    </QueryClientProvider>
  )

  assert.match(html, /gpt-5/)
  assert.match(html, /Static priority 10/)
  assert.match(html, /First-token time/)
  assert.match(html, /Traffic allocation/)
  assert.match(html, /Current load/)
  assert.match(html, /Scheduler state/)
  assert.match(html, /1\.20 s/)
  assert.match(html, /Latest sample/)
  assert.match(html, /1\.10 s/)
  assert.match(html, /80\.00/)
  assert.match(html, /0\.800x/)
  assert.match(html, /100\.0%/)
  assert.match(html, /50\.0%/)
  assert.match(html, /Requests in chart window: 4/)
  assert.match(html, /Latency reduced/)
  assert.doesNotMatch(html, /Request statistics/)
  assert.doesNotMatch(html, /Recent activity/)
  assert.doesNotMatch(html, /Affinity hits/)
  assert.doesNotMatch(html, /Total requests/)
  assert.doesNotMatch(html, /Last error/)
  assert.doesNotMatch(html, /upstream timeout/)
  assert.doesNotMatch(html, />Group</)
})
