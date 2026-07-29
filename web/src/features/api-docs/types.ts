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
export type ApiMethod = 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export type ApiAuthStyle = 'bearer' | 'claude' | 'gemini' | 'websocket'

export type ApiParameterLocation = 'path' | 'query' | 'header' | 'body' | 'form'

export type ApiParameter = {
  name: string
  location: ApiParameterLocation
  type: string
  required: boolean
  description: string
}

export type ApiExample = {
  path?: string
  query?: Record<string, string>
  json?: Record<string, unknown>
  form?: Record<string, string>
  binaryResponse?: boolean
  outputFilename?: string
}

export type ApiEndpoint = {
  kind: 'endpoint'
  id: string
  group: ApiDocGroupId
  title: string
  summary: string
  description: string
  method: ApiMethod
  path: string
  auth: ApiAuthStyle
  contentType?: 'application/json' | 'multipart/form-data'
  parameters: ApiParameter[]
  requestExample: ApiExample
  responseExample: string
  responseLanguage?: 'json' | 'text'
  responseDescription: string
  notes?: string[]
  relatedEndpoints?: Array<{
    method: ApiMethod
    path: string
    description: string
  }>
}

export type ApiGuide = {
  kind: 'guide'
  id: 'overview' | 'authentication' | 'errors'
  group: 'start'
  title: string
  summary: string
}

export type ApiDocItem = ApiGuide | ApiEndpoint

export type ApiDocGroupId =
  | 'start'
  | 'text'
  | 'capabilities'
  | 'media'
  | 'native'
  | 'tasks'

export type ApiDocGroup = {
  id: ApiDocGroupId
  title: string
}

export type CodeLanguage = 'curl' | 'python' | 'javascript'
