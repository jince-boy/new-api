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

import { OverviewCards } from '../components/overview-cards'

test('group overview shows the full set of live scheduling metrics', () => {
  const html = renderToStaticMarkup(
    <OverviewCards
      group='vip'
      pool={{
        key: 'pool',
        group: 'vip',
        model: 'gpt-5',
        priority: 10,
        channels: [],
      }}
      metrics={{
        poolCount: 6,
        capabilityCount: 11,
        requests: 120,
        rps: 3.4,
        errors: 7,
        successRate: 0.975,
        averageTtftMs: 910,
        medianTtftMs: 875,
        inflight: 5,
        degradedCount: 2,
      }}
    />
  )

  assert.match(html, /120/)
  assert.match(html, /3\.4/)
  assert.match(html, /97\.5%/)
  assert.match(html, /910 ms/)
  assert.match(html, /875 ms/)
  assert.match(html, /Active scheduling pools/)
  assert.match(html, /Capabilities in rotation/)
  assert.match(html, /Errors in chart window/)
  assert.match(html, /Latency-reduced capabilities/)
  assert.match(html, /Cards cover every active pool in vip/)
})
