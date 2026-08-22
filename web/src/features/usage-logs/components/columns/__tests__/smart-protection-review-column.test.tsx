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
import type { ColumnDef } from '@tanstack/react-table'
import type { ReactNode } from 'react'
import { describe, expect, test, vi } from 'vitest'

import type { UsageLog } from '../../../data/schema'

vi.mock('@/lib/lobe-icon', () => ({
  getLobeIcon: () => null,
}))

const { act } = await import('react')
const { createRoot } = await import('react-dom/client')
const i18next = (await import('i18next')).default
const { initReactI18next } = await import('react-i18next')
await i18next.use(initReactI18next).init({ lng: 'en' })
const { useCommonLogsColumns } = await import('../common-logs-columns')
const reactTestGlobals = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}
reactTestGlobals.IS_REACT_ACT_ENVIRONMENT = true

let renderedColumns: ColumnDef<UsageLog>[] = []

function ColumnsProbe(props: { isAdmin: boolean }) {
  renderedColumns = useCommonLogsColumns(props.isAdmin)
  return null
}

describe('smart-protection review log column', () => {
  test('shows only Safety and Categories review columns to administrators', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)

    await act(async () => root.render(<ColumnsProbe isAdmin />))
    const log = {
      other: JSON.stringify({
        admin_info: {
          smart_protection_safeties: ['Controversial'],
          smart_protection_categories: ['Jailbreak'],
        },
      }),
    } as UsageLog
    const safetyColumn = renderedColumns.find(
      (column) => column.id === 'smart_protection_safeties'
    )
    const categoriesColumn = renderedColumns.find(
      (column) => column.id === 'smart_protection_categories'
    )
    expect(safetyColumn).toBeDefined()
    expect(categoriesColumn).toBeDefined()
    expect(
      renderedColumns.some(
        (column) =>
          column.id === 'smart_protection_review' ||
          column.id === 'smart_protection_status' ||
          column.id === 'smart_protection_reason'
      )
    ).toBe(false)
    if (!safetyColumn || !('accessorFn' in safetyColumn)) {
      throw new Error('safety column must define an accessor function')
    }
    if (!categoriesColumn || !('accessorFn' in categoriesColumn)) {
      throw new Error('categories column must define an accessor function')
    }
    expect(safetyColumn.accessorFn(log, 0)).toEqual(['Controversial'])
    expect(categoriesColumn.accessorFn(log, 0)).toEqual(['Jailbreak'])

    await act(async () => root.render(<ColumnsProbe isAdmin={false} />))
    expect(
      renderedColumns.some((column) => column.id === 'smart_protection_review')
    ).toBe(false)
    expect(
      renderedColumns.some(
        (column) => column.id === 'smart_protection_safeties'
      )
    ).toBe(false)
    expect(
      renderedColumns.some(
        (column) => column.id === 'smart_protection_categories'
      )
    ).toBe(false)

    await act(async () => root.unmount())
    container.remove()
  })

  test('shows None when a completed safe review has no categories', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)

    await act(async () => root.render(<ColumnsProbe isAdmin />))
    const categoriesColumn = renderedColumns.find(
      (column) => column.id === 'smart_protection_categories'
    )
    if (!categoriesColumn || typeof categoriesColumn.cell !== 'function') {
      throw new Error('categories column must define a cell renderer')
    }

    const log = {
      type: 2,
      other: JSON.stringify({
        admin_info: {
          smart_protection_review_ms: 125,
          smart_protection_safeties: ['Safe'],
          smart_protection_categories: [],
        },
      }),
    } as UsageLog
    const content = categoriesColumn.cell({
      row: {
        original: log,
        getValue: () => [],
      },
    } as never) as ReactNode

    await act(async () => root.render(content))
    expect(container.textContent).toContain('None')

    await act(async () => root.unmount())
    container.remove()
  })

  test('shows Error instead of None when the review failed', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)

    await act(async () => root.render(<ColumnsProbe isAdmin />))
    const safetyColumn = renderedColumns.find(
      (column) => column.id === 'smart_protection_safeties'
    )
    const categoriesColumn = renderedColumns.find(
      (column) => column.id === 'smart_protection_categories'
    )
    if (
      !safetyColumn ||
      typeof safetyColumn.cell !== 'function' ||
      !categoriesColumn ||
      typeof categoriesColumn.cell !== 'function'
    ) {
      throw new Error('review columns must define cell renderers')
    }
    const log = {
      type: 2,
      other: JSON.stringify({
        admin_info: {
          smart_protection_review_ms: 400,
          smart_protection_review_status: 'failed',
          smart_protection_review_reason: 'guard_unavailable',
          smart_protection_safeties: [],
          smart_protection_categories: [],
          smart_protection_review_error:
            'smart protection upstream returned status 401',
        },
      }),
    } as UsageLog
    const row = {
      original: log,
      getValue: () => [],
    }
    const safetyContent = safetyColumn.cell({ row } as never) as ReactNode
    const categoriesContent = categoriesColumn.cell({
      row,
    } as never) as ReactNode

    await act(async () =>
      root.render(
        <>
          {safetyContent}
          {categoriesContent}
        </>
      )
    )
    expect(container.textContent).toBe('ErrorError')
    expect(container.textContent).not.toContain('None')

    await act(async () => root.unmount())
    container.remove()
  })

  test('keeps partial classifications visible in Safety and Categories', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)

    await act(async () => root.render(<ColumnsProbe isAdmin />))
    const safetyColumn = renderedColumns.find(
      (column) => column.id === 'smart_protection_safeties'
    )
    const categoriesColumn = renderedColumns.find(
      (column) => column.id === 'smart_protection_categories'
    )
    if (
      !safetyColumn ||
      typeof safetyColumn.cell !== 'function' ||
      !categoriesColumn ||
      typeof categoriesColumn.cell !== 'function'
    ) {
      throw new Error('review columns must define cell renderers')
    }
    const safetyCell = safetyColumn.cell
    const categoriesCell = categoriesColumn.cell

    const log = {
      type: 2,
      other: JSON.stringify({
        admin_info: {
          smart_protection_review_status: 'partial',
          smart_protection_review_reason: 'partial_failure',
          smart_protection_safeties: ['Controversial'],
          smart_protection_categories: ['Jailbreak'],
          smart_protection_review_error: 'one review chunk timed out',
        },
      }),
    } as UsageLog
    const row = {
      original: log,
      getValue: (columnID: string) =>
        columnID === 'smart_protection_safeties'
          ? ['Controversial']
          : ['Jailbreak'],
    }

    await act(async () =>
      root.render(
        <>
          {safetyCell({ row } as never) as ReactNode}
          {categoriesCell({ row } as never) as ReactNode}
        </>
      )
    )
    expect(container.textContent).toContain('Controversial')
    expect(container.textContent).toContain('Jailbreak')
    expect(container.textContent).not.toContain('Error')

    await act(async () => root.unmount())
    container.remove()
  })
})
