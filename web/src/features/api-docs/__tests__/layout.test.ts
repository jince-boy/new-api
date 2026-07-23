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

import { apiDocsLayoutClasses } from '../lib/layout'

describe('API documentation responsive layout', () => {
  test('aligns the documentation toolbar and content to the public page width', () => {
    const containerClasses = apiDocsLayoutClasses.pageContainer.split(' ')
    const classes = apiDocsLayoutClasses.contentGrid.split(' ')

    assert.ok(containerClasses.includes('max-w-7xl'))
    assert.ok(classes.includes('max-w-7xl'))
    assert.ok(classes.includes('grid'))
    assert.ok(classes.includes('w-full'))
    assert.ok(classes.includes('lg:grid-cols-[240px_minmax(0,1fr)]'))
  })

  test('keeps the desktop navigation below the fixed documentation toolbar', () => {
    assert.ok(apiDocsLayoutClasses.desktopSidebar.split(' ').includes('hidden'))
    assert.ok(
      apiDocsLayoutClasses.desktopSidebar.split(' ').includes('lg:block')
    )
    assert.ok(
      apiDocsLayoutClasses.desktopSidebarContent.split(' ').includes('top-36')
    )
  })
})
