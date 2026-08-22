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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Row } from '@tanstack/react-table'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'

import { TooltipProvider } from '@/components/ui/tooltip'

import { channelSchema, type Channel } from '../../types'
import { ChannelRowActionsLayoutContext } from '../channel-row-actions-context'

const channelsContext = vi.hoisted(() => ({
  setOpen: vi.fn(),
  setCurrentRow: vi.fn(),
  upstream: {
    openModal: vi.fn(),
    detectChannelUpdates: vi.fn(),
  },
}))

vi.mock('../channels-provider', () => ({
  useChannels: () => channelsContext,
}))

const { DataTableRowActions } = await import('../data-table-row-actions')

const channel = channelSchema.parse({
  id: 7,
  type: 1,
  key: 'test-key',
  status: 1,
  name: 'Primary channel',
  created_time: 0,
  test_time: 0,
  response_time: 0,
  balance_updated_time: 0,
})

function renderActions(layout: 'table' | 'card') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ChannelRowActionsLayoutContext.Provider value={layout}>
          <DataTableRowActions row={{ original: channel } as Row<Channel>} />
        </ChannelRowActionsLayoutContext.Provider>
      </TooltipProvider>
    </QueryClientProvider>
  )
}

describe('channel row actions', () => {
  beforeEach(() => {
    channelsContext.setOpen.mockClear()
    channelsContext.setCurrentRow.mockClear()
  })

  test.each(['table', 'card'] as const)(
    '%s view exposes edit and all-model channel testing actions',
    async (layout) => {
      const user = userEvent.setup()
      renderActions(layout)

      await user.click(screen.getByRole('button', { name: 'Edit' }))
      expect(channelsContext.setCurrentRow).toHaveBeenLastCalledWith(channel)
      expect(channelsContext.setOpen).toHaveBeenLastCalledWith('update-channel')

      await user.click(
        screen.getByRole('button', { name: 'Test Channel Connection' })
      )
      expect(channelsContext.setCurrentRow).toHaveBeenLastCalledWith(channel)
      expect(channelsContext.setOpen).toHaveBeenLastCalledWith('test-channel')
      expect(
        screen.queryByRole('button', { name: 'Test Connection' })
      ).not.toBeInTheDocument()
    }
  )
})
