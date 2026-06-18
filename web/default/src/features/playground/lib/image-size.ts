/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { IMAGE_SIZE_OPTIONS } from '../constants'

export const IMAGE_SIZE_CONSTRAINTS = {
  maxLongEdge: 3840,
  multiple: 16,
  maxAspectRatio: 3,
  minPixels: 655360,
  maxPixels: 8294400,
} as const

export type ImageSizeValidationResult = {
  valid: boolean
  normalized: string
  reason?: string
}

export function normalizeImageSizeInput(size: string): string {
  return String(size || '')
    .trim()
    .replace(/[×*]/g, 'x')
    .toLowerCase()
}

export function isPresetImageSize(size: string): boolean {
  return IMAGE_SIZE_OPTIONS.includes(
    normalizeImageSizeInput(size) as (typeof IMAGE_SIZE_OPTIONS)[number]
  )
}

export function parseImageSizeDimensions(
  size: string
): { width: number; height: number } | null {
  const normalized = normalizeImageSizeInput(size)
  const match = normalized.match(/^(\d{2,5})x(\d{2,5})$/)
  if (!match) return null

  return {
    width: Number(match[1]),
    height: Number(match[2]),
  }
}

export function validateImageSize(size: string): ImageSizeValidationResult {
  const normalized = normalizeImageSizeInput(size)
  if (normalized === 'auto') {
    return { valid: true, normalized }
  }

  const dimensions = parseImageSizeDimensions(normalized)
  if (!dimensions) {
    return {
      valid: false,
      normalized,
      reason: 'Use WIDTHxHEIGHT, for example 2048x1152, or auto.',
    }
  }

  const { width, height } = dimensions
  const longEdge = Math.max(width, height)
  const shortEdge = Math.min(width, height)
  const pixels = width * height

  if (longEdge > IMAGE_SIZE_CONSTRAINTS.maxLongEdge) {
    return {
      valid: false,
      normalized,
      reason: 'The long edge must be 3840px or less.',
    }
  }

  if (
    width % IMAGE_SIZE_CONSTRAINTS.multiple !== 0 ||
    height % IMAGE_SIZE_CONSTRAINTS.multiple !== 0
  ) {
    return {
      valid: false,
      normalized,
      reason: 'Width and height must both be multiples of 16.',
    }
  }

  if (longEdge / shortEdge > IMAGE_SIZE_CONSTRAINTS.maxAspectRatio) {
    return {
      valid: false,
      normalized,
      reason: 'The long-to-short side ratio must be 3:1 or less.',
    }
  }

  if (
    pixels < IMAGE_SIZE_CONSTRAINTS.minPixels ||
    pixels > IMAGE_SIZE_CONSTRAINTS.maxPixels
  ) {
    return {
      valid: false,
      normalized,
      reason: 'Total pixels must be between 655,360 and 8,294,400.',
    }
  }

  return { valid: true, normalized }
}
