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

import type { ColumnDef } from '@tanstack/react-table'
import { Window } from 'happy-dom'

import type { UsageLog } from '../../../data/schema'

const domWindow = new Window()
for (const key of [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'Node',
  'Element',
  'Event',
  'CustomEvent',
  'customElements',
  'MutationObserver',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'getComputedStyle',
  'matchMedia',
] as const) {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    value: domWindow[key],
  })
}

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

describe('rate-limit queue log column', () => {
  after(() => {
    domWindow.close()
  })

  test('is available only in the administrator table and reads queue milliseconds', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)

    await act(async () => root.render(<ColumnsProbe isAdmin />))
    const queueColumn = renderedColumns.find(
      (column) => column.id === 'rate_limit_queue'
    )
    assert.ok(queueColumn)
    if (!('accessorFn' in queueColumn)) {
      assert.fail('queue column must define an accessor function')
    }
    const accessorFn = queueColumn.accessorFn
    assert.equal(typeof accessorFn, 'function')

    const log = {
      other: JSON.stringify({
        admin_info: { channel_rate_limit_queue_ms: 5000 },
      }),
    } as UsageLog
    assert.equal(accessorFn(log, 0), 5000)

    await act(async () => root.render(<ColumnsProbe isAdmin={false} />))
    assert.equal(
      renderedColumns.some((column) => column.id === 'rate_limit_queue'),
      false
    )

    await act(async () => root.unmount())
    container.remove()
  })
})
