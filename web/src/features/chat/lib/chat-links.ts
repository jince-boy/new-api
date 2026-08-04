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
import { API_KEY_STATUS } from '@/features/keys/constants'

export type ChatLinkType = 'web' | 'custom-protocol' | 'fluent'

export type ChatPreset = {
  id: string
  name: string
  url: string
  type: ChatLinkType
}

type ParsedChatEntry = {
  url: string
  enabled: boolean
}

export type RawChatConfig =
  | string
  | Record<string, unknown>
  | Array<Record<string, unknown>>
  | null
  | undefined

export type ResolveChatUrlParams = {
  template: string
  apiKey?: string
  serverAddress: string
  theme?: string
}

export type ActiveApiKey = {
  key: string
  status: number
}

const HTTP_REGEX = /^https?:\/\//i
export const DISABLED_CHAT_PRESET_PREFIX = '__newapi_disabled_chat__:'

function toBase64(value: string) {
  if (typeof window !== 'undefined' && typeof window.btoa === 'function') {
    return window.btoa(value)
  }

  type BufferConstructorLike = {
    from(data: string, encoding: string): { toString(encoding: string): string }
  }

  const globalObj =
    typeof globalThis !== 'undefined'
      ? (globalThis as Record<string, unknown>)
      : undefined
  const bufferCtor = globalObj?.Buffer

  if (
    typeof bufferCtor === 'function' &&
    typeof (bufferCtor as unknown as BufferConstructorLike).from === 'function'
  ) {
    return (bufferCtor as unknown as BufferConstructorLike)
      .from(value, 'utf-8')
      .toString('base64')
  }

  return ''
}

export function detectChatLinkType(url: string): ChatLinkType {
  if (HTTP_REGEX.test(url)) {
    return 'web'
  }
  if (url.toLowerCase().startsWith('fluent')) {
    return 'fluent'
  }
  return 'custom-protocol'
}

export function chatLinkRequiresApiKey(url: string): boolean {
  return (
    url.includes('{key}') ||
    url.includes('{{key}}') ||
    url.includes('{cherryConfig}') ||
    url.includes('{{cherryConfig}}') ||
    url.includes('{aionuiConfig}') ||
    url.includes('{{aionuiConfig}}') ||
    url.includes('{deepchatConfig}') ||
    url.includes('{{deepchatConfig}}')
  )
}

export function parseChatPresetValue(value: unknown): ParsedChatEntry | null {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    const enabled = !trimmed.startsWith(DISABLED_CHAT_PRESET_PREFIX)
    const url = enabled
      ? trimmed
      : trimmed.slice(DISABLED_CHAT_PRESET_PREFIX.length).trim()
    return url ? { url, enabled } : null
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  const config = value as Record<string, unknown>
  const url = config.url
  if (typeof url !== 'string' || !url.trim()) {
    return null
  }

  if ('enabled' in config && typeof config.enabled !== 'boolean') {
    return null
  }

  return {
    url: url.trim(),
    enabled: config.enabled !== false,
  }
}

export function serializeChatPresetValue(
  url: string,
  enabled: boolean
): string {
  const trimmedUrl = url.trim()
  return enabled ? trimmedUrl : `${DISABLED_CHAT_PRESET_PREFIX}${trimmedUrl}`
}

export function normalizeChatConfigForStorage(
  value: string,
  fallback = '[]'
): string {
  let parsed: unknown

  try {
    parsed = JSON.parse(value || fallback)
  } catch {
    return fallback
  }

  if (!Array.isArray(parsed)) {
    return fallback
  }

  const normalized = parsed
    .map((entry) => {
      if (
        !entry ||
        typeof entry !== 'object' ||
        Array.isArray(entry) ||
        Object.keys(entry).length !== 1
      ) {
        return null
      }

      const [name, rawValue] = Object.entries(entry)[0]
      const parsedEntry = parseChatPresetValue(rawValue)
      if (!parsedEntry) {
        return null
      }

      return {
        [name]: serializeChatPresetValue(parsedEntry.url, parsedEntry.enabled),
      }
    })
    .filter((item): item is Record<string, string> => item !== null)

  return JSON.stringify(normalized, null, 2)
}

export function parseChatConfig(raw: RawChatConfig): ChatPreset[] {
  let parsed: unknown = raw

  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw)
    } catch {
      return []
    }
  }

  if (!Array.isArray(parsed)) {
    return []
  }

  return parsed
    .map((entry, index) => {
      if (
        !entry ||
        typeof entry !== 'object' ||
        Array.isArray(entry) ||
        Object.keys(entry).length !== 1
      ) {
        return null
      }

      const [name, value] = Object.entries(entry)[0]
      if (typeof name !== 'string') {
        return null
      }

      const parsedEntry = parseChatPresetValue(value)
      if (!parsedEntry || !parsedEntry.enabled) {
        return null
      }

      return {
        id: String(index),
        name,
        url: parsedEntry.url,
        type: detectChatLinkType(parsedEntry.url),
      } satisfies ChatPreset
    })
    .filter((item): item is ChatPreset => item !== null)
}

function replaceToken(source: string, token: string, value: string) {
  return source.split(token).join(value)
}

function replaceTemplateVariable(source: string, name: string, value: string) {
  return replaceToken(
    replaceToken(source, `{{${name}}}`, value),
    `{${name}}`,
    value
  )
}

function normalizeApiKey(apiKey: string): string {
  const trimmed = apiKey.trim()
  if (!trimmed) return ''
  return trimmed.startsWith('sk-') ? trimmed : `sk-${trimmed}`
}

function normalizeTheme(theme: string | undefined): string {
  if (theme === 'dark' || theme === 'light') return theme

  if (typeof document !== 'undefined') {
    const root = document.documentElement
    if (root.classList.contains('dark')) return 'dark'
    if (root.classList.contains('light')) return 'light'
  }

  return ''
}

export function resolveChatUrl({
  template,
  apiKey,
  serverAddress,
  theme,
}: ResolveChatUrlParams): string {
  let url = template
  const safeServerAddress = serverAddress || ''

  const safeApiKey = normalizeApiKey(apiKey || '')
  const safeTheme = normalizeTheme(theme)

  if (url.includes('{cherryConfig}')) {
    const payload = {
      id: 'new-api',
      baseUrl: safeServerAddress,
      apiKey: safeApiKey,
    }
    const encoded = encodeURIComponent(toBase64(JSON.stringify(payload)))
    url = replaceTemplateVariable(url, 'cherryConfig', encoded)
  }

  if (url.includes('{aionuiConfig}')) {
    const payload = {
      platform: 'new-api',
      baseUrl: safeServerAddress,
      apiKey: safeApiKey,
    }
    const encoded = encodeURIComponent(toBase64(JSON.stringify(payload)))
    url = replaceTemplateVariable(url, 'aionuiConfig', encoded)
  }

  if (url.includes('{deepchatConfig}')) {
    const payload = {
      id: 'new-api',
      baseUrl: safeServerAddress,
      apiKey: safeApiKey,
    }
    const encoded = encodeURIComponent(toBase64(JSON.stringify(payload)))
    url = replaceTemplateVariable(url, 'deepchatConfig', encoded)
  }

  if (safeServerAddress) {
    const encodedAddress = encodeURIComponent(safeServerAddress)
    url = replaceTemplateVariable(url, 'address', encodedAddress)
  }

  if (safeApiKey) {
    url = replaceTemplateVariable(url, 'key', safeApiKey)
  }

  if (safeTheme) {
    url = replaceTemplateVariable(url, 'theme', safeTheme)
  }

  return url
}

export function getFirstActiveKey(
  keys: ActiveApiKey[] | undefined
): ActiveApiKey | undefined {
  if (!Array.isArray(keys)) return undefined
  return keys.find((item) => item.status === API_KEY_STATUS.ENABLED)
}
