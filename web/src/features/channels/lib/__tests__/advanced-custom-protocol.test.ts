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
import { describe, test } from 'node:test'

import type { AdvancedCustomConfig } from '../../types'
import {
  createAdvancedCustomTask,
  normalizeAdvancedCustomConfig,
  validateAdvancedCustomConfig,
} from '../advanced-custom'

describe('advanced custom configurable protocols', () => {
  test('preserves async task and download configuration during normalization', () => {
    const config: AdvancedCustomConfig = {
      advanced_routes: [
        {
          incoming_path: '/v1/videos',
          upstream_path: '/v1/videos/generations',
          converter: 'none',
          headers: { 'X-Version': '2026-01-01' },
          task: {
            ...createAdvancedCustomTask(),
            download: {
              auth: {
                type: 'header',
                name: 'X-Download-Key',
                value: '{api_key}',
              },
            },
          },
        },
      ],
    }

    const normalized = normalizeAdvancedCustomConfig(config)

    assert.equal(
      normalized.advanced_routes?.[0].task?.poll.upstream_path,
      '/v1/videos/tasks/{task_id}'
    )
    assert.equal(
      normalized.advanced_routes?.[0].task?.download?.auth?.name,
      'X-Download-Key'
    )
    assert.deepEqual(normalized.advanced_routes?.[0].headers, {
      'X-Version': '2026-01-01',
    })
    assert.equal(
      normalized.advanced_routes?.[0].task?.submit_response.error_path,
      'error.message'
    )
    assert.equal(
      normalized.advanced_routes?.[0].task?.submit_response.status_map?.failed,
      'FAILURE'
    )
  })

  test('accepts synchronous JSON templates for non-streaming model routes', () => {
    const config: AdvancedCustomConfig = {
      advanced_routes: [
        {
          incoming_path: '/v1/images/generations',
          upstream_path: 'https://provider.example/generate',
          converter: 'none',
          request_body_template: {
            engine: '{model}',
            text: '{request.prompt}',
          },
          response_body_template: {
            data: '{response.outputs}',
          },
        },
      ],
    }

    assert.equal(validateAdvancedCustomConfig(config), null)
    assert.deepEqual(
      normalizeAdvancedCustomConfig(config).advanced_routes?.[0]
        .request_body_template,
      { engine: '{model}', text: '{request.prompt}' }
    )
  })

  test('rejects an async route whose poll URL cannot receive the task ID', () => {
    const task = createAdvancedCustomTask()
    task.poll.upstream_path = '/v1/videos/tasks'
    const config: AdvancedCustomConfig = {
      advanced_routes: [
        {
          incoming_path: '/v1/videos',
          upstream_path: '/v1/videos/generations',
          converter: 'none',
          task,
        },
      ],
    }

    assert.deepEqual(validateAdvancedCustomConfig(config), {
      routeIndex: 0,
      message: 'Poll upstream path must contain {task_id}',
    })
  })

  test('rejects an invalid submit status mapping', () => {
    const task = createAdvancedCustomTask()
    task.submit_response.status_map = { failed: 'SUCCESS' }
    Object.assign(task.submit_response.status_map, { broken: 'INVALID' })
    const config: AdvancedCustomConfig = {
      advanced_routes: [
        {
          incoming_path: '/v1/videos',
          upstream_path: '/v1/videos/generations',
          converter: 'none',
          task,
        },
      ],
    }

    assert.deepEqual(validateAdvancedCustomConfig(config), {
      routeIndex: 0,
      message: 'Submit status map contains an invalid status',
    })
  })

  test('preserves and validates safe business error messages', () => {
    const task = createAdvancedCustomTask()
    task.submit_response.error_code_path = 'code'
    task.submit_response.error_message_map = {
      '-2000': 'Invalid request parameters.',
      '-2009': 'The service is temporarily unavailable.',
    }
    task.submit_response.default_error_message =
      'The request could not be processed.'
    const config: AdvancedCustomConfig = {
      advanced_routes: [
        {
          incoming_path: '/v1/videos',
          upstream_path: '/v1/videos/generations',
          converter: 'none',
          task,
        },
      ],
    }

    assert.equal(validateAdvancedCustomConfig(config), null)
    assert.deepEqual(
      normalizeAdvancedCustomConfig(config).advanced_routes?.[0].task
        ?.submit_response.error_message_map,
      task.submit_response.error_message_map
    )
  })

  test('requires an error code path for safe business error messages', () => {
    const task = createAdvancedCustomTask()
    task.submit_response.error_message_map = {
      '-2000': 'Invalid request parameters.',
    }
    const config: AdvancedCustomConfig = {
      advanced_routes: [
        {
          incoming_path: '/v1/videos',
          upstream_path: '/v1/videos/generations',
          converter: 'none',
          task,
        },
      ],
    }

    assert.deepEqual(validateAdvancedCustomConfig(config), {
      routeIndex: 0,
      message:
        'Business error code path is required when safe error messages are configured',
    })
  })

  test('rejects header authentication values that can split HTTP headers', () => {
    const config: AdvancedCustomConfig = {
      advanced_routes: [
        {
          incoming_path: '/v1/images/generations',
          upstream_path: '/generate',
          converter: 'none',
          auth: {
            type: 'header',
            name: 'Authorization',
            value: 'Bearer {api_key}\r\nX-Injected: true',
          },
        },
      ],
    }

    assert.deepEqual(validateAdvancedCustomConfig(config), {
      routeIndex: 0,
      message: 'Header name or value is invalid',
    })
  })
})
