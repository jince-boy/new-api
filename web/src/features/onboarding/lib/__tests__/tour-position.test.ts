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
import { afterEach, describe, expect, it } from 'vitest'

import { getTourCardPosition, getTourTarget } from '../tour-position'

function addTarget(rect: Partial<DOMRect>) {
  const element = document.createElement('button')
  element.dataset.tour = 'target'
  element.getBoundingClientRect = () =>
    ({
      x: 0,
      y: 0,
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      width: 0,
      height: 0,
      toJSON: () => ({}),
      ...rect,
    }) as DOMRect
  document.body.append(element)
  return element
}

afterEach(() => {
  document.querySelector('[data-tour="target"]')?.remove()
})

describe('tour card positioning', () => {
  it('moves the card to the left when the target is near the right edge', () => {
    const target = addTarget({
      top: 120,
      left: 700,
      right: 760,
      width: 60,
      height: 40,
    })
    const position = getTourCardPosition(target, null)

    expect(position).toEqual({ top: 120, left: 332 })
  })

  it('clamps the card inside the viewport when no side has enough room', () => {
    const target = addTarget({
      top: 10,
      left: 10,
      right: 70,
      bottom: 50,
      width: 60,
      height: 40,
    })
    const position = getTourCardPosition(target, null)

    expect(position).toEqual({ top: 16, left: 86 })
    expect(getTourTarget('missing')).toBeNull()
  })
})
