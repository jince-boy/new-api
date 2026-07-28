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
import { Trash2 } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

import { createAdvancedCustomTask } from '../../lib/advanced-custom'
import type {
  AdvancedCustomRoute,
  AdvancedCustomRouteAuth,
  AdvancedCustomTask,
  AdvancedCustomTaskMethod,
  AdvancedCustomTaskRequestMode,
  AdvancedCustomTaskResponse,
} from '../../types'

type AdvancedCustomTaskEditorProps = {
  route: AdvancedCustomRoute
  onChange: (patch: Partial<AdvancedCustomRoute>) => void
}

const taskMethods: AdvancedCustomTaskMethod[] = ['GET', 'POST', 'PUT', 'PATCH']

export function AdvancedCustomTaskEditor(props: AdvancedCustomTaskEditorProps) {
  const { t } = useTranslation()
  const task = props.route.task

  if (!task) {
    return (
      <div className='border-border space-y-4 border-t pt-3'>
        <div className='flex items-center justify-between gap-3'>
          <div>
            <p className='text-sm font-medium'>{t('Async task protocol')}</p>
            <p className='text-muted-foreground text-xs'>
              {t(
                'Enable this for video or other asynchronous providers with separate submit and poll APIs.'
              )}
            </p>
          </div>
          <Button
            type='button'
            variant='outline'
            size='sm'
            onClick={() =>
              props.onChange({
                converter: 'none',
                method: undefined,
                request_body_template: undefined,
                response_body_template: undefined,
                task: createAdvancedCustomTask(),
              })
            }
          >
            {t('Configure async task')}
          </Button>
        </div>

        <TaskSection title={t('Synchronous JSON mapping')}>
          <p className='text-muted-foreground text-xs'>
            {t(
              'For non-streaming text, image, and audio APIs, map arbitrary client fields to the upstream request and map the upstream JSON back to the public response format.'
            )}
          </p>
          <TaskField label={t('HTTP method')}>
            <Select
              value={props.route.method || 'client'}
              onValueChange={(value) =>
                props.onChange({
                  method:
                    value === 'client'
                      ? undefined
                      : (value as AdvancedCustomTaskMethod),
                })
              }
            >
              <SelectTrigger className='w-full'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value='client'>{t('Same as client')}</SelectItem>
                  {taskMethods.map((method) => (
                    <SelectItem key={method} value={method}>
                      {method}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </TaskField>
          <JsonTextarea
            label={t('Request body template')}
            value={props.route.request_body_template}
            optional
            placeholder={'{"engine":"{model}","text":"{request.prompt}"}'}
            onChange={(value) =>
              props.onChange({
                converter: 'none',
                request_body_template: value,
              })
            }
          />
          <JsonTextarea
            label={t('Response body template')}
            value={props.route.response_body_template}
            optional
            placeholder={'{"data":[{"url":"{response.result.url}"}]}'}
            onChange={(value) =>
              props.onChange({
                converter: 'none',
                response_body_template: value,
              })
            }
          />
          <JsonTextarea
            label={t('Custom headers')}
            value={props.route.headers}
            objectOnly
            optional
            placeholder={'{"X-Provider-Version":"2026-01-01"}'}
            onChange={(value) =>
              props.onChange({
                headers: value as Record<string, string> | undefined,
              })
            }
          />
          <p className='text-muted-foreground text-xs'>
            {t(
              'Exact placeholders preserve JSON types. Missing exact fields are omitted. Response templates do not support streaming and should use fixed per-call pricing.'
            )}
          </p>
        </TaskSection>
      </div>
    )
  }

  const updateTask = (patch: Partial<AdvancedCustomTask>) => {
    props.onChange({ task: { ...task, ...patch } })
  }
  const updateSubmitResponse = (patch: Partial<AdvancedCustomTaskResponse>) => {
    updateTask({
      submit_response: { ...task.submit_response, ...patch },
    })
  }
  const updatePoll = (patch: Partial<AdvancedCustomTask['poll']>) => {
    updateTask({ poll: { ...task.poll, ...patch } })
  }
  const updatePollResponse = (patch: Partial<AdvancedCustomTaskResponse>) => {
    updatePoll({ response: { ...task.poll.response, ...patch } })
  }

  return (
    <section className='border-border space-y-4 border-t pt-3'>
      <div className='flex items-start justify-between gap-3'>
        <div>
          <h4 className='text-sm font-semibold'>{t('Async task protocol')}</h4>
          <p className='text-muted-foreground text-xs'>
            {t(
              'Map any upstream submit, poll, status, result URL, and download authentication format without changing code.'
            )}
          </p>
        </div>
        <Button
          type='button'
          variant='ghost'
          size='icon'
          aria-label={t('Remove async task protocol')}
          onClick={() => props.onChange({ task: undefined })}
        >
          <Trash2 className='size-4' aria-hidden='true' />
        </Button>
      </div>

      <TaskSection title={t('Submit request')}>
        <div className='grid gap-3 md:grid-cols-2'>
          <TaskField label={t('HTTP method')}>
            <MethodSelect
              value={task.submit_method || 'POST'}
              onChange={(value) => updateTask({ submit_method: value })}
            />
          </TaskField>
          <TaskField label={t('Request mapping')}>
            <Select
              value={task.request_mode || 'passthrough'}
              onValueChange={(value) => {
                const requestMode = value as AdvancedCustomTaskRequestMode
                updateTask({
                  request_mode: requestMode,
                  body_template:
                    requestMode === 'template'
                      ? task.body_template || {
                          model: '{model}',
                          prompt: '{request.prompt}',
                        }
                      : undefined,
                })
              }}
            >
              <SelectTrigger className='w-full'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value='passthrough'>
                    {t('Pass through')}
                  </SelectItem>
                  <SelectItem value='template'>{t('JSON template')}</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </TaskField>
        </div>
        {task.request_mode === 'template' ? (
          <JsonTextarea
            label={t('Submit body template')}
            value={task.body_template}
            placeholder={
              '{"prompt":"{request.prompt}","duration":"{request.seconds}"}'
            }
            onChange={(value) => updateTask({ body_template: value })}
          />
        ) : null}
        <JsonTextarea
          label={t('Submit headers')}
          value={props.route.headers}
          objectOnly
          optional
          placeholder={'{"X-Provider-Version":"2026-01-01"}'}
          onChange={(value) =>
            props.onChange({
              headers: value as Record<string, string> | undefined,
            })
          }
        />
      </TaskSection>

      <TaskSection title={t('Submit response')}>
        <div className='grid gap-3 md:grid-cols-2'>
          <PathInput
            label={t('Task ID path')}
            value={task.submit_response.task_id_path}
            placeholder='data.task_id'
            onChange={(value) => updateSubmitResponse({ task_id_path: value })}
          />
          <PathInput
            label={t('Initial status path')}
            value={task.submit_response.status_path}
            placeholder='data.status'
            onChange={(value) => updateSubmitResponse({ status_path: value })}
          />
        </div>
      </TaskSection>

      <TaskSection title={t('Poll request')}>
        <div className='grid gap-3 md:grid-cols-[10rem_minmax(0,1fr)]'>
          <TaskField label={t('HTTP method')}>
            <MethodSelect
              value={task.poll.method || 'GET'}
              onChange={(value) =>
                updatePoll({
                  method: value,
                  body_template:
                    value === 'GET' ? undefined : task.poll.body_template,
                })
              }
            />
          </TaskField>
          <PathInput
            label={t('Poll upstream path')}
            value={task.poll.upstream_path}
            placeholder='/v1/videos/tasks/{task_id}'
            onChange={(value) => updatePoll({ upstream_path: value })}
          />
        </div>
        {task.poll.method && task.poll.method !== 'GET' ? (
          <JsonTextarea
            label={t('Poll body template')}
            value={task.poll.body_template}
            optional
            placeholder={'{"task_id":"{task_id}"}'}
            onChange={(value) => updatePoll({ body_template: value })}
          />
        ) : null}
        <div className='grid gap-3 md:grid-cols-2'>
          <JsonTextarea
            label={t('Poll auth')}
            value={task.poll.auth}
            objectOnly
            optional
            placeholder={
              '{"type":"header","name":"Authorization","value":"Bearer {api_key}"}'
            }
            onChange={(value) =>
              updatePoll({ auth: value as AdvancedCustomRouteAuth | undefined })
            }
          />
          <JsonTextarea
            label={t('Poll headers')}
            value={task.poll.headers}
            objectOnly
            optional
            placeholder={'{"X-Task-ID":"{task_id}"}'}
            onChange={(value) =>
              updatePoll({
                headers: value as Record<string, string> | undefined,
              })
            }
          />
        </div>
      </TaskSection>

      <TaskSection title={t('Poll response')}>
        <div className='grid gap-3 md:grid-cols-2'>
          <PathInput
            label={t('Status path')}
            value={task.poll.response.status_path}
            placeholder='data.status'
            onChange={(value) => updatePollResponse({ status_path: value })}
          />
          <PathInput
            label={t('Progress path')}
            value={task.poll.response.progress_path}
            placeholder='data.progress'
            onChange={(value) => updatePollResponse({ progress_path: value })}
          />
          <PathInput
            label={t('Result URL path')}
            value={task.poll.response.result_url_path}
            placeholder='data.url'
            onChange={(value) => updatePollResponse({ result_url_path: value })}
          />
          <PathInput
            label={t('Error message path')}
            value={task.poll.response.error_path}
            placeholder='data.error.message'
            onChange={(value) => updatePollResponse({ error_path: value })}
          />
        </div>
        <JsonTextarea
          label={t('Status map')}
          value={task.poll.response.status_map}
          objectOnly
          placeholder={
            '{"pending":"QUEUED","running":"IN_PROGRESS","done":"SUCCESS","failed":"FAILURE"}'
          }
          onChange={(value) =>
            updatePollResponse({
              status_map: value as AdvancedCustomTaskResponse['status_map'],
            })
          }
        />
      </TaskSection>

      <TaskSection title={t('Video download')}>
        <p className='text-muted-foreground text-xs'>
          {t(
            'Optional credentials are encrypted into the short-lived Cloudflare Worker link and are never shown to users.'
          )}
        </p>
        <div className='grid gap-3 md:grid-cols-2'>
          <JsonTextarea
            label={t('Download auth')}
            value={task.download?.auth}
            objectOnly
            optional
            placeholder={
              '{"type":"header","name":"Authorization","value":"Bearer {api_key}"}'
            }
            onChange={(value) =>
              updateTask({
                download: {
                  ...task.download,
                  auth: value as AdvancedCustomRouteAuth | undefined,
                },
              })
            }
          />
          <JsonTextarea
            label={t('Download headers')}
            value={task.download?.headers}
            objectOnly
            optional
            placeholder={'{"X-Download-Key":"{api_key}"}'}
            onChange={(value) =>
              updateTask({
                download: {
                  ...task.download,
                  headers: value as Record<string, string> | undefined,
                },
              })
            }
          />
        </div>
      </TaskSection>
    </section>
  )
}

function TaskSection(props: { title: string; children: ReactNode }) {
  return (
    <div className='bg-muted/30 space-y-3 rounded-lg border p-3'>
      <h5 className='text-xs font-semibold tracking-wide uppercase'>
        {props.title}
      </h5>
      {props.children}
    </div>
  )
}

function TaskField(props: { label: string; children: ReactNode }) {
  return (
    <label className='space-y-1.5'>
      <span className='text-xs font-medium'>{props.label}</span>
      {props.children}
    </label>
  )
}

function PathInput(props: {
  label: string
  value?: string
  placeholder: string
  onChange: (value: string) => void
}) {
  return (
    <TaskField label={props.label}>
      <Input
        value={props.value || ''}
        placeholder={props.placeholder}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </TaskField>
  )
}

function MethodSelect(props: {
  value: AdvancedCustomTaskMethod
  onChange: (value: AdvancedCustomTaskMethod) => void
}) {
  return (
    <Select
      value={props.value}
      onValueChange={(value) =>
        props.onChange(value as AdvancedCustomTaskMethod)
      }
    >
      <SelectTrigger className='w-full'>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {taskMethods.map((method) => (
            <SelectItem key={method} value={method}>
              {method}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}

function JsonTextarea(props: {
  label: string
  value: unknown
  placeholder: string
  onChange: (value: unknown | undefined) => void
  objectOnly?: boolean
  optional?: boolean
}) {
  const { t } = useTranslation()
  const [error, setError] = useState('')
  const serialized =
    props.value === undefined ? '' : JSON.stringify(props.value, null, 2)

  return (
    <TaskField label={props.label}>
      <Textarea
        key={serialized}
        defaultValue={serialized}
        placeholder={props.placeholder}
        className='min-h-20 font-mono text-xs'
        aria-invalid={Boolean(error)}
        onBlur={(event) => {
          const text = event.target.value.trim()
          if (!text && props.optional) {
            setError('')
            props.onChange(undefined)
            return
          }
          try {
            const parsed: unknown = JSON.parse(text)
            if (
              props.objectOnly &&
              (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
            ) {
              setError(t('Enter a JSON object'))
              return
            }
            setError('')
            props.onChange(parsed)
          } catch {
            setError(t('Enter valid JSON'))
          }
        }}
      />
      {error ? <span className='text-destructive text-xs'>{error}</span> : null}
    </TaskField>
  )
}
