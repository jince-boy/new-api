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

import { resolveApiBaseUrls } from '../base-urls'

describe('API base URLs', () => {
  test('builds Claude and OpenAI URLs from the configured server address', () => {
    const urls = resolveApiBaseUrls(
      ' https://axisapi.cn/// ',
      'https://fallback.example.com'
    )

    assert.deepEqual(urls, {
      claude: 'https://axisapi.cn',
      openai: 'https://axisapi.cn/v1',
    })
  })

  test('uses the current site origin when the server address is empty', () => {
    const urls = resolveApiBaseUrls('', 'https://current.example.com')

    assert.deepEqual(urls, {
      claude: 'https://current.example.com',
      openai: 'https://current.example.com/v1',
    })
  })
})
