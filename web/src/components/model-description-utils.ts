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
const descriptionBlockSelector = [
  'address',
  'article',
  'aside',
  'blockquote',
  'div',
  'figcaption',
  'figure',
  'footer',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'li',
  'main',
  'nav',
  'p',
  'section',
  'tr',
].join(',')

function normalizeDescriptionPreviewText(content: string): string {
  return content
    .replaceAll(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replaceAll(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
}

export function getModelDescriptionPreview(content: string): string {
  if (typeof document === 'undefined') {
    const preview = content
      .replaceAll(
        /<\s*(script|style|noscript|template)\b[^>]*>[\s\S]*?<\/\s*\1\s*>/gi,
        ' '
      )
      .replaceAll(/<\s*br\s*\/?\s*>/gi, '\n')
      .replaceAll(
        /<\/\s*(?:address|article|aside|blockquote|div|figcaption|figure|footer|h[1-6]|header|li|main|nav|p|section|tr)\s*>/gi,
        '\n'
      )
      .replaceAll(/<[^>]+>/g, ' ')
      .replaceAll(/&nbsp;/gi, ' ')
      .replaceAll(/&amp;/gi, '&')
      .replaceAll(/&lt;/gi, '<')
      .replaceAll(/&gt;/gi, '>')
      .replaceAll(/&quot;/gi, '"')
      .replaceAll(/&#(?:39|x27);/gi, "'")

    return normalizeDescriptionPreviewText(preview)
  }

  const template = document.createElement('template')
  template.innerHTML = content
  template.content
    .querySelectorAll('script, style, noscript, template')
    .forEach((element) => element.remove())
  template.content.querySelectorAll('br').forEach((element) => {
    element.replaceWith(document.createTextNode('\n'))
  })
  template.content
    .querySelectorAll(descriptionBlockSelector)
    .forEach((element) => element.after(document.createTextNode('\n')))

  return normalizeDescriptionPreviewText(template.content.textContent || '')
}
