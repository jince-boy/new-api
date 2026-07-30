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
import { after, describe, test } from 'node:test'

import { Window } from 'happy-dom'

const domWindow = new Window()
for (const key of [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'Node',
  'Element',
  'Event',
  'CustomEvent',
  'customElements',
  'MutationObserver',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'getComputedStyle',
  'matchMedia',
] as const) {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    value: domWindow[key],
  })
}

const { act } = await import('react')
const { createRoot } = await import('react-dom/client')
const i18next = (await import('i18next')).default
const { initReactI18next } = await import('react-i18next')
await i18next.use(initReactI18next).init({ lng: 'en' })
const { PerSecondPricingTable } =
  await import('../per-second-pricing-breakdown')
const reactTestGlobals = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}
reactTestGlobals.IS_REACT_ACT_ENVIRONMENT = true

describe('PerSecondPricingTable', () => {
  after(() => {
    domWindow.close()
  })

  test('shows conditional and fallback prices with the selected group ratio', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <PerSecondPricingTable
          model={{
            id: 1,
            model_name: 'video-tiered',
            quota_type: 1,
            model_ratio: 1,
            completion_ratio: 1,
            model_price: 0.02,
            billing_mode: 'per_second',
            enable_groups: ['default'],
            per_second_rules: [
              {
                name: '720p',
                price: 0.04,
                conditions: [
                  {
                    path: 'resolution',
                    operator: 'eq',
                    value: '720p',
                  },
                ],
              },
            ],
          }}
          groupRatio={2}
          priceRate={1}
          usdExchangeRate={1}
        />
      )
    })

    const text = container.textContent || ''
    assert.match(text, /720p/)
    assert.match(text, /resolution/)
    assert.match(text, /All other requests/)
    assert.match(text, /\$0\.08/)
    assert.match(text, /\$0\.04/)

    await act(async () => root.unmount())
    container.remove()
  })
})
