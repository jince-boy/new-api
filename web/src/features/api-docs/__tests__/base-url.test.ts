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

import { resolveApiDocsBaseUrl } from '../lib/base-url'

describe('API documentation base URL', () => {
  test('uses the configured server address instead of the browser origin', () => {
    const baseUrl = resolveApiDocsBaseUrl(
      { server_address: ' https://api.example.com/ ' },
      'https://console.example.com'
    )

    assert.equal(baseUrl, 'https://api.example.com')
  })

  test('supports the nested status response shape', () => {
    const baseUrl = resolveApiDocsBaseUrl(
      { data: { server_address: 'https://gateway.example.com' } },
      'https://console.example.com'
    )

    assert.equal(baseUrl, 'https://gateway.example.com')
  })

  test('falls back to the browser origin when no server address is configured', () => {
    const baseUrl = resolveApiDocsBaseUrl(
      { server_address: '   ' },
      'https://console.example.com'
    )

    assert.equal(baseUrl, 'https://console.example.com')
  })
})
