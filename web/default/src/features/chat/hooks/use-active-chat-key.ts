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
import { useQuery } from '@tanstack/react-query'

import {
  fetchDefaultApiKey,
  type DefaultApiKeyPurpose,
} from '@/features/keys/api'
import { useAuthStore } from '@/stores/auth-store'

export async function fetchActiveApiKey(
  purpose: DefaultApiKeyPurpose = 'chat'
) {
  const result = await fetchDefaultApiKey(purpose)
  if (!result.success) {
    throw new Error(result.message || 'Failed to load API key')
  }

  if (!result.data?.key) {
    throw new Error('No enabled API keys found. Create or enable one first.')
  }

  return `sk-${result.data.key}`
}

export async function fetchActiveChatKey() {
  return fetchActiveApiKey('chat')
}

/**
 * Get the currently active API key for chat links
 */
export function useActiveApiKey(
  purpose: DefaultApiKeyPurpose,
  enabled: boolean
) {
  const userId = useAuthStore((state) => state.auth.user?.id)

  return useQuery({
    queryKey: ['active-api-key', purpose, userId],
    queryFn: () => fetchActiveApiKey(purpose),
    enabled: enabled && Boolean(userId),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  })
}

export function useActiveChatKey(enabled: boolean) {
  const userId = useAuthStore((state) => state.auth.user?.id)

  return useQuery({
    queryKey: ['chat-active-key', userId],
    queryFn: fetchActiveChatKey,
    enabled: enabled && Boolean(userId),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  })
}
