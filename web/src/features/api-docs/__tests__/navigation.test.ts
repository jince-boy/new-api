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

import { buildDocumentationLinks } from '@/hooks/use-top-nav-links'
import { parseHeaderNavModules } from '@/lib/nav-modules'

const translate = (key: string) => key

describe('API documentation navigation', () => {
  test('links directly to the customer API page without external docs', () => {
    assert.deepEqual(
      buildDocumentationLinks(
        undefined,
        { enabled: true, openInNewTab: false },
        translate
      ),
      [{ title: 'API Reference', href: '/docs' }]
    )
  })

  test('keeps the customer API page visible beside configured external docs', () => {
    assert.deepEqual(
      buildDocumentationLinks(
        'https://docs.example.com',
        { enabled: true, openInNewTab: true },
        translate
      ),
      [
        { title: 'API Reference', href: '/docs' },
        {
          title: 'User Guide',
          href: 'https://docs.example.com',
          external: true,
          openInNewTab: true,
        },
      ]
    )
  })

  test('keeps the API reference visible when the external guide is disabled', () => {
    assert.deepEqual(
      buildDocumentationLinks(
        'https://docs.example.com',
        { enabled: false, openInNewTab: true },
        translate
      ),
      [{ title: 'API Reference', href: '/docs' }]
    )
  })

  test('keeps legacy boolean guide settings compatible', () => {
    assert.deepEqual(parseHeaderNavModules('{"docs":false}').docs, {
      enabled: false,
      openInNewTab: false,
    })
  })

  test('reads the configured guide opening behavior', () => {
    assert.deepEqual(
      parseHeaderNavModules('{"docs":{"enabled":true,"openInNewTab":true}}')
        .docs,
      {
        enabled: true,
        openInNewTab: true,
      }
    )
  })
})
