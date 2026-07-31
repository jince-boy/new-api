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

import {
  buildCanvasLinks,
  buildUserGuideLinks,
} from '@/hooks/use-top-nav-links'

import { parseHeaderNavModules, serializeHeaderNavModules } from '../config'

describe('header navigation configuration', () => {
  test('upgrades a legacy user guide boolean without changing its state', () => {
    const config = parseHeaderNavModules('{"docs":false}')

    assert.deepEqual(config.docs, {
      enabled: false,
      openInNewTab: false,
    })
  })

  test('preserves user guide visibility and opening behavior when serialized', () => {
    const config = parseHeaderNavModules(
      '{"docs":{"enabled":true,"openInNewTab":true}}'
    )

    assert.deepEqual(JSON.parse(serializeHeaderNavModules(config)).docs, {
      enabled: true,
      openInNewTab: true,
    })
  })

  test('preserves canvas URL and opening behavior when serialized', () => {
    const config = parseHeaderNavModules(
      '{"canvas":{"enabled":true,"url":"https://canvas.example.com","openInNewTab":true}}'
    )

    assert.deepEqual(JSON.parse(serializeHeaderNavModules(config)).canvas, {
      enabled: true,
      url: 'https://canvas.example.com',
      openInNewTab: true,
    })
  })

  test('builds only the external user guide link, never the retired API reference', () => {
    const links = buildUserGuideLinks(
      'https://docs.example.com/guide',
      { enabled: true, openInNewTab: true },
      (key) => key
    )

    assert.deepEqual(links, [
      {
        title: 'User Guide',
        href: 'https://docs.example.com/guide',
        external: true,
        openInNewTab: true,
      },
    ])
    assert.equal(
      links.some((link) => link.href === '/docs'),
      false
    )
  })

  test('hides the user guide when its navigation switch is disabled', () => {
    const links = buildUserGuideLinks(
      'https://docs.example.com/guide',
      { enabled: false, openInNewTab: false },
      (key) => key
    )

    assert.deepEqual(links, [])
  })

  test('builds a canvas link only for an enabled valid URL', () => {
    assert.deepEqual(
      buildCanvasLinks(
        {
          enabled: true,
          url: 'https://canvas.example.com/workspace',
          openInNewTab: false,
        },
        (key) => key
      ),
      [
        {
          title: 'Canvas',
          href: 'https://canvas.example.com/workspace',
          external: true,
          openInNewTab: false,
        },
      ]
    )

    assert.deepEqual(
      buildCanvasLinks(
        { enabled: true, url: '/canvas', openInNewTab: false },
        (key) => key
      ),
      []
    )

    assert.deepEqual(
      buildCanvasLinks(
        { enabled: true, url: 'https://', openInNewTab: false },
        (key) => key
      ),
      []
    )
  })
})
