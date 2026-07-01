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
import { Fragment, type ReactNode } from 'react'
import {
  parseMarkdownToStructure,
  sanitizeImageSrc,
  type ImageNode,
  type MarkdownIt,
  type ParseOptions,
} from 'stream-markdown-parser'

import { ResponseImage } from './response-renderer-image'
import { renderChildren } from './response-renderer'

const MAX_SEGMENT_MARKDOWN_CHARS = 20_000
const DATA_IMAGE_MARKDOWN_PATTERN =
  /!\[([^\]\r\n]*)\]\((data:image\/(?:png|gif|jpe?g|webp|avif|bmp);base64,[A-Za-z0-9+/=]+)(?:\s+(?:"([^"\r\n]*)"|'([^'\r\n]*)'))?\)/gi
const DATA_IMAGE_SRC_PATTERN =
  /^data:image\/(?:png|gif|jpe?g|webp|avif|bmp);base64,[A-Za-z0-9+/=]+$/i

function renderMarkdownSegment(
  content: string,
  key: string,
  markdown: MarkdownIt,
  options: ParseOptions
): ReactNode {
  if (!content) {
    return null
  }

  if (content.length > MAX_SEGMENT_MARKDOWN_CHARS) {
    return <Fragment key={key}>{content}</Fragment>
  }

  const nodes = parseMarkdownToStructure(content, markdown, options)
  if (nodes.length === 0) {
    return <Fragment key={key}>{content}</Fragment>
  }

  return <Fragment key={key}>{renderChildren(nodes)}</Fragment>
}

function createDataImageNode(
  raw: string,
  alt: string,
  src: string,
  title: string | null
): ImageNode {
  return {
    alt,
    raw,
    src,
    title,
    type: 'image',
  }
}

export function renderDataImageMarkdown(
  content: string,
  markdown: MarkdownIt,
  options: ParseOptions
): ReactNode | null {
  const elements: ReactNode[] = []
  let lastIndex = 0
  let imageCount = 0

  for (const match of content.matchAll(DATA_IMAGE_MARKDOWN_PATTERN)) {
    const matchIndex = match.index ?? 0
    const raw = match[0]
    const sanitizedSrc = sanitizeImageSrc(match[2])

    if (!sanitizedSrc || !DATA_IMAGE_SRC_PATTERN.test(sanitizedSrc)) {
      continue
    }

    const leadingContent = content.slice(lastIndex, matchIndex)
    const leadingElement = renderMarkdownSegment(
      leadingContent,
      `text-${lastIndex}`,
      markdown,
      options
    )

    if (leadingElement) {
      elements.push(leadingElement)
    }

    elements.push(
      <ResponseImage
        key={`image-${matchIndex}-${imageCount}`}
        node={createDataImageNode(
          raw,
          match[1] ?? '',
          sanitizedSrc,
          match[3] ?? match[4] ?? null
        )}
      />
    )
    lastIndex = matchIndex + raw.length
    imageCount += 1
  }

  if (imageCount === 0) {
    return null
  }

  const trailingContent = content.slice(lastIndex)
  const trailingElement = renderMarkdownSegment(
    trailingContent,
    `text-${lastIndex}`,
    markdown,
    options
  )

  if (trailingElement) {
    elements.push(trailingElement)
  }

  return elements
}
