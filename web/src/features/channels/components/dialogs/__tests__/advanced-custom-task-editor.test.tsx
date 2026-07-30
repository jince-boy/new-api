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

import type { AdvancedCustomRoute } from '../../../types'

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
const { AdvancedCustomTaskEditor } =
  await import('../advanced-custom-task-editor')
const { createAdvancedCustomTask } =
  await import('../../../lib/advanced-custom')

const i18n = createInstance()
await i18n.use(initReactI18next).init({
  lng: 'en',
  resources: {
    en: { translation: {} },
    zh: {
      translation: {
        'JSON template': 'JSON 模板',
        'Pass through': '原样透传',
      },
    },
  },
  returnNull: false,
})

const reactTestGlobals = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}
reactTestGlobals.IS_REACT_ACT_ENVIRONMENT = true

const noop = () => {}

type RenderedEditor = {
  container: HTMLDivElement
  root: ReturnType<typeof createRoot>
}

async function renderEditor(
  route: AdvancedCustomRoute,
  language = 'en'
): Promise<RenderedEditor> {
  await i18n.changeLanguage(language)
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)

  await act(async () => {
    root.render(
      <I18nextProvider i18n={i18n}>
        <AdvancedCustomTaskEditor route={route} onChange={noop} />
      </I18nextProvider>
    )
  })

  return { container, root }
}

async function unmountEditor(rendered: RenderedEditor) {
  await act(async () => rendered.root.unmount())
  rendered.container.remove()
}

function baseRoute(): AdvancedCustomRoute {
  return {
    incoming_path: '/v1/videos',
    upstream_path: '/v1/videos/generations',
    converter: 'none',
  }
}

describe('advanced custom protocol editor layout', () => {
  after(() => {
    domWindow.close()
  })

  test('keeps optional mapping collapsed for a direct forwarding route', async () => {
    const rendered = await renderEditor(baseRoute())
    const trigger = rendered.container.querySelector(
      '[data-slot="accordion-trigger"]'
    )

    assert.ok(trigger)
    assert.equal(trigger.getAttribute('aria-expanded'), 'false')
    assert.equal(
      trigger.textContent?.includes('Request, response and task mapping'),
      true
    )
    assert.equal(trigger.textContent?.includes('Native / pass-through'), true)

    await unmountEditor(rendered)
  })

  test('opens mapping when synchronous templates are already configured', async () => {
    const rendered = await renderEditor({
      ...baseRoute(),
      request_body_template: { prompt: '{request.prompt}' },
    })
    const trigger = rendered.container.querySelector(
      '[data-slot="accordion-trigger"]'
    )

    assert.ok(trigger)
    assert.equal(trigger.getAttribute('aria-expanded'), 'true')
    assert.equal(
      trigger.textContent?.includes('Synchronous JSON mapping'),
      true
    )

    await unmountEditor(rendered)
  })

  test('shows the submit, poll, and protected delivery workflow for async routes', async () => {
    const rendered = await renderEditor({
      ...baseRoute(),
      task: createAdvancedCustomTask(),
    })
    const visibleText = rendered.container.textContent || ''

    assert.equal(visibleText.includes('Submit and get task ID'), true)
    assert.equal(visibleText.includes('Poll status until complete'), true)
    assert.equal(visibleText.includes('Return protected result URL'), true)
    assert.equal(visibleText.includes('Use immediate response instead'), true)

    await unmountEditor(rendered)
  })

  test('shows the translated request mapping value in a Chinese async editor', async () => {
    const task = createAdvancedCustomTask()
    task.request_mode = 'template'
    const rendered = await renderEditor({ ...baseRoute(), task }, 'zh')
    const selectedValues = new Set(
      [
        ...rendered.container.querySelectorAll('[data-slot="select-value"]'),
      ].map((element) => element.textContent?.trim())
    )

    assert.equal(selectedValues.has('JSON 模板'), true)
    assert.equal(selectedValues.has('JSON template'), false)

    await unmountEditor(rendered)
  })

  test('lists request, task, and authentication variables by async field', async () => {
    const task = createAdvancedCustomTask()
    task.request_mode = 'template'
    const rendered = await renderEditor({ ...baseRoute(), task })
    const visibleText = rendered.container.textContent || ''

    assert.equal(visibleText.includes('{request.<path>}'), true)
    assert.equal(visibleText.includes('{public_task_id}'), true)
    assert.equal(visibleText.includes('{task_id}'), true)
    assert.equal(visibleText.includes('{api_key}'), true)
    assert.equal(visibleText.includes('Submit request expression'), true)
    assert.equal(visibleText.includes('Submit response expression'), true)
    assert.equal(visibleText.includes('Poll request expression'), true)
    assert.equal(visibleText.includes('Poll response expression'), true)

    await unmountEditor(rendered)
  })
})
