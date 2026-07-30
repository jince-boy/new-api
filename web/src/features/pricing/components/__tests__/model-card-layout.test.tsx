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
const domGlobals = [
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
] as const

for (const key of domGlobals) {
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
const { ModelCard } = await import('../model-card')
const reactTestGlobals = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}
reactTestGlobals.IS_REACT_ACT_ENVIRONMENT = true

describe('ModelCard metadata layout', () => {
  after(() => {
    domWindow.close()
  })

  test('keeps metadata in separate rows when performance data is absent', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <ModelCard
          model={{
            id: 1,
            model_name: 'seedance-2.0-mini',
            description:
              '<p>720p</p><p>比例 1:1 / 4:3 / 3:4 / 16:9 / 9:16 / 21:9</p>',
            quota_type: 1,
            model_ratio: 1,
            completion_ratio: 1,
            model_price: 0.44,
            billing_mode: 'per_second',
            enable_groups: ['勿选测试渠道'],
            supported_endpoint_types: ['openai-video', 'openai-video-retrieve'],
            tags: '比例 1:1 / 4:3 / 3:4 / 16:9 / 9:16 / 21:9',
          }}
          onClick={() => undefined}
        />
      )
    })

    const summary = container.querySelector('[data-slot="model-card-summary"]')
    const details = container.querySelector('[data-slot="model-card-details"]')
    const description = container.querySelector(
      '[data-slot="model-description-preview"]'
    )
    assert.ok(summary)
    assert.ok(details)
    assert.ok(description)
    assert.equal(summary.classList.contains('col-start-1'), true)
    assert.equal(summary.classList.contains('row-start-1'), true)
    assert.equal(details.classList.contains('col-start-1'), true)
    assert.equal(details.classList.contains('row-start-2'), true)
    assert.equal(
      description.textContent,
      '720p\n比例 1:1 / 4:3 / 3:4 / 16:9 / 9:16 / 21:9'
    )
    assert.equal(summary.textContent?.includes('勿选测试渠道'), true)
    assert.equal(
      details.textContent?.includes(
        '比例 1:1 / 4:3 / 3:4 / 16:9 / 9:16 / 21:9'
      ),
      true
    )
    assert.equal(
      details.querySelectorAll('[data-slot="model-card-endpoint"]').length,
      2
    )
    assert.equal(
      details.querySelectorAll('[data-slot="model-card-tag"]').length,
      1
    )
    assert.equal(details.textContent?.includes('1M'), false)

    await act(async () => root.unmount())
    container.remove()
  })
})
