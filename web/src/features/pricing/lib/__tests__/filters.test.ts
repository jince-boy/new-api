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

import { parseTags } from '../filters'

describe('pricing model tags', () => {
  test('keeps spaces and slash-separated values inside one configured tag', () => {
    const tags = parseTags('比例 21:9 / 16:9 / 4:3 / 1:1 / 3:4 / 9:16')

    assert.deepEqual(tags, ['比例 21:9 / 16:9 / 4:3 / 1:1 / 3:4 / 9:16'])
  })

  test('uses commas as the persisted tag boundary', () => {
    const tags = parseTags('图像生成, 比例 21:9 / 16:9')

    assert.deepEqual(tags, ['图像生成', '比例 21:9 / 16:9'])
  })
})
