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
import { InformationCircleIcon, Shield01Icon } from '@hugeicons/core-free-icons'
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
import { cn } from '@/lib/utils'

import { apiDocGroups } from '../data/catalog'
import type { ApiAuthStyle, ApiEndpoint } from '../types'
import { MethodBadge } from './method-badge'

function authDescription(auth: ApiAuthStyle): string {
  if (auth === 'claude') {
    return 'Send the API key in x-api-key and include anthropic-version: 2023-06-01. Bearer authentication is also accepted.'
  }
  if (auth === 'gemini') {
    return 'Send the API key in x-goog-api-key. Bearer authentication and the key query parameter are supported for compatible clients.'
  }
  if (auth === 'websocket') {
    return 'Use a Bearer header on server-side clients. Browser clients can carry the key in the documented WebSocket subprotocol.'
  }
  return 'Send the API key as Authorization: Bearer sk-your-api-key.'
}

function ParameterTable(props: { endpoint: ApiEndpoint }) {
  const { t } = useTranslation()

  if (props.endpoint.parameters.length === 0) {
    return (
      <p className='text-muted-foreground text-sm'>
        {t('This endpoint has no request parameters.')}
      </p>
    )
  }

  return (
    <div className='overflow-x-auto border-y'>
      <Table>
        <TableHeader>
          <TableRow className='bg-muted/20 hover:bg-muted/20'>
            <TableHead>{t('Name')}</TableHead>
            <TableHead>{t('Location')}</TableHead>
            <TableHead>{t('Type')}</TableHead>
            <TableHead>{t('Required')}</TableHead>
            <TableHead className='min-w-64'>{t('Description')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {props.endpoint.parameters.map((parameter) => (
            <TableRow key={`${parameter.location}-${parameter.name}`}>
              <TableCell className='py-4 font-mono text-xs font-semibold'>
                {parameter.name}
              </TableCell>
              <TableCell className='text-muted-foreground font-mono text-xs'>
                {parameter.location}
              </TableCell>
              <TableCell className='text-muted-foreground font-mono text-xs'>
                {parameter.type}
              </TableCell>
              <TableCell>
                <span
                  className={cn(
                    'text-xs font-medium',
                    !parameter.required && 'text-muted-foreground'
                  )}
                >
                  {parameter.required ? t('Required') : t('Optional')}
                </span>
              </TableCell>
              <TableCell className='text-muted-foreground py-4 leading-6 whitespace-normal'>
                {t(parameter.description)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

export function EndpointReference(props: { endpoint: ApiEndpoint }) {
  const { t } = useTranslation()
  const group = apiDocGroups.find((item) => item.id === props.endpoint.group)

  return (
    <article className='min-w-0'>
      <header className='flex flex-col gap-6 border-b pb-10'>
        <div className='flex flex-col gap-3'>
          <p className='text-muted-foreground text-[11px] font-semibold tracking-[0.16em] uppercase'>
            {group ? t(group.title) : t('API Reference')}
          </p>
          <div className='flex flex-col gap-3'>
            <h1 className='text-3xl font-semibold tracking-[-0.025em] text-balance md:text-[2.5rem] md:leading-[1.12]'>
              {t(props.endpoint.title)}
            </h1>
            <p className='text-muted-foreground max-w-2xl text-base leading-7 md:text-[17px]'>
              {t(props.endpoint.summary)}
            </p>
          </div>
        </div>
        <div className='bg-muted/35 flex min-w-0 items-center gap-3 rounded-xl border px-3.5 py-3 shadow-xs'>
          <MethodBadge method={props.endpoint.method} />
          <code className='min-w-0 flex-1 truncate font-mono text-sm'>
            {props.endpoint.path}
          </code>
          <CopyButton
            value={props.endpoint.path}
            tooltip={t('Copy endpoint path')}
            successTooltip={t('Endpoint path copied')}
          />
        </div>
        <div className='text-muted-foreground flex flex-wrap items-center gap-2 text-xs'>
          <span>{t('Stable')}</span>
          {props.endpoint.contentType && (
            <>
              <span aria-hidden='true'>·</span>
              <code className='font-mono'>{props.endpoint.contentType}</code>
            </>
          )}
        </div>
      </header>

      <div className='mt-10 flex flex-col gap-12'>
        <p className='text-foreground/85 max-w-2xl text-[15px] leading-7'>
          {t(props.endpoint.description)}
        </p>

        <section
          className='flex gap-4 border-y py-5'
          aria-labelledby='authentication-title'
        >
          <div className='bg-muted/60 flex size-9 shrink-0 items-center justify-center rounded-full'>
            <HugeiconsIcon
              icon={Shield01Icon}
              strokeWidth={2}
              className='size-4'
              aria-hidden='true'
            />
          </div>
          <div className='flex flex-col gap-1.5'>
            <h2 id='authentication-title' className='text-sm font-semibold'>
              {t('Authentication')}
            </h2>
            <p className='text-muted-foreground text-sm leading-6'>
              {t(authDescription(props.endpoint.auth))}
            </p>
          </div>
        </section>

        <section
          className='flex flex-col gap-4'
          aria-labelledby='parameters-title'
        >
          <div className='flex flex-col gap-1'>
            <h2
              id='parameters-title'
              className='text-lg font-semibold tracking-tight'
            >
              {t('Request parameters')}
            </h2>
            <p className='text-muted-foreground text-sm leading-6'>
              {t(
                'Only send optional fields when the selected model supports them.'
              )}
            </p>
          </div>
          <ParameterTable endpoint={props.endpoint} />
        </section>

        {props.endpoint.relatedEndpoints &&
          props.endpoint.relatedEndpoints.length > 0 && (
            <section
              className='flex flex-col gap-4'
              aria-labelledby='related-endpoints-title'
            >
              <h2
                id='related-endpoints-title'
                className='text-lg font-semibold tracking-tight'
              >
                {t('Related endpoints')}
              </h2>
              <div className='overflow-x-auto border-y'>
                <Table>
                  <TableBody>
                    {props.endpoint.relatedEndpoints.map((endpoint) => (
                      <TableRow key={`${endpoint.method}-${endpoint.path}`}>
                        <TableCell className='w-20 py-4'>
                          <MethodBadge method={endpoint.method} />
                        </TableCell>
                        <TableCell className='font-mono text-xs whitespace-normal'>
                          {endpoint.path}
                        </TableCell>
                        <TableCell className='text-muted-foreground whitespace-normal'>
                          {t(endpoint.description)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </section>
          )}

        {props.endpoint.notes && props.endpoint.notes.length > 0 && (
          <section className='bg-muted/35 flex gap-4 rounded-2xl px-5 py-4'>
            <HugeiconsIcon
              icon={InformationCircleIcon}
              strokeWidth={2}
              className='mt-0.5 size-4 shrink-0'
              aria-hidden='true'
            />
            <div className='flex flex-col gap-2'>
              <h2 className='text-sm font-semibold'>{t('Good to know')}</h2>
              <ul className='text-muted-foreground flex list-disc flex-col gap-1.5 pl-4 text-sm leading-6'>
                {props.endpoint.notes.map((note) => (
                  <li key={note}>{t(note)}</li>
                ))}
              </ul>
            </div>
          </section>
        )}

        <section
          className='flex flex-col gap-4'
          aria-labelledby='response-title'
        >
          <div className='flex flex-col gap-1'>
            <h2
              id='response-title'
              className='text-lg font-semibold tracking-tight'
            >
              {t('Example response')}
            </h2>
            <p className='text-muted-foreground text-sm leading-6'>
              {t(props.endpoint.responseDescription)}
            </p>
          </div>
          <CodeBlock
            code={props.endpoint.responseExample}
            language={props.endpoint.responseLanguage ?? 'json'}
            enableCollapse={false}
            maxExpandedLines={24}
            title={t('Response')}
            className='my-0 rounded-xl shadow-none'
          >
            <CodeBlockCopyButton />
          </CodeBlock>
        </section>
      </div>
    </article>
  )
}
