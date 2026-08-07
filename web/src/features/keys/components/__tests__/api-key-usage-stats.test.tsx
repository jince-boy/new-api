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
  'SVGElement',
  'Node',
  'Element',
  'Event',
  'CustomEvent',
  'MutationObserver',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'getComputedStyle',
] as const

for (const key of domGlobals) {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    value: domWindow[key],
  })
}

const { act } = await import('react')
const { createRoot } = await import('react-dom/client')
const { createInstance } = await import('i18next')
const { I18nextProvider, initReactI18next } = await import('react-i18next')
const { ApiKeyUsageStats } = await import('../api-key-usage-stats')
const { formatLogQuota } = await import('@/lib/format')

const i18n = createInstance()
await i18n.use(initReactI18next).init({
  lng: 'en',
  resources: {
    en: {
      translation: {
        Today: 'Today',
        'Last 30 days': 'Last 30 days',
      },
    },
  },
})

const reactTestGlobals = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}
reactTestGlobals.IS_REACT_ACT_ENVIRONMENT = true

describe('API key usage stats', () => {
  after(() => {
    domWindow.close()
  })

  test('shows billed amounts for today and the last 30 days', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <I18nextProvider i18n={i18n}>
          <ApiKeyUsageStats
            usage={{
              today: { quota: 12_500 },
              last_30_days: { quota: 250_000 },
            }}
          />
        </I18nextProvider>
      )
    })

    const text = container.textContent ?? ''
    assert.match(text, /Today/)
    assert.match(text, /Last 30 days/)
    assert.equal(text.includes(formatLogQuota(12_500)), true)
    assert.equal(text.includes(formatLogQuota(250_000)), true)
    assert.equal(text.includes('Tokens'), false)

    const stats = container.querySelector('[data-slot="api-key-usage-stats"]')
    assert.ok(stats)
    assert.equal(stats.classList.contains('flex-col'), true)
    assert.equal(stats.classList.contains('min-w-[220px]'), true)
    assert.equal(stats.classList.contains('py-1'), true)

    const periods = container.querySelectorAll(
      '[data-slot="api-key-usage-period"]'
    )
    assert.equal(periods.length, 2)
    for (const period of periods) {
      assert.equal(period.classList.contains('text-xs'), true)
      assert.equal(period.classList.contains('h-5'), true)
    }

    await act(async () => root.unmount())
    container.remove()
  })

  test('shows zero amounts when usage is unavailable', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <I18nextProvider i18n={i18n}>
          <ApiKeyUsageStats />
        </I18nextProvider>
      )
    })

    const periods = container.querySelectorAll(
      '[data-slot="api-key-usage-period"]'
    )
    assert.equal(periods.length, 2)
    for (const period of periods) {
      assert.equal(period.textContent?.includes(formatLogQuota(0)), true)
    }

    await act(async () => root.unmount())
    container.remove()
  })
})
