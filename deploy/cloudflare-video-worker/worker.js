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
const TOKEN_AAD = new TextEncoder().encode('new-api-video-worker-v1')
const MAX_REDIRECTS = 5

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(),
      })
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return errorResponse(405, 'method_not_allowed', 'Only GET and HEAD are supported')
    }
    if (!env.VIDEO_WORKER_SECRET) {
      return errorResponse(500, 'worker_not_configured', 'Video worker secret is not configured')
    }

    const requestURL = new URL(request.url)
    const token = requestURL.searchParams.get('token') || ''
    if (!token || token.length > 65536) {
      return errorResponse(400, 'invalid_token', 'The download token is invalid')
    }

    let payload
    try {
      payload = await decryptToken(token, env.VIDEO_WORKER_SECRET)
    } catch {
      return errorResponse(403, 'invalid_token', 'The download token is invalid')
    }
    if (payload.v !== 1 || !payload.url || !Number.isFinite(payload.exp)) {
      return errorResponse(403, 'invalid_token', 'The download token is invalid')
    }
    if (payload.exp < Math.floor(Date.now() / 1000)) {
      return errorResponse(410, 'token_expired', 'The download link has expired')
    }

    let upstreamURL
    try {
      upstreamURL = new URL(payload.url)
      validateUpstreamURL(upstreamURL)
    } catch {
      return errorResponse(403, 'blocked_upstream', 'The upstream address is not allowed')
    }

    const configuredHeaders = new Headers()
    for (const [name, value] of Object.entries(payload.headers || {})) {
      if (isAllowedConfiguredHeader(name)) configuredHeaders.set(name, String(value))
    }
    for (const name of ['Range', 'If-Range', 'If-None-Match', 'If-Modified-Since']) {
      const value = request.headers.get(name)
      if (value) configuredHeaders.set(name, value)
    }

    let response
    let redirects = 0
    let previousOrigin = upstreamURL.origin
    while (true) {
      try {
        response = await fetch(upstreamURL, {
          method: request.method,
          headers: configuredHeaders,
          redirect: 'manual',
        })
      } catch {
        return errorResponse(502, 'upstream_unavailable', 'Unable to fetch video content')
      }

      if (![301, 302, 303, 307, 308].includes(response.status)) break
      if (redirects >= MAX_REDIRECTS) {
        return errorResponse(502, 'too_many_redirects', 'The upstream returned too many redirects')
      }
      const location = response.headers.get('Location')
      if (!location) {
        return errorResponse(502, 'invalid_redirect', 'The upstream returned an invalid redirect')
      }
      try {
        upstreamURL = new URL(location, upstreamURL)
        validateUpstreamURL(upstreamURL)
      } catch {
        return errorResponse(403, 'blocked_upstream', 'The upstream redirect is not allowed')
      }
      if (upstreamURL.origin !== previousOrigin) {
        for (const name of [...configuredHeaders.keys()]) {
          if (!['range', 'if-range', 'if-none-match', 'if-modified-since'].includes(name.toLowerCase())) {
            configuredHeaders.delete(name)
          }
        }
      }
      previousOrigin = upstreamURL.origin
      redirects += 1
    }

    if (![200, 206, 304, 416].includes(response.status)) {
      return errorResponse(502, 'upstream_rejected', 'The upstream did not return video content')
    }

    const responseHeaders = new Headers(corsHeaders())
    for (const name of [
      'Content-Type',
      'Content-Length',
      'Content-Range',
      'Accept-Ranges',
      'Content-Disposition',
      'ETag',
      'Last-Modified',
      'Cache-Control',
    ]) {
      const value = response.headers.get(name)
      if (value) responseHeaders.set(name, value)
    }
    if (!responseHeaders.has('Cache-Control')) {
      responseHeaders.set('Cache-Control', 'private, max-age=300')
    }
    responseHeaders.set('X-Content-Type-Options', 'nosniff')

    const responseBody =
      request.method === 'HEAD' || response.status === 304 || response.status === 416
        ? null
        : response.body
    return new Response(responseBody, {
      status: response.status,
      headers: responseHeaders,
    })
  },
}

async function decryptToken(token, secret) {
  const bytes = decodeBase64URL(token)
  if (bytes.byteLength <= 28) throw new Error('invalid token')
  const nonce = bytes.slice(0, 12)
  const ciphertext = bytes.slice(12)
  const keyBytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret))
  const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['decrypt'])
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: nonce, additionalData: TOKEN_AAD },
    key,
    ciphertext
  )
  return JSON.parse(new TextDecoder().decode(plaintext))
}

function decodeBase64URL(value) {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  const binary = atob(padded)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

function validateUpstreamURL(url) {
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('invalid protocol')
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    isPrivateIPv4(host) ||
    host === '::1' ||
    host.startsWith('fc') ||
    host.startsWith('fd') ||
    host.startsWith('fe8') ||
    host.startsWith('fe9') ||
    host.startsWith('fea') ||
    host.startsWith('feb')
  ) {
    throw new Error('private address')
  }
}

function isPrivateIPv4(host) {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false
  const parts = host.split('.').map(Number)
  if (parts.some((part) => part > 255)) return true
  return (
    parts[0] === 0 ||
    parts[0] === 10 ||
    parts[0] === 127 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) ||
    parts[0] >= 224
  )
}

function isAllowedConfiguredHeader(name) {
  return !['host', 'connection', 'content-length', 'transfer-encoding', 'range', 'if-range'].includes(
    name.toLowerCase()
  )
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Range, If-Range, If-None-Match, If-Modified-Since',
    'Access-Control-Expose-Headers':
      'Content-Type, Content-Length, Content-Range, Accept-Ranges, Content-Disposition, ETag, Last-Modified',
  }
}

function errorResponse(status, code, message) {
  return Response.json(
    { error: { code, message } },
    { status, headers: { ...corsHeaders(), 'Cache-Control': 'no-store' } }
  )
}
