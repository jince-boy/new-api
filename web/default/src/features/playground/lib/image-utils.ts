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
import type { ImageGenerationResponse } from '../types'

export function readImageFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('invalid-image'))
      return
    }

    const reader = new FileReader()
    reader.onload = (event) => resolve(String(event.target?.result || ''))
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export async function readImageFilesAsDataUrls(
  files: File[]
): Promise<string[]> {
  return Promise.all(files.map(readImageFileAsDataUrl))
}

export function extractGeneratedImageUrls(
  data: ImageGenerationResponse
): string[] {
  const items = Array.isArray(data.data) ? data.data : []
  return items
    .map((item) => {
      if (item.url) return item.url
      if (item.b64_json) return `data:image/png;base64,${item.b64_json}`
      return ''
    })
    .filter(Boolean)
}

export function buildGeneratedImageMarkdown(
  urls: string[],
  altText: string
): string {
  return urls.map((url) => `![${altText}](${url})`).join('\n\n')
}
