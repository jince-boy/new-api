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

  test('opens task details for a successful video without rendering a video link', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <TaskDetailsCell
          isAdmin={false}
          log={{
            id: 1,
            user_id: 2,
            platform: 'advanced_custom',
            task_id: 'task_public_video',
            action: 'generate',
            channel_id: 3,
            submit_time: 100,
            finish_time: 105,
            progress: '100%',
            status: 'SUCCESS',
            fail_reason: '',
            group: 'default',
            quota: 1200,
            properties: {
              origin_model_name: 'video-public-model',
              upstream_model_name: 'provider-secret-model',
            },
            data: { status: 'completed', resolution: '480p' },
          }}
        />
      )
    })

    const button = container.querySelector('button')
    assert.ok(button)
    assert.match(button.textContent || '', /View/)
    assert.equal(container.querySelector('a'), null)

    await act(async () => button.click())

    const dialog = document.querySelector('[role="dialog"]')
    assert.ok(dialog)
    assert.match(dialog.textContent || '', /task_public_video/)
    assert.match(dialog.textContent || '', /video-public-model/)
    assert.match(dialog.textContent || '', /default/)
    assert.match(dialog.textContent || '', /5s/)
    assert.doesNotMatch(dialog.textContent || '', /provider-secret-model/)
    assert.doesNotMatch(dialog.textContent || '', /480p/)
    assert.doesNotMatch(dialog.textContent || '', /completed/)
    assert.equal(dialog.querySelector('video'), null)
    assert.equal(dialog.querySelector('a'), null)

    await act(async () => root.unmount())
    container.remove()
  })

  test('hides failure and upstream details from ordinary users', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <TaskDetailsCell
          isAdmin={false}
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
            properties: {
              origin_model_name: 'video-public-model',
              upstream_model_name: 'provider-secret-model',
            },
            data: { provider_trace: 'private-trace' },
          }}
        />
      )
    })

    const button = container.querySelector('button')
    assert.ok(button)
    await act(async () => button.click())

    const dialog = document.querySelector('[role="dialog"]')
    assert.ok(dialog)
    assert.match(dialog.textContent || '', /video-public-model/)
    assert.doesNotMatch(dialog.textContent || '', /content rejected/)
    assert.doesNotMatch(dialog.textContent || '', /provider-secret-model/)
    assert.doesNotMatch(dialog.textContent || '', /private-trace/)

    await act(async () => root.unmount())
    container.remove()
  })

  test('keeps details available while a task is still running', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <TaskDetailsCell
          isAdmin={false}
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

    const button = container.querySelector('button')
    assert.ok(button)
    assert.match(button.textContent || '', /View/)
    assert.equal(container.querySelector('a'), null)

    await act(async () => button.click())
    const dialog = document.querySelector('[role="dialog"]')
    assert.ok(dialog)
    assert.match(dialog.textContent || '', /task_running_video/)
    assert.equal(dialog.querySelector('video'), null)

    await act(async () => root.unmount())
    container.remove()
  })

  test('keeps full task diagnostics available to administrators', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <TaskDetailsCell
          isAdmin
          log={{
            id: 4,
            user_id: 2,
            username: 'admin-visible-user',
            platform: 'advanced_custom',
            task_id: 'task_admin_video',
            action: 'textGenerate',
            channel_id: 3,
            submit_time: 100,
            finish_time: 101,
            status: 'FAILURE',
            fail_reason: 'content rejected',
            properties: {
              origin_model_name: 'video-public-model',
              upstream_model_name: 'provider-secret-model',
            },
            data: { provider_trace: 'private-trace' },
          }}
        />
      )
    })

    const button = container.querySelector('button')
    assert.ok(button)
    await act(async () => button.click())

    const dialog = document.querySelector('[role="dialog"]')
    assert.ok(dialog)
    assert.match(dialog.textContent || '', /provider-secret-model/)
    assert.match(dialog.textContent || '', /content rejected/)
    assert.match(dialog.textContent || '', /private-trace/)

    await act(async () => root.unmount())
    container.remove()
  })
})
