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
import {
  DEFAULT_CONFIG,
  IMAGE_SIZE_OPTIONS,
  STORAGE_KEYS,
  STORAGE_LIMITS,
} from '../constants'
import type {
  PlaygroundConfig,
  ParameterEnabled,
  Message,
  PlaygroundConversation,
  ImageAsset,
  PlaygroundMode,
} from '../types'
import { sanitizeMessagesOnLoad } from './message-utils'

/**
 * Load playground config from localStorage
 */
export function loadConfig(): Partial<PlaygroundConfig> {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.CONFIG)
    if (saved) {
      const parsed = JSON.parse(saved)
      if (
        parsed?.imageSize &&
        !IMAGE_SIZE_OPTIONS.includes(parsed.imageSize)
      ) {
        parsed.imageSize = DEFAULT_CONFIG.imageSize
      }
      return parsed
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to load config:', error)
  }
  return {}
}

/**
 * Save playground config to localStorage
 */
export function saveConfig(config: Partial<PlaygroundConfig>): void {
  try {
    localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(config))
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to save config:', error)
  }
}

/**
 * Load parameter enabled state from localStorage
 */
export function loadParameterEnabled(): Partial<ParameterEnabled> {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.PARAMETER_ENABLED)
    if (saved) {
      return JSON.parse(saved)
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to load parameter enabled:', error)
  }
  return {}
}

/**
 * Save parameter enabled state to localStorage
 */
export function saveParameterEnabled(
  parameterEnabled: Partial<ParameterEnabled>
): void {
  try {
    localStorage.setItem(
      STORAGE_KEYS.PARAMETER_ENABLED,
      JSON.stringify(parameterEnabled)
    )
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to save parameter enabled:', error)
  }
}

/**
 * Load messages from localStorage
 */
export function loadMessages(): Message[] | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.MESSAGES)
    if (saved) {
      const parsed: unknown = JSON.parse(saved)
      if (!Array.isArray(parsed)) {
        return null
      }
      const sanitized = sanitizeMessagesOnLoad(parsed as Message[])
      // Persist sanitized result to avoid re-sanitizing on subsequent loads
      if (sanitized !== parsed) {
        saveMessages(sanitized)
      }
      return sanitized
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to load messages:', error)
  }
  return null
}

/**
 * Save messages to localStorage
 */
export function saveMessages(messages: Message[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(messages))
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to save messages:', error)
  }
}

/**
 * Load local conversation history from localStorage
 */
export function loadConversations(): PlaygroundConversation[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.CONVERSATIONS)
    if (!saved) return []

    const parsed: unknown = JSON.parse(saved)
    return Array.isArray(parsed) ? (parsed as PlaygroundConversation[]) : []
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to load conversations:', error)
    return []
  }
}

/**
 * Save local conversation history with an upper bound
 */
export function saveConversations(
  conversations: PlaygroundConversation[]
): PlaygroundConversation[] {
  const next = conversations.slice(0, STORAGE_LIMITS.CONVERSATIONS)
  try {
    localStorage.setItem(STORAGE_KEYS.CONVERSATIONS, JSON.stringify(next))
  } catch (error) {
    const compact = next.slice(0, 10).map((conversation) => ({
      ...conversation,
      messages: (conversation.messages || []).map((message) => ({
        ...message,
        imageUrls: (message.imageUrls || []).filter(
          (url) => !url.startsWith('data:image')
        ),
        generatedImages: (message.generatedImages || []).filter(
          (asset) => !asset.url.startsWith('data:image')
        ),
      })),
    }))
    try {
      localStorage.setItem(STORAGE_KEYS.CONVERSATIONS, JSON.stringify(compact))
      return compact
    } catch {
      localStorage.removeItem(STORAGE_KEYS.CONVERSATIONS)
    }
    // eslint-disable-next-line no-console
    console.error('Failed to save conversations:', error)
  }
  return next
}

export function loadActiveConversationId(): string {
  try {
    return localStorage.getItem(STORAGE_KEYS.ACTIVE_CONVERSATION) || ''
  } catch {
    return ''
  }
}

export function saveActiveConversationId(conversationId: string): void {
  try {
    if (conversationId) {
      localStorage.setItem(STORAGE_KEYS.ACTIVE_CONVERSATION, conversationId)
    } else {
      localStorage.removeItem(STORAGE_KEYS.ACTIVE_CONVERSATION)
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to save active conversation:', error)
  }
}

/**
 * Load generated image library from localStorage
 */
export function loadImageLibrary(): ImageAsset[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.IMAGE_LIBRARY)
    if (!saved) return []

    const parsed: unknown = JSON.parse(saved)
    return Array.isArray(parsed) ? (parsed as ImageAsset[]) : []
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to load image library:', error)
    return []
  }
}

/**
 * Persist generated image library. Falls back to a compact library if storage
 * quota is exceeded by data URLs.
 */
export function saveImageLibrary(assets: ImageAsset[]): ImageAsset[] {
  const next = assets.slice(0, STORAGE_LIMITS.IMAGE_ASSETS)
  try {
    localStorage.setItem(STORAGE_KEYS.IMAGE_LIBRARY, JSON.stringify(next))
    return next
  } catch {
    const compact = next.slice(0, 24)
    try {
      localStorage.setItem(STORAGE_KEYS.IMAGE_LIBRARY, JSON.stringify(compact))
      return compact
    } catch {
      localStorage.removeItem(STORAGE_KEYS.IMAGE_LIBRARY)
      return []
    }
  }
}

export function createImageAssets({
  urls,
  prompt,
  mode,
  model,
  group,
  size,
  quality,
  conversationId,
}: {
  urls: string[]
  prompt: string
  mode: PlaygroundMode
  model: string
  group: string
  size: string
  quality: string
  conversationId?: string
}): ImageAsset[] {
  const now = Date.now()
  return urls.map((url, index) => ({
    id: `pg-img-${now}-${index}-${Math.random().toString(36).slice(2, 8)}`,
    url,
    prompt,
    mode,
    model,
    group,
    size,
    quality,
    conversationId,
    createdAt: now,
  }))
}

/**
 * Clear all playground data
 */
export function clearPlaygroundData(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.CONFIG)
    localStorage.removeItem(STORAGE_KEYS.PARAMETER_ENABLED)
    localStorage.removeItem(STORAGE_KEYS.MESSAGES)
    localStorage.removeItem(STORAGE_KEYS.CONVERSATIONS)
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_CONVERSATION)
    localStorage.removeItem(STORAGE_KEYS.IMAGE_LIBRARY)
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to clear playground data:', error)
  }
}
