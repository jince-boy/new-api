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
import { describe, test } from 'node:test'

import {
  buildPreviewRows,
  EMPTY_LANE_ENABLED,
  EMPTY_LANE_PRICES,
} from '../model-pricing-core'
import {
  buildModelSnapshots,
  getModeLabel,
  getPriceSummary,
} from '../model-pricing-snapshots'
import {
  serializePerSecondRules,
  validatePerSecondRules,
} from '../per-second-pricing'

const translate = (key: string) => key

describe('per-second model pricing', () => {
  test('loads a per_second backend setting as the per-second editor mode', () => {
    const snapshots = buildModelSnapshots({
      modelPrice: '{"video-model":0.02}',
      modelRatio: '{}',
      cacheRatio: '{}',
      createCacheRatio: '{}',
      completionRatio: '{}',
      imageRatio: '{}',
      audioRatio: '{}',
      audioCompletionRatio: '{}',
      billingMode: '{"video-model":"per_second"}',
      billingExpr: '{}',
      perSecondRules:
        '{"video-model":[{"name":"720P","price":0.04,"conditions":[{"path":"resolution","operator":"eq","value":"720p"}]}]}',
    })

    assert.equal(snapshots.length, 1)
    assert.equal(snapshots[0].name, 'video-model')
    assert.equal(snapshots[0].billingMode, 'per-second')
    assert.equal(snapshots[0].price, '0.02')
    assert.equal(snapshots[0].perSecondRules?.[0]?.price, '0.04')
    assert.equal(snapshots[0].hasConflict, false)
  })

  test('shows the configured price with a seconds unit', () => {
    const summary = getPriceSummary(
      {
        name: 'video-model',
        price: '0.02',
        billingMode: 'per-second',
        hasConflict: false,
      },
      translate
    )

    assert.equal(getModeLabel('per-second'), 'Per-second')
    assert.equal(summary, '$0.02 / second')
  })

  test('previews both ModelPrice and the per_second backend billing mode', () => {
    const rows = buildPreviewRows(
      { name: 'video-model', price: '0.02' },
      'per-second',
      '',
      '',
      '',
      EMPTY_LANE_PRICES,
      EMPTY_LANE_ENABLED,
      translate,
      [
        {
          id: 'rule-1',
          name: '720P',
          price: '0.04',
          conditions: [
            {
              id: 'condition-1',
              path: 'resolution',
              operator: 'eq',
              value: '720p',
            },
          ],
        },
      ]
    )

    assert.deepEqual(rows, [
      { key: 'mode', label: 'BillingMode', value: 'per_second' },
      { key: 'price', label: 'ModelPrice', value: '0.02' },
      { key: 'rules', label: 'Conditional rules', value: '1' },
    ])
  })

  test('rejects incomplete rules and serializes a valid custom request path', () => {
    assert.equal(
      validatePerSecondRules([
        {
          id: 'rule-1',
          name: 'Premium',
          price: '0.08',
          conditions: [
            {
              id: 'condition-1',
              path: '',
              operator: 'eq',
              value: 'premium',
            },
          ],
        },
      ]),
      'Each condition needs a request field.'
    )

    assert.deepEqual(
      serializePerSecondRules([
        {
          id: 'rule-1',
          name: 'Premium',
          price: '0.08',
          conditions: [
            {
              id: 'condition-1',
              path: 'vendor.quality',
              operator: 'eq',
              value: 'premium',
            },
          ],
        },
      ]),
      [
        {
          name: 'Premium',
          price: 0.08,
          conditions: [
            { path: 'vendor.quality', operator: 'eq', value: 'premium' },
          ],
        },
      ]
    )
  })
})
