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
import type { UpstreamPricingItem } from '../types'

export type ProviderOption = {
  id: string
  name: string
  iconKey: string
  count: number
}

export const CAPABILITY_LABELS: Record<string, string> = {
  Reasoning: 'Reasoning',
  'Tool call': 'Tools',
  'Structured output': 'Structured output',
  Attachment: 'File',
  Temperature: 'Temperature',
  'Open weights': 'Open weights',
  Experimental: 'Experimental',
}

const PROVIDER_ICON_KEYS: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
  'google-vertex': 'VertexAI',
  vertex: 'VertexAI',
  amazon: 'Aws',
  bedrock: 'Aws',
  azure: 'Azure',
  xai: 'XAI',
  groq: 'Groq',
  deepseek: 'DeepSeek',
  mistral: 'Mistral',
  cohere: 'Cohere',
  openrouter: 'OpenRouter',
  alibaba: 'Qwen',
  qwen: 'Qwen',
  moonshotai: 'Moonshot',
}

export function getProviderIdentity(item: UpstreamPricingItem): {
  id: string
  name: string
  iconKey: string
} {
  const id = item.provider_id || item.provider_name || item.source_name
  const name = item.provider_name || item.provider_id || item.source_name
  const normalized = id.toLowerCase().replaceAll('_', '-').replaceAll(' ', '-')
  return {
    id,
    name,
    iconKey: PROVIDER_ICON_KEYS[normalized] || name,
  }
}

export function formatPrice(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '-'
  }
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 6 })}`
}

export function formatContext(value: number | null | undefined): string {
  if (!value || !Number.isFinite(value)) return '-'
  if (value >= 1_000_000) {
    const millions = value / 1_000_000
    return `${Number.isInteger(millions) ? millions.toFixed(0) : millions.toFixed(2)}M`
  }
  if (value >= 1000) {
    return `${Math.round(value / 1000)}K`
  }
  return String(value)
}
