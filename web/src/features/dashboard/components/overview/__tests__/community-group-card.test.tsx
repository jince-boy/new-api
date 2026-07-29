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

const domWindow = new Window({ url: 'https://console.example.com/dashboard' })
const domGlobals = [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'HTMLButtonElement',
  'HTMLImageElement',
  'Node',
  'NodeFilter',
  'Element',
  'SVGElement',
  'Event',
  'CustomEvent',
  'MutationObserver',
  'ResizeObserver',
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
const i18next = (await import('i18next')).default
const { initReactI18next } = await import('react-i18next')
await i18next.use(initReactI18next).init({
  lng: 'en',
  resources: {
    en: {
      translation: {
        'User community': 'User community',
        'Join the user community': 'Join the user community',
        'Connect with other users, share practical experience, and get help faster.':
          'Connect with other users, share practical experience, and get help faster.',
        'View QR code': 'View QR code',
        'Join the WeChat user group': 'Join the WeChat user group',
        'Scan with WeChat or long-press the QR code on mobile.':
          'Scan with WeChat or long-press the QR code on mobile.',
        'WeChat user group QR code': 'WeChat user group QR code',
        'Only signed-in users can view this QR code.':
          'Only signed-in users can view this QR code.',
        'The QR code expires at {{time}}': 'The QR code expires at {{time}}',
      },
    },
  },
})
const { CommunityGroupCardContent } = await import('../community-group-card')
const reactTestGlobals = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}
reactTestGlobals.IS_REACT_ACT_ENVIRONMENT = true

async function renderCard(
  props: React.ComponentProps<typeof CommunityGroupCardContent>
) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  await act(async () => root.render(<CommunityGroupCardContent {...props} />))
  return { container, root }
}

describe('CommunityGroupCard', () => {
  after(() => {
    domWindow.close()
  })

  test('stays hidden when the QR code is missing or expired', async () => {
    const rendered = await renderCard({
      qrCodeUrl: '',
      expiresAt: '2099-01-01T00:00:00Z',
    })
    assert.equal(rendered.container.textContent, '')

    await act(async () => {
      rendered.root.render(
        <CommunityGroupCardContent
          qrCodeUrl='/api/group-chat-qrcode'
          expiresAt='2020-01-01T00:00:00Z'
        />
      )
    })
    assert.equal(rendered.container.textContent, '')

    await act(async () => rendered.root.unmount())
    rendered.container.remove()
  })

  test('opens an accessible QR code dialog from the dashboard card', async () => {
    const rendered = await renderCard({
      qrCodeUrl: '/api/group-chat-qrcode',
      expiresAt: '2099-01-01T00:00:00Z',
      imageUrl: '/api/group-chat-qrcode',
    })
    const button = [...rendered.container.querySelectorAll('button')].find(
      (item) => item.textContent?.includes('View QR code')
    )
    assert.ok(button)

    await act(async () => button.click())

    const dialog = document.querySelector('[role="dialog"]')
    const image = document.querySelector<HTMLImageElement>(
      'img[alt="WeChat user group QR code"]'
    )
    assert.ok(dialog)
    assert.ok(image)
    assert.equal(new URL(image.src).pathname, '/api/group-chat-qrcode')

    await act(async () => rendered.root.unmount())
    rendered.container.remove()
  })
})
