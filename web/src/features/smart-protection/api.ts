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

export type SmartProtectionSettings = {
  enabled: boolean
  base_url: string
  model: string
  timeout_seconds: number
  max_context_chars: number
  max_concurrent: number
  blocked_rules: SmartProtectionRule[]
  blocked_safeties?: string[]
  blocked_categories?: string[]
  channel_ids: number[]
  save_content: boolean
  warning_email: boolean
  email_cooldown_minutes: number
  email_rules: SmartProtectionEmailRule[]
  retention_days: number
  api_key_configured: boolean
  api_key_hint?: string
}

export type SmartProtectionRule = {
  client_id?: string
  id?: string
  name?: string
  safety: string
  categories: string[]
  match_mode: 'all' | 'any'
  send_email?: boolean
  record?: boolean
  block?: boolean
  email_template_id?: string
  actions_configured?: boolean
}

export type SmartProtectionEmailRule = {
  client_id?: string
  id?: string
  name: string
  action?: '' | 'blocked' | 'observed'
  safety?: string
  categories?: string[]
  match_mode?: 'all' | 'any'
  subject: string
  body: string
  enabled?: boolean
}

export type SmartProtectionChannel = {
  id: number
  name: string
  type: number
  status: number
}

export type SmartProtectionEvent = {
  id: number
  user_id: number
  username: string
  email: string
  user_status: number
  token_id: number
  token_name: string
  channel_id: number
  channel_name: string
  request_id: string
  model_name: string
  guard_model: string
  safety: string
  categories: string
  content: string
  content_hash: string
  raw_result: string
  action: string
  review_time_ms: number
  email_sent: boolean
  email_status?: string
  email_rule_name?: string
  email_error?: string
  created_at: number
}

type ApiResponse<T> = { success: boolean; message?: string; data: T }

export async function getSmartProtectionSettings() {
  const response = await api.get<ApiResponse<SmartProtectionSettings>>(
    '/api/smart-protection/settings'
  )
  return response.data.data
}

export async function updateSmartProtectionSettings(
  settings: SmartProtectionSettings & { api_key?: string }
) {
  const response = await api.put<ApiResponse<SmartProtectionSettings>>(
    '/api/smart-protection/settings',
    settings
  )
  return response.data.data
}

export async function getSmartProtectionChannels() {
  const response = await api.get<ApiResponse<SmartProtectionChannel[]>>(
    '/api/smart-protection/channels'
  )
  return response.data.data
}

export async function getSmartProtectionEvents(
  page = 1,
  pageSize = 10,
  keyword = '',
  username = '',
  safety = '',
  category = ''
) {
  const response = await api.get<
    ApiResponse<{
      items: SmartProtectionEvent[]
      total: number
      page: number
      page_size: number
    }>
  >('/api/smart-protection/events', {
    params: {
      page,
      page_size: pageSize,
      ...(keyword ? { keyword } : {}),
      ...(username ? { username } : {}),
      ...(safety ? { safety } : {}),
      ...(category ? { category } : {}),
    },
  })
  const data = response.data.data
  return { ...data, items: data.items ?? [] }
}

export async function getSmartProtectionEvent(id: number) {
  const response = await api.get<ApiResponse<SmartProtectionEvent>>(
    `/api/smart-protection/events/${id}`
  )
  return response.data.data
}

export async function clearSmartProtectionEvents() {
  const response = await api.delete<ApiResponse<{ deleted: number }>>(
    '/api/smart-protection/events'
  )
  return response.data.data
}
