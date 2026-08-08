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
import { api } from '@/lib/api'

import type {
  ChannelSchedulingOverview,
  ChannelSchedulingSetting,
  SchedulingFilters,
} from './types'

interface ApiResponse<T> {
  success: boolean
  message?: string
  data: T
}

export async function getChannelSchedulingOverview(
  filters: SchedulingFilters
): Promise<ChannelSchedulingOverview> {
  const params: Record<string, string | number> = {}
  if (filters.group.trim()) params.group = filters.group.trim()
  if (filters.model.trim()) params.model = filters.model.trim()
  if (filters.priority.trim()) params.priority = filters.priority.trim()
  const response = await api.get<ApiResponse<ChannelSchedulingOverview>>(
    '/api/channel/scheduling/overview',
    { params }
  )
  return response.data.data
}

export async function getChannelSchedulingSetting(): Promise<ChannelSchedulingSetting> {
  const response = await api.get<ApiResponse<ChannelSchedulingSetting>>(
    '/api/channel/scheduling/settings'
  )
  return response.data.data
}

export async function getChannelSchedulingGroups(): Promise<string[]> {
  const response = await api.get<{
    success: boolean
    message?: string
    data?: string[]
  }>('/api/group/')
  return response.data.data ?? []
}

export async function updateChannelSchedulingSetting(
  setting: ChannelSchedulingSetting
): Promise<ChannelSchedulingSetting> {
  const response = await api.put<ApiResponse<ChannelSchedulingSetting>>(
    '/api/channel/scheduling/settings',
    setting
  )
  return response.data.data
}

export async function restoreChannelModel(
  channelId: number,
  model: string
): Promise<boolean> {
  const response = await api.post<ApiResponse<boolean>>(
    '/api/channel/scheduling/model/restore',
    { channel_id: channelId, model }
  )
  return response.data.data
}

export async function restoreChannel(channelId: number): Promise<boolean> {
  const response = await api.post<ApiResponse<boolean>>(
    '/api/channel/scheduling/channel/restore',
    { channel_id: channelId }
  )
  return response.data.data
}
