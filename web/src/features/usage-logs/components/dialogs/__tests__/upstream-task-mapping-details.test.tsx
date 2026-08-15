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
const { UpstreamErrorDetails, UpstreamTaskMappingDetails } =
  await import('../details-dialog')
const reactTestGlobals = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}
reactTestGlobals.IS_REACT_ACT_ENVIRONMENT = true

describe('UpstreamTaskMappingDetails', () => {
  after(() => {
    domWindow.close()
  })

  test('shows private upstream response diagnostics for an upstream failure', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <UpstreamTaskMappingDetails
          diagnostics={{
            http_status: 400,
            upstream_status: 'failed',
            mapped_status: 'FAILURE',
            status_mapping_applied: true,
            error_path_matched: true,
            content_type: 'application/json',
            body: '{"error":"upstream balance exhausted"}',
          }}
        />
      )
    })

    const text = container.textContent || ''
    assert.match(text, /Upstream task mapping/)
    assert.match(text, /400/)
    assert.match(text, /failed/)
    assert.match(text, /FAILURE/)
    assert.match(text, /Status mapping appliedYes/)
    assert.match(text, /Error path matchedYes/)
    assert.match(text, /Content typeapplication\/json/)
    assert.match(text, /Response body.*upstream balance exhausted/)

    await act(async () => root.unmount())
    container.remove()
  })

  test('shows channel and response body only in the admin diagnostics component', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <UpstreamErrorDetails
          diagnostics={{
            attempt: 2,
            channel_id: 18,
            channel_name: 'private-channel',
            status_code: 403,
            content_type: 'application/json',
            body: '{"error":"insufficient balance"}',
            stream: false,
          }}
        />
      )
    })

    const text = container.textContent || ''
    assert.match(text, /Upstream error details/)
    assert.match(text, /private-channel/)
    assert.match(text, /403/)
    assert.match(text, /insufficient balance/)

    await act(async () => root.unmount())
    container.remove()
  })
})
