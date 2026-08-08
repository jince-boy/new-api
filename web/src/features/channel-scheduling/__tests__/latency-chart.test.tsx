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

import { renderToStaticMarkup } from 'react-dom/server'

import '@/i18n/config'

import { FirstTokenLatencyChart } from '../components/first-token-latency-chart'
import { buildSchedulingChartData } from '../lib/chart-data'
import type { SchedulingPool } from '../lib/scheduling-analytics'

test('latency chart identifies channels and summarizes current TTFT evidence', () => {
  const pool: SchedulingPool = {
    key: 'pool',
    group: 'vip',
    model: 'gpt-5',
    priority: 10,
    channels: [
      {
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
        inflight: 1,
        request_count: 5,
        success_count: 5,
        error_count: 0,
        affinity_hits: 0,
        samples: 9,
        actual_share: 1,
        state: 'normal',
        last_error: '',
        last_selected_at: 1,
        last_completed_at: 1,
        series: [
          {
            ts: 10,
            request_count: 1,
            success_count: 1,
            error_count: 0,
            avg_ttft_ms: 1200,
            effective_weight: 80,
            inflight: 1,
          },
        ],
      },
    ],
  }

  const html = renderToStaticMarkup(
    <FirstTokenLatencyChart
      pool={pool}
      data={buildSchedulingChartData(pool.channels)}
    />
  )

  assert.match(html, /fast-channel #8/)
  assert.match(html, /1\.20 s/)
  assert.match(html, /Latest sample/)
  assert.match(html, /1\.10 s/)
  assert.match(html, /Samples: 9/)
  assert.match(html, /Normal rotation/)
})
