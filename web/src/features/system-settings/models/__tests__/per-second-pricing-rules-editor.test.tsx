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
  'ResizeObserver',
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
const { createInstance } = await import('i18next')
const { I18nextProvider, initReactI18next } = await import('react-i18next')
const { PerSecondPricingRulesEditor } =
  await import('../per-second-pricing-rules-editor')
const reactTestGlobals = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}
reactTestGlobals.IS_REACT_ACT_ENVIRONMENT = true

describe('PerSecondPricingRulesEditor', () => {
  after(() => {
    domWindow.close()
  })

  test('shows the translated operator label instead of its stored value', async () => {
    const i18n = createInstance()
    await i18n.use(initReactI18next).init({
      lng: 'zh',
      resources: {
        zh: {
          translation: {
            Equals: '等于',
          },
        },
      },
    })
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <I18nextProvider i18n={i18n}>
          <PerSecondPricingRulesEditor
            rules={[
              {
                id: 'rule-1',
                name: '720p',
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
            ]}
            onChange={() => {}}
          />
        </I18nextProvider>
      )
    })

    const trigger = container.querySelector('[data-slot="select-trigger"]')
    assert.ok(trigger)
    assert.match(trigger.textContent || '', /等于/)
    assert.doesNotMatch(trigger.textContent || '', /^eq$/)

    await act(async () => root.unmount())
    container.remove()
  })
})
