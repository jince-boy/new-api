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
        'Submit headers code': '提交请求头代码',
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
  language = 'en',
  onChange: (patch: Partial<AdvancedCustomRoute>) => void = noop
): Promise<RenderedEditor> {
  await i18n.changeLanguage(language)
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)

  await act(async () => {
    root.render(
      <I18nextProvider i18n={i18n}>
        <AdvancedCustomTaskEditor route={route} onChange={onChange} />
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

  test('shows translated code fields in a Chinese async editor', async () => {
    const task = createAdvancedCustomTask()
    const rendered = await renderEditor({ ...baseRoute(), task }, 'zh')
    const visibleText = rendered.container.textContent || ''

    assert.equal(visibleText.includes('提交请求头代码'), true)
    assert.equal(visibleText.includes('Submit headers code'), false)

    await unmountEditor(rendered)
  })

  test('documents the two request variables and row_response result contracts', async () => {
    const task = createAdvancedCustomTask()
    const rendered = await renderEditor({ ...baseRoute(), task })
    const visibleText = rendered.container.textContent || ''

    assert.equal(visibleText.includes('Submit headers code'), true)
    assert.equal(visibleText.includes('Submit body code'), true)
    assert.equal(visibleText.includes('Poll headers code'), true)
    assert.equal(visibleText.includes('Poll body code'), true)
    assert.equal(
      visibleText.includes('The only variables are header and body.'),
      true
    )
    assert.equal(visibleText.includes('row_response'), true)
    assert.equal(visibleText.includes('task_id is required'), true)
    assert.equal(visibleText.includes('result_url is required'), true)
    assert.equal(visibleText.includes('Submit request expression'), false)

    await unmountEditor(rendered)
  })

  test('syntax-highlights JavaScript and TypeScript code', async () => {
    const task = createAdvancedCustomTask()
    task.headers_script = `const token: string = header.key\nreturn { token }`
    const rendered = await renderEditor({ ...baseRoute(), task })
    const highlightedTokens = rendered.container.querySelectorAll(
      '.cm-content span[class]'
    )

    assert.equal(highlightedTokens.length > 0, true)

    await unmountEditor(rendered)
  })

  test('renders multiline placeholders with matching line numbers without saving them', async () => {
    let changeCount = 0
    const rendered = await renderEditor(
      {
        ...baseRoute(),
        task: createAdvancedCustomTask(),
      },
      'en',
      () => {
        changeCount += 1
      }
    )
    const editor = rendered.container.querySelector(
      '[role="textbox"][aria-label="Poll response code"]'
    )

    assert.ok(editor)
    const placeholder = editor.parentElement?.querySelector(
      '[data-code-placeholder="true"]'
    )
    const placeholderLineNumbers =
      placeholder?.querySelector('[data-code-placeholder-line-numbers="true"]')
        ?.textContent || ''
    const placeholderCode = placeholder?.querySelector('pre')?.textContent || ''

    assert.ok(placeholder)
    assert.equal(editor.querySelectorAll('.cm-line').length, 1)
    assert.equal(
      placeholderLineNumbers.split('\n').length,
      placeholderCode.split('\n').length
    )

    const content = editor.querySelector<HTMLElement>('.cm-content')
    assert.ok(content)
    await act(async () => content.focus())

    assert.equal(
      editor.parentElement?.querySelector('[data-code-placeholder="true"]'),
      null
    )
    assert.equal(changeCount, 0)

    await unmountEditor(rendered)
  })

  test('aligns entered code line numbers and offers pass-through actions', async () => {
    const task = createAdvancedCustomTask()
    task.headers_script = `return { token: header.key }`
    task.body_script = `return { prompt: body.prompt }`
    task.body_template = { prompt: '{request.prompt}' }
    task.request_mode = 'template'
    task.poll.headers_script = `return { token: header.key }`
    task.poll.body_script = `return { task_id: body.task_id }`
    task.poll.body_template = { task_id: '{task_id}' }
    task.submit_response.response_script = '第一行\n第二行'
    const patches: Partial<AdvancedCustomRoute>[] = []
    const rendered = await renderEditor(
      { ...baseRoute(), task },
      'en',
      (patch) => patches.push(patch)
    )
    const editor = rendered.container.querySelector(
      '[role="textbox"][aria-label="Submit response code"]'
    )
    const passThroughButtons = [
      ...rendered.container.querySelectorAll('button'),
    ].filter(
      (button) =>
        button.textContent?.trim() === 'Pass through' &&
        !button.matches('[data-slot="select-trigger"]')
    )
    const lineNumbers = [
      ...(editor?.querySelectorAll(
        '.cm-lineNumbers .cm-gutterElement:not([style*="visibility: hidden"])'
      ) || []),
    ].filter((element) => /^\d+$/.test(element.textContent || ''))
    const gutters = editor?.querySelector<HTMLElement>('.cm-gutters')

    assert.ok(editor)
    assert.ok(gutters)
    assert.equal(editor.querySelectorAll('.cm-line').length, 2)
    assert.equal(lineNumbers.length, 2)
    assert.equal(getComputedStyle(gutters).paddingTop, '0px')
    assert.equal(passThroughButtons.length, 4)
    await act(async () => passThroughButtons[0].click())
    assert.equal(patches.at(-1)?.task?.headers_script, undefined)
    await act(async () => passThroughButtons[1].click())
    assert.equal(patches.at(-1)?.task?.body_script, undefined)
    assert.equal(patches.at(-1)?.task?.body_template, undefined)
    assert.equal(patches.at(-1)?.task?.request_mode, undefined)
    await act(async () => passThroughButtons[2].click())
    assert.equal(patches.at(-1)?.task?.poll.headers_script, undefined)
    await act(async () => passThroughButtons[3].click())
    assert.equal(patches.at(-1)?.task?.poll.body_script, undefined)
    assert.equal(patches.at(-1)?.task?.poll.body_template, undefined)

    await unmountEditor(rendered)
  })
})
