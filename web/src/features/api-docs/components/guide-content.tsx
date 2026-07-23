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
  AlertCircleIcon,
  CheckmarkCircle01Icon,
  InformationCircleIcon,
  Shield01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useTranslation } from 'react-i18next'

import {
  CodeBlock,
  CodeBlockCopyButton,
} from '@/components/ai-elements/code-block'
import { CopyButton } from '@/components/copy-button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import type { ApiGuide } from '../types'

const errorExample = `{
  "error": {
    "message": "model is required (request id: ...)",
    "type": "new_api_error",
    "param": "",
    "code": "invalid_request"
  }
}`

function GuideHeader(props: { guide: ApiGuide }) {
  const { t } = useTranslation()

  return (
    <header className='flex flex-col gap-3 border-b pb-10'>
      <p className='text-muted-foreground text-[11px] font-semibold tracking-[0.16em] uppercase'>
        {t('Guide')}
      </p>
      <h1 className='text-3xl font-semibold tracking-[-0.025em] text-balance md:text-[2.5rem] md:leading-[1.12]'>
        {t(props.guide.title)}
      </h1>
      <p className='text-muted-foreground max-w-2xl text-base leading-7 md:text-[17px]'>
        {t(props.guide.summary)}
      </p>
    </header>
  )
}

function OverviewGuide(props: { baseUrl: string; guide: ApiGuide }) {
  const { t } = useTranslation()
  const steps = [
    {
      title: 'Create an API key',
      description:
        'Create a key in the console and keep it on your server. Treat it like a password.',
    },
    {
      title: 'Choose a compatible model',
      description:
        'Call the model list and check supported_endpoint_types before choosing an API format.',
    },
  ]
  const protocols = [
    ['OpenAI compatible', '/v1/chat/completions'],
    ['Claude native', '/v1/messages'],
    ['Gemini native', '/v1beta/models/{model}:generateContent'],
  ]

  return (
    <article className='flex min-w-0 flex-col gap-12'>
      <GuideHeader guide={props.guide} />

      <section className='flex gap-4 border-l-2 pl-5'>
        <HugeiconsIcon
          icon={InformationCircleIcon}
          strokeWidth={2}
          className='mt-0.5 size-4 shrink-0'
          aria-hidden='true'
        />
        <div className='flex flex-col gap-1.5'>
          <h2 className='text-sm font-semibold'>
            {t('One gateway, several API formats')}
          </h2>
          <p className='text-muted-foreground text-sm leading-6'>
            {t(
              'Use OpenAI, Claude, or Gemini request shapes against the same deployment. The model list tells you which format each model supports.'
            )}
          </p>
        </div>
      </section>

      <section className='flex flex-col gap-4' aria-labelledby='base-url-title'>
        <div className='flex flex-col gap-1'>
          <h2
            id='base-url-title'
            className='text-lg font-semibold tracking-tight'
          >
            {t('Base URL')}
          </h2>
        </div>
        <div className='bg-muted/35 flex min-w-0 items-center gap-3 rounded-xl border px-4 py-3 shadow-xs'>
          <code className='min-w-0 flex-1 truncate font-mono text-sm'>
            {props.baseUrl}
          </code>
          <CopyButton
            value={props.baseUrl}
            tooltip={t('Copy base URL')}
            successTooltip={t('Base URL copied')}
          />
        </div>
      </section>

      <section
        className='flex flex-col gap-4'
        aria-labelledby='quick-start-title'
      >
        <h2
          id='quick-start-title'
          className='text-lg font-semibold tracking-tight'
        >
          {t('Quick start')}
        </h2>
        <ol className='divide-y border-y'>
          {steps.map((step, index) => (
            <li
              key={step.title}
              className='grid gap-3 py-5 sm:grid-cols-[48px_1fr]'
            >
              <span className='text-muted-foreground font-mono text-xs'>
                0{index + 1}
              </span>
              <div className='flex flex-col gap-1'>
                <h3 className='text-sm font-semibold'>{t(step.title)}</h3>
                <p className='text-muted-foreground text-sm leading-6'>
                  {t(step.description)}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className='divide-y border-y' aria-label={t('Quick start')}>
        {protocols.map(([title, path]) => (
          <div
            key={title}
            className='grid gap-1 py-4 sm:grid-cols-[180px_1fr] sm:items-center'
          >
            <p className='text-sm font-medium'>{t(title)}</p>
            <code className='text-muted-foreground font-mono text-xs break-all sm:text-right'>
              {path}
            </code>
          </div>
        ))}
      </section>
    </article>
  )
}

function AuthenticationGuide(props: { guide: ApiGuide }) {
  const { t } = useTranslation()
  const rows = [
    [
      'OpenAI-compatible APIs',
      'Authorization: Bearer sk-your-api-key',
      'Recommended',
    ],
    [
      'Claude Messages API',
      'x-api-key: sk-your-api-key',
      'Also accepts Bearer',
    ],
    [
      'Gemini native API',
      'x-goog-api-key: sk-your-api-key',
      'Also accepts Bearer or ?key=',
    ],
    [
      'Realtime WebSocket',
      'Authorization or WebSocket subprotocol',
      'Depends on the client',
    ],
  ]
  const checklist = [
    'Use HTTPS or WSS for every production request.',
    'Store keys in a secret manager or protected environment variable.',
    'Give each application its own key and model restrictions.',
    'Rotate a key immediately if it may have been exposed.',
    'Avoid the Gemini key query parameter because URLs are commonly logged.',
    'Record X-Oneapi-Request-Id for support without recording the API key.',
  ]

  return (
    <article className='flex min-w-0 flex-col gap-12'>
      <GuideHeader guide={props.guide} />

      <section className='bg-muted/35 flex gap-4 rounded-2xl px-5 py-4'>
        <HugeiconsIcon
          icon={Shield01Icon}
          strokeWidth={2}
          className='mt-0.5 size-4 shrink-0'
          aria-hidden='true'
        />
        <div className='flex flex-col gap-1.5'>
          <h2 className='text-sm font-semibold'>
            {t('Keep API keys on the server')}
          </h2>
          <p className='text-muted-foreground text-sm leading-6'>
            {t(
              'Never embed a permanent API key in browser code, a mobile package, logs, or a public repository.'
            )}
          </p>
        </div>
      </section>

      <section className='flex flex-col gap-4'>
        <h2 className='text-lg font-semibold tracking-tight'>
          {t('Supported authentication')}
        </h2>
        <div className='overflow-x-auto border-y'>
          <Table>
            <TableHeader>
              <TableRow className='bg-muted/20 hover:bg-muted/20'>
                <TableHead>{t('Protocol')}</TableHead>
                <TableHead>{t('Header')}</TableHead>
                <TableHead>{t('Notes')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row[0]}>
                  <TableCell className='py-4 font-medium'>
                    {t(row[0])}
                  </TableCell>
                  <TableCell className='py-4 font-mono text-xs whitespace-normal'>
                    {row[1]}
                  </TableCell>
                  <TableCell className='text-muted-foreground py-4 whitespace-normal'>
                    {t(row[2])}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className='flex flex-col gap-4'>
        <h2 className='text-lg font-semibold tracking-tight'>
          {t('Production checklist')}
        </h2>
        <ul className='grid gap-x-8 sm:grid-cols-2'>
          {checklist.map((item) => (
            <li
              key={item}
              className='flex gap-3 border-t py-4 text-sm leading-6'
            >
              <HugeiconsIcon
                icon={CheckmarkCircle01Icon}
                strokeWidth={2}
                className='text-muted-foreground mt-1 size-4 shrink-0'
                aria-hidden='true'
              />
              {t(item)}
            </li>
          ))}
        </ul>
      </section>
    </article>
  )
}

function ErrorsGuide(props: { guide: ApiGuide }) {
  const { t } = useTranslation()
  const statuses = [
    ['400', 'Invalid request', 'Fix the request before retrying.'],
    ['401', 'Invalid API key', 'Check the key and authentication header.'],
    [
      '403',
      'Access denied',
      'Check account, IP, group, and model restrictions.',
    ],
    ['413', 'Request too large', 'Reduce the file or request body size.'],
    [
      '429',
      'Rate limit or insufficient quota',
      'Back off and check available quota.',
    ],
    ['500', 'Gateway error', 'Retry carefully and keep the request ID.'],
    ['502 / 503', 'Upstream unavailable', 'Use bounded exponential backoff.'],
    ['501', 'API not implemented', 'Switch to a supported endpoint.'],
  ]
  const reservedRoutes = [
    'POST /v1/images/variations',
    'GET, POST, DELETE /v1/files...',
    'GET, POST /v1/fine-tunes...',
    'DELETE /v1/models/{model}',
  ]

  return (
    <article className='flex min-w-0 flex-col gap-12'>
      <GuideHeader guide={props.guide} />

      <section className='flex flex-col gap-4'>
        <div className='flex flex-col gap-1'>
          <h2 className='text-lg font-semibold tracking-tight'>
            {t('Error envelope')}
          </h2>
          <p className='text-muted-foreground text-sm leading-6'>
            {t(
              'Most endpoints use the OpenAI-compatible error shape below. Claude keeps its native type and error envelope.'
            )}
          </p>
        </div>
        <CodeBlock
          code={errorExample}
          language='json'
          enableCollapse={false}
          title={t('Error response')}
          className='my-0 rounded-xl shadow-none'
        >
          <CodeBlockCopyButton />
        </CodeBlock>
      </section>

      <section className='flex flex-col gap-4'>
        <h2 className='text-lg font-semibold tracking-tight'>
          {t('HTTP status codes')}
        </h2>
        <div className='overflow-x-auto border-y'>
          <Table>
            <TableHeader>
              <TableRow className='bg-muted/20 hover:bg-muted/20'>
                <TableHead>{t('Status')}</TableHead>
                <TableHead>{t('Meaning')}</TableHead>
                <TableHead>{t('What to do')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {statuses.map((status) => (
                <TableRow key={status[0]}>
                  <TableCell className='py-4 font-mono text-xs font-semibold'>
                    {status[0]}
                  </TableCell>
                  <TableCell className='py-4 font-medium whitespace-normal'>
                    {t(status[1])}
                  </TableCell>
                  <TableCell className='text-muted-foreground py-4 whitespace-normal'>
                    {t(status[2])}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className='flex flex-col gap-4'>
        <div className='flex flex-col gap-1'>
          <h2 className='text-lg font-semibold tracking-tight'>
            {t('Reserved endpoints')}
          </h2>
          <p className='text-muted-foreground text-sm leading-6'>
            {t(
              'The compatibility routes below are reserved but not implemented. They always return HTTP 501 with code api_not_implemented; do not build a production workflow around them.'
            )}
          </p>
        </div>
        <div className='divide-y border-y'>
          {reservedRoutes.map((route) => (
            <code key={route} className='block py-3 font-mono text-xs'>
              {route}
            </code>
          ))}
        </div>
      </section>

      <section className='border-destructive/40 flex gap-4 border-l-2 pl-5'>
        <HugeiconsIcon
          icon={AlertCircleIcon}
          strokeWidth={2}
          className='text-destructive mt-0.5 size-4 shrink-0'
          aria-hidden='true'
        />
        <div className='flex flex-col gap-1.5'>
          <h2 className='text-sm font-semibold'>
            {t('Retry task creation carefully')}
          </h2>
          <p className='text-muted-foreground text-sm leading-6'>
            {t(
              'If an image, video, or music request times out after reaching the server, blindly submitting it again can create a duplicate task and a second charge. Check for the original task result first.'
            )}
          </p>
        </div>
      </section>
    </article>
  )
}

export function GuideContent(props: { baseUrl: string; guide: ApiGuide }) {
  if (props.guide.id === 'authentication') {
    return <AuthenticationGuide guide={props.guide} />
  }
  if (props.guide.id === 'errors') {
    return <ErrorsGuide guide={props.guide} />
  }
  return <OverviewGuide baseUrl={props.baseUrl} guide={props.guide} />
}
