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
import { Code2, FileQuestion, Zap } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { BundledLanguage } from 'shiki/bundle/web'

import {
  CodeBlock,
  CodeBlockCopyButton,
} from '@/components/ai-elements/code-block'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EndpointReference } from '@/features/api-docs/components/endpoint-reference'
import type { ApiAuthStyle, ApiExample } from '@/features/api-docs/types'
import { useStatus } from '@/hooks/use-status'

import {
  buildModelApiEndpoints,
  type ModelApiEndpoint,
} from '../lib/model-api-docs'
import type { PricingEndpointInfo, PricingModel } from '../types'

type SampleLanguage = 'curl' | 'python' | 'typescript' | 'javascript'

const SAMPLE_LANGUAGE_LABELS: Record<SampleLanguage, string> = {
  curl: 'cURL',
  python: 'Python',
  typescript: 'TypeScript',
  javascript: 'JavaScript',
}

const SAMPLE_HIGHLIGHT_LANGUAGE: Record<SampleLanguage, BundledLanguage> = {
  curl: 'bash',
  python: 'python',
  typescript: 'typescript',
  javascript: 'javascript',
}

function endpointUrl(baseUrl: string, endpoint: ModelApiEndpoint): string {
  const url = new URL(`${baseUrl}${endpoint.path}`)
  for (const [name, value] of Object.entries(
    endpoint.requestExample.query ?? {}
  )) {
    url.searchParams.set(name, value)
  }
  return url.toString()
}

function authHeaders(auth: ApiAuthStyle): Record<string, string> {
  if (auth === 'claude') {
    return {
      'x-api-key': '<YOUR_API_KEY>',
      'anthropic-version': '2023-06-01',
    }
  }
  if (auth === 'gemini') {
    return { 'x-goog-api-key': '<YOUR_API_KEY>' }
  }
  return { Authorization: 'Bearer <YOUR_API_KEY>' }
}

function curlSample(
  baseUrl: string,
  endpoint: ModelApiEndpoint,
  example: ApiExample
): string {
  const url = endpointUrl(baseUrl, endpoint)
  const lines = [`curl -X ${endpoint.method} '${url}'`]
  const headers = authHeaders(endpoint.auth)

  for (const [name, value] of Object.entries(headers)) {
    lines.push(`  -H '${name}: ${value}'`)
  }

  if (example.form) {
    for (const [name, value] of Object.entries(example.form)) {
      lines.push(`  -F '${name}=${value}'`)
    }
  } else if (example.json) {
    lines.push(`  -H 'Content-Type: application/json'`)
    lines.push(
      `  -d '${JSON.stringify(example.json, null, 2).replaceAll('\n', '\n     ')}'`
    )
  }

  return lines
    .map((line, index) => {
      if (index === lines.length - 1) return line
      return `${line} \\`
    })
    .join('\n')
}

function pythonDictionary(value: Record<string, unknown>): string {
  return JSON.stringify(value, null, 4)
    .replaceAll(/\btrue\b/g, 'True')
    .replaceAll(/\bfalse\b/g, 'False')
    .replaceAll(/\bnull\b/g, 'None')
}

function pythonSample(
  baseUrl: string,
  endpoint: ModelApiEndpoint,
  example: ApiExample
): string {
  const lines = [
    'import requests',
    '',
    `url = "${endpointUrl(baseUrl, endpoint)}"`,
    `headers = ${pythonDictionary(authHeaders(endpoint.auth))}`,
  ]

  if (example.form) {
    const data: Record<string, string> = {}
    const files: Record<string, string> = {}
    for (const [name, value] of Object.entries(example.form)) {
      if (value.startsWith('@')) {
        files[name] = value.slice(1)
      } else {
        data[name] = value
      }
    }
    lines.push(`data = ${pythonDictionary(data)}`)
    for (const [name, filename] of Object.entries(files)) {
      lines.push(`${name}_file = open("${filename}", "rb")`)
    }
    const fileEntries = Object.keys(files)
      .map((name) => `"${name}": ${name}_file`)
      .join(', ')
    lines.push(`files = {${fileEntries}}`)
    lines.push('')
    lines.push(
      `response = requests.request("${endpoint.method}", url, headers=headers, data=data, files=files, timeout=60)`
    )
  } else {
    if (example.json) {
      lines.push(`body = ${pythonDictionary(example.json)}`)
    }
    lines.push('')
    lines.push(
      `response = requests.request("${endpoint.method}", url, headers=headers${example.json ? ', json=body' : ''}, timeout=60)`
    )
  }

  lines.push('response.raise_for_status()')
  lines.push(
    example.binaryResponse
      ? `open("${example.outputFilename ?? 'response.bin'}", "wb").write(response.content)`
      : 'print(response.json())'
  )
  return lines.join('\n')
}

function browserHeaders(auth: ApiAuthStyle, hasJsonBody: boolean): string {
  const headers = authHeaders(auth)
  if (hasJsonBody) {
    headers['Content-Type'] = 'application/json'
  }
  return JSON.stringify(headers, null, 2)
}

function browserSample(
  baseUrl: string,
  endpoint: ModelApiEndpoint,
  example: ApiExample,
  language: 'typescript' | 'javascript'
): string {
  const lines: string[] = []

  if (example.form) {
    lines.push('const form = new FormData()')
    for (const [name, value] of Object.entries(example.form)) {
      if (value.startsWith('@')) {
        const filename = value.slice(1)
        lines.push(
          language === 'typescript'
            ? `form.append('${name}', fileInput.files![0], '${filename}')`
            : `form.append('${name}', fileInput.files[0], '${filename}')`
        )
      } else {
        lines.push(`form.append('${name}', '${value}')`)
      }
    }
    lines.push('')
  }

  lines.push(
    `const response = await fetch('${endpointUrl(baseUrl, endpoint)}', {`
  )
  lines.push(`  method: '${endpoint.method}',`)
  lines.push(
    `  headers: ${browserHeaders(endpoint.auth, Boolean(example.json)).replaceAll('\n', '\n  ')},`
  )
  if (example.form) {
    lines.push('  body: form,')
  } else if (example.json) {
    lines.push(
      `  body: JSON.stringify(${JSON.stringify(example.json, null, 2).replaceAll('\n', '\n  ')}),`
    )
  }
  lines.push('})')
  lines.push('')
  lines.push('if (!response.ok) throw new Error(await response.text())')
  lines.push(
    example.binaryResponse
      ? 'const data = await response.arrayBuffer()'
      : 'const data = await response.json()'
  )
  lines.push('console.log(data)')
  return lines.join('\n')
}

function buildSample(
  language: SampleLanguage,
  baseUrl: string,
  endpoint: ModelApiEndpoint
): string {
  if (language === 'curl') {
    return curlSample(baseUrl, endpoint, endpoint.requestExample)
  }
  if (language === 'python') {
    return pythonSample(baseUrl, endpoint, endpoint.requestExample)
  }
  return browserSample(baseUrl, endpoint, endpoint.requestExample, language)
}

function CodeSamples(props: { endpoint: ModelApiEndpoint; baseUrl: string }) {
  const { t } = useTranslation()
  const [language, setLanguage] = useState<SampleLanguage>('curl')
  const code = buildSample(language, props.baseUrl, props.endpoint)

  return (
    <section
      className='flex flex-col gap-4'
      aria-labelledby='code-samples-title'
    >
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <h2
          id='code-samples-title'
          className='flex items-center gap-2 text-lg font-semibold tracking-tight'
        >
          <Code2 className='text-muted-foreground size-4' aria-hidden='true' />
          {t('Code samples')}
        </h2>
        <Tabs
          value={language}
          onValueChange={(value) => setLanguage(value as SampleLanguage)}
        >
          <TabsList>
            {(Object.keys(SAMPLE_LANGUAGE_LABELS) as SampleLanguage[]).map(
              (item) => (
                <TabsTrigger key={item} value={item}>
                  {SAMPLE_LANGUAGE_LABELS[item]}
                </TabsTrigger>
              )
            )}
          </TabsList>
        </Tabs>
      </div>
      <CodeBlock
        code={code}
        language={SAMPLE_HIGHLIGHT_LANGUAGE[language]}
        enableCollapse={false}
        maxExpandedLines={30}
      >
        <CodeBlockCopyButton />
      </CodeBlock>
    </section>
  )
}

export function ModelDetailsApi(props: {
  model: PricingModel
  endpointMap: Record<string, PricingEndpointInfo>
}) {
  const { t } = useTranslation()
  const { status } = useStatus()
  const [selectedEndpointType, setSelectedEndpointType] = useState('')
  const endpoints = useMemo(
    () => buildModelApiEndpoints(props.model, props.endpointMap),
    [props.endpointMap, props.model]
  )
  const activeEndpoint =
    endpoints.find(
      (endpoint) => endpoint.endpointType === selectedEndpointType
    ) ?? endpoints[0]
  const baseUrl = useMemo(() => {
    const candidate =
      (status as Record<string, unknown> | null)?.server_address ??
      (status as Record<string, unknown> | null)?.serverAddress ??
      (status?.data as Record<string, unknown> | undefined)?.server_address ??
      (status?.data as Record<string, unknown> | undefined)?.serverAddress
    if (typeof candidate === 'string' && candidate) {
      return candidate.replace(/\/$/, '')
    }
    if (typeof window !== 'undefined') return window.location.origin
    return 'https://api.example.com'
  }, [status])

  if (!activeEndpoint) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant='icon'>
            <FileQuestion aria-hidden='true' />
          </EmptyMedia>
          <EmptyTitle>{t('API Endpoints')}</EmptyTitle>
          <EmptyDescription>{t('No data available')}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className='flex flex-col gap-8'>
      {endpoints.length > 1 && (
        <Tabs
          value={activeEndpoint.endpointType}
          onValueChange={setSelectedEndpointType}
        >
          <TabsList className='h-auto w-full justify-start overflow-x-auto p-1'>
            {endpoints.map((endpoint) => (
              <TabsTrigger
                key={endpoint.endpointType}
                value={endpoint.endpointType}
                className='min-w-fit px-3 py-2'
              >
                {endpoint.endpointType}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}

      <EndpointReference
        key={`${props.model.model_name}:${activeEndpoint.endpointType}`}
        endpoint={activeEndpoint}
      />
      <CodeSamples endpoint={activeEndpoint} baseUrl={baseUrl} />
    </div>
  )
}

export { Zap as ApiTabIcon }
