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
const { ModelDescription } = await import('../model-description')
const reactTestGlobals = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}
reactTestGlobals.IS_REACT_ACT_ENVIRONMENT = true

async function renderDescription(
  props: React.ComponentProps<typeof ModelDescription>
) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)

  await act(async () => root.render(<ModelDescription {...props} />))

  return { container, root }
}

describe('ModelDescription', () => {
  after(() => {
    domWindow.close()
  })

  test('renders line breaks and safe custom HTML in the full description', async () => {
    const rendered = await renderDescription({
      content:
        'First line\nSecond line with <strong>emphasis</strong><script>bad()</script>',
    })

    assert.ok(rendered.container.querySelector('br'))
    assert.equal(
      rendered.container.querySelector('strong')?.textContent,
      'emphasis'
    )
    assert.equal(rendered.container.querySelector('script'), null)

    await act(async () => rendered.root.unmount())
    rendered.container.remove()
  })

  test('preserves block line breaks in sanitized card previews', async () => {
    const rendered = await renderDescription({
      content: '<p>720p</p>\n<p>比例 1:1 / 4:3 / 3:4 / 16:9 / 9:16 / 21:9</p>',
      variant: 'preview',
    })

    assert.equal(
      rendered.container.textContent,
      '720p\n比例 1:1 / 4:3 / 3:4 / 16:9 / 9:16 / 21:9'
    )
    assert.equal(rendered.container.querySelector('p'), null)

    await act(async () => rendered.root.unmount())
    rendered.container.remove()
  })
})
