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
*/
import { describe, expect, test } from 'vitest'

import { getFirstResponseTimeColor } from '../format'

describe('first response time color', () => {
  test('uses green below 10 seconds', () => {
    expect(getFirstResponseTimeColor(9.999)).toBe('success')
  })

  test('uses orange from 10 through 15 seconds', () => {
    expect(getFirstResponseTimeColor(10)).toBe('warning')
    expect(getFirstResponseTimeColor(15)).toBe('warning')
  })

  test('uses red above 15 seconds', () => {
    expect(getFirstResponseTimeColor(15.001)).toBe('danger')
  })
})
