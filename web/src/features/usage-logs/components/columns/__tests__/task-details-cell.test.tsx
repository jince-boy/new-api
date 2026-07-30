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
const { TaskDetailsCell } = await import('../task-logs-columns')
const reactTestGlobals = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}
reactTestGlobals.IS_REACT_ACT_ENVIRONMENT = true

describe('TaskDetailsCell', () => {
  after(() => {
    domWindow.close()
  })

  test('shows the protected preview link for successful video tasks without a legacy URL in fail_reason', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <TaskDetailsCell
          log={{
            id: 1,
            user_id: 2,
            platform: 'advanced_custom',
            task_id: 'task_public_video',
            action: 'generate',
            channel_id: 3,
            submit_time: 100,
            progress: '100%',
            status: 'SUCCESS',
            fail_reason: '',
          }}
        />
      )
    })

    const link = container.querySelector('a')
    assert.ok(link)
    assert.equal(
      link.getAttribute('href'),
      '/v1/videos/task_public_video/content'
    )
    assert.match(link.textContent || '', /Click to preview video/)

    await act(async () => root.unmount())
    container.remove()
  })

  test('shows the mapped failure reason for failed tasks', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <TaskDetailsCell
          log={{
            id: 2,
            user_id: 2,
            platform: 'advanced_custom',
            task_id: 'task_failed_video',
            action: 'textGenerate',
            channel_id: 3,
            submit_time: 100,
            finish_time: 101,
            progress: '100%',
            status: 'FAILURE',
            fail_reason: 'content rejected',
          }}
        />
      )
    })

    assert.match(container.textContent || '', /content rejected/)
    assert.ok(container.querySelector('button'))

    await act(async () => root.unmount())
    container.remove()
  })

  test('shows a placeholder while a task has no result or failure reason', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <TaskDetailsCell
          log={{
            id: 3,
            user_id: 2,
            platform: 'advanced_custom',
            task_id: 'task_running_video',
            action: 'textGenerate',
            channel_id: 3,
            submit_time: 100,
            progress: '50%',
            status: 'IN_PROGRESS',
            fail_reason: '',
          }}
        />
      )
    })

    assert.equal((container.textContent || '').trim(), '-')
    assert.equal(container.querySelector('a'), null)
    assert.equal(container.querySelector('button'), null)

    await act(async () => root.unmount())
    container.remove()
  })
})
