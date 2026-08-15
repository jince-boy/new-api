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
Object.defineProperty(domWindow.Element.prototype, 'getAnimations', {
  configurable: true,
  value: () => [],
})

const { act } = await import('react')
const { createRoot } = await import('react-dom/client')
const i18next = (await import('i18next')).default
const { initReactI18next } = await import('react-i18next')
await i18next.use(initReactI18next).init({
  lng: 'en',
  resources: {
    en: {
      translation: {
        Announcements: 'Announcements',
        'Latest platform updates and notices':
          'Latest platform updates and notices',
        'No announcements at this time': 'No announcements at this time',
        'View details': 'View details',
        'Published:': 'Published:',
      },
    },
  },
})
const { AnnouncementsPanelContent } = await import('../announcements-panel')
const reactTestGlobals = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}
reactTestGlobals.IS_REACT_ACT_ENVIRONMENT = true

describe('AnnouncementsPanel', () => {
  after(() => {
    domWindow.close()
  })

  test('keeps the overview compact while exposing announcement details', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    const announcements = Array.from({ length: 5 }, (_, index) => ({
      id: index + 1,
      content: `Announcement ${index + 1}`,
      publishDate: `2026-08-${String(index + 1).padStart(2, '0')}T00:00:00Z`,
      type: 'default' as const,
    }))

    await act(async () => {
      root.render(<AnnouncementsPanelContent list={announcements} />)
    })

    const panel = container.querySelector('section')
    assert.ok(panel)
    assert.ok(panel.classList.contains('rounded-2xl'))
    assert.ok(panel.firstElementChild?.classList.contains('min-h-18'))

    const visibleItems = [...container.querySelectorAll('button')].filter(
      (button) => button.textContent?.includes('Announcement')
    )
    assert.equal(visibleItems.length, 3)
    assert.match(container.textContent ?? '', /Announcement 1/)
    assert.match(container.textContent ?? '', /Announcement 3/)
    assert.doesNotMatch(container.textContent ?? '', /Announcement 4/)
    const secondAnnouncement = visibleItems.at(1)
    assert.ok(secondAnnouncement instanceof HTMLButtonElement)

    await act(async () => {
      secondAnnouncement.click()
    })

    const dialog = document.querySelector('[role="dialog"]')
    assert.ok(dialog)
    assert.match(dialog.textContent ?? '', /Announcement 2/)

    await act(async () => root.unmount())
    container.remove()
  })
})
