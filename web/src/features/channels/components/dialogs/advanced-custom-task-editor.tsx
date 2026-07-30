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
  ArrowRight01Icon,
  Delete02Icon,
  Exchange01Icon,
  WorkflowSquare01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
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
import { AdvancedCustomTemplateHelp } from './advanced-custom-template-help'

type AdvancedCustomTaskEditorProps = {
  route: AdvancedCustomRoute
  onChange: (patch: Partial<AdvancedCustomRoute>) => void
}

const taskMethods: AdvancedCustomTaskMethod[] = ['GET', 'POST', 'PUT', 'PATCH']

export function AdvancedCustomTaskEditor(props: AdvancedCustomTaskEditorProps) {
  const { t } = useTranslation()
  const task = props.route.task
  const hasSynchronousMapping = Boolean(
    props.route.request_body_template ||
    props.route.response_body_template ||
    props.route.headers ||
    props.route.method
  )

  if (!task) {
    return (
      <ProtocolEditorShell
        modeLabel={
          hasSynchronousMapping
            ? t('Synchronous JSON mapping')
            : t('Native / pass-through')
        }
        description={t(
          'Open this section only when the upstream uses different JSON fields, custom headers, or an asynchronous task workflow.'
        )}
        defaultOpen={hasSynchronousMapping}
      >
        <Alert>
          <AlertDescription>
            {t(
              'Choose synchronous mapping when the upstream returns the final result immediately. Choose an asynchronous task for submit-and-poll video APIs.'
            )}
          </AlertDescription>
        </Alert>

        <div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
          <div>
            <p className='font-medium'>{t('Synchronous JSON mapping')}</p>
            <p className='text-muted-foreground mt-1 text-sm'>
              {t(
                'Best for non-streaming text, image, and audio providers that return their result in the first response.'
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
            <HugeiconsIcon icon={Exchange01Icon} data-icon='inline-start' />
            {t('Configure async task')}
          </Button>
        </div>

        <TaskSection
          title={t('Synchronous JSON mapping')}
          description={t(
            'Leave templates empty for direct forwarding, or map fields when the upstream JSON shape is different.'
          )}
        >
          <AdvancedCustomTemplateHelp scope='synchronous' />
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
                <SelectValue>
                  {props.route.method
                    ? props.route.method
                    : t('Same as client')}
                </SelectValue>
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
            placeholder='{"engine":"{model}","text":"{request.prompt}"}'
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
            placeholder='{"data":[{"url":"{response.result.url}"}]}'
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
            placeholder='{"X-Provider-Version":"2026-01-01"}'
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
      </ProtocolEditorShell>
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
    <ProtocolEditorShell
      modeLabel={t('Async task protocol')}
      description={t(
        'The gateway submits a task, polls the upstream until it finishes, then returns a protected result URL.'
      )}
      defaultOpen
    >
      <div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
        <Alert className='flex-1'>
          <AlertDescription>
            {t(
              'Use this workflow for video and other providers that return a task ID before the final result is ready.'
            )}
          </AlertDescription>
        </Alert>
        <Button
          type='button'
          variant='outline'
          size='sm'
          onClick={() => props.onChange({ task: undefined })}
        >
          <HugeiconsIcon icon={Delete02Icon} data-icon='inline-start' />
          {t('Use immediate response instead')}
        </Button>
      </div>

      <AsyncTaskFlow />

      <TaskSection
        step='1'
        title={t('Submit the task')}
        description={t(
          'Build the creation request, then tell the gateway where to read the upstream task ID.'
        )}
      >
        <TaskSubheading>{t('Request sent upstream')}</TaskSubheading>
        <AdvancedCustomTemplateHelp scope='submit' />
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
                <SelectValue>
                  {t(
                    (task.request_mode || 'passthrough') === 'template'
                      ? 'JSON template'
                      : 'Pass through'
                  )}
                </SelectValue>
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
            placeholder='{"prompt":"{request.prompt}","duration":"{request.seconds}"}'
            onChange={(value) => updateTask({ body_template: value })}
          />
        ) : null}
        <JsonTextarea
          label={t('Submit headers')}
          value={props.route.headers}
          objectOnly
          optional
          placeholder='{"X-Provider-Version":"2026-01-01"}'
          onChange={(value) =>
            props.onChange({
              headers: value as Record<string, string> | undefined,
            })
          }
        />
        <ExpressionScriptTextarea
          label={t('Submit request expression')}
          value={task.request_script}
          placeholder='{"body":{"prompt":body.prompt,"model":model},"headers":{"X-Region":header("X-Region")},"query":{"mode":"fast"}}'
          onChange={(value) => updateTask({ request_script: value })}
        />
        <RequestExpressionHelp />
        <Separator />
        <TaskSubheading>{t('Values read from submit response')}</TaskSubheading>
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
          <PathInput
            label={t('Error message path')}
            value={task.submit_response.error_path}
            placeholder='error.message'
            onChange={(value) => updateSubmitResponse({ error_path: value })}
          />
        </div>
        <JsonTextarea
          label={t('Status map')}
          value={task.submit_response.status_map}
          objectOnly
          optional
          placeholder='{"submitted":"SUBMITTED","failed":"FAILURE"}'
          onChange={(value) =>
            updateSubmitResponse({
              status_map: value as AdvancedCustomTaskResponse['status_map'],
            })
          }
        />
        <SafeErrorMessageFields
          response={task.submit_response}
          onChange={updateSubmitResponse}
        />
        <ExpressionScriptTextarea
          label={t('Submit response expression')}
          value={task.submit_response.script}
          placeholder='raw_body contains "500063" ? {"status":"FAILURE","message":"Content was blocked."} : nil'
          onChange={(value) => updateSubmitResponse({ script: value })}
        />
        <ResponseExpressionHelp />
      </TaskSection>

      <TaskSection
        step='2'
        title={t('Poll until finished')}
        description={t(
          'Build the status request, then map the upstream status and result fields.'
        )}
      >
        <TaskSubheading>{t('Request sent while waiting')}</TaskSubheading>
        <AdvancedCustomTemplateHelp scope='poll' />
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
            placeholder='{"task_id":"{task_id}"}'
            onChange={(value) => updatePoll({ body_template: value })}
          />
        ) : null}
        <div className='grid gap-3 md:grid-cols-2'>
          <JsonTextarea
            label={t('Poll auth')}
            value={task.poll.auth}
            objectOnly
            optional
            placeholder='{"type":"header","name":"Authorization","value":"Bearer {api_key}"}'
            onChange={(value) =>
              updatePoll({ auth: value as AdvancedCustomRouteAuth | undefined })
            }
          />
          <JsonTextarea
            label={t('Poll headers')}
            value={task.poll.headers}
            objectOnly
            optional
            placeholder='{"X-Task-ID":"{task_id}"}'
            onChange={(value) =>
              updatePoll({
                headers: value as Record<string, string> | undefined,
              })
            }
          />
        </div>
        <ExpressionScriptTextarea
          label={t('Poll request expression')}
          value={task.poll.request_script}
          placeholder='{"headers":{"X-Task-ID":task_id},"query":{"task":task_id}}'
          onChange={(value) => updatePoll({ request_script: value })}
        />
        <RequestExpressionHelp />
        <Separator />
        <TaskSubheading>{t('Values read from poll response')}</TaskSubheading>
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
          placeholder='{"pending":"QUEUED","running":"IN_PROGRESS","done":"SUCCESS","failed":"FAILURE"}'
          onChange={(value) =>
            updatePollResponse({
              status_map: value as AdvancedCustomTaskResponse['status_map'],
            })
          }
        />
        <SafeErrorMessageFields
          response={task.poll.response}
          onChange={updatePollResponse}
        />
        <ExpressionScriptTextarea
          label={t('Poll response expression')}
          value={task.poll.response.script}
          placeholder='body.code == 0 ? {"status":body.status,"progress":body.progress,"result_url":body.url} : nil'
          onChange={(value) => updatePollResponse({ script: value })}
        />
        <ResponseExpressionHelp />
      </TaskSection>

      <TaskSection
        step='3'
        title={t('Deliver the result')}
        description={t(
          'Optionally attach private download credentials. Users only receive the protected gateway or Worker URL.'
        )}
      >
        <AdvancedCustomTemplateHelp scope='download' />
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
            placeholder='{"type":"header","name":"Authorization","value":"Bearer {api_key}"}'
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
            placeholder='{"X-Download-Key":"{api_key}"}'
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
    </ProtocolEditorShell>
  )
}

function ProtocolEditorShell(props: {
  modeLabel: string
  description: string
  defaultOpen: boolean
  children: ReactNode
}) {
  const { t } = useTranslation()

  return (
    <Accordion
      defaultValue={props.defaultOpen ? ['protocol-mapping'] : []}
      className='overflow-hidden rounded-lg border'
    >
      <AccordionItem value='protocol-mapping' className='border-b-0'>
        <AccordionTrigger className='px-4 py-3 hover:no-underline'>
          <div className='flex min-w-0 items-start gap-3 pr-3'>
            <div className='bg-muted flex size-9 shrink-0 items-center justify-center rounded-lg border'>
              <HugeiconsIcon icon={WorkflowSquare01Icon} aria-hidden='true' />
            </div>
            <div className='min-w-0 text-left'>
              <div className='flex flex-wrap items-center gap-2'>
                <span className='font-medium'>
                  {t('Request, response and task mapping')}
                </span>
                <Badge variant='secondary'>{props.modeLabel}</Badge>
              </div>
              <p className='text-muted-foreground mt-1 text-xs leading-relaxed font-normal'>
                {props.description}
              </p>
            </div>
          </div>
        </AccordionTrigger>
        <AccordionContent className='border-t p-4'>
          <div className='flex flex-col gap-4'>{props.children}</div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}

function AsyncTaskFlow() {
  const { t } = useTranslation()
  const steps = [
    { number: '1', label: t('Submit and get task ID') },
    { number: '2', label: t('Poll status until complete') },
    { number: '3', label: t('Return protected result URL') },
  ]

  return (
    <div className='bg-muted/30 grid gap-2 rounded-lg border p-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] md:items-center'>
      {steps.map((step, index) => (
        <div key={step.number} className='contents'>
          <div className='flex items-center gap-2'>
            <Badge className='size-6 shrink-0 justify-center rounded-full p-0'>
              {step.number}
            </Badge>
            <span className='text-sm font-medium'>{step.label}</span>
          </div>
          {index < steps.length - 1 ? (
            <HugeiconsIcon
              icon={ArrowRight01Icon}
              className='text-muted-foreground hidden md:block'
              aria-hidden='true'
            />
          ) : null}
        </div>
      ))}
    </div>
  )
}

function TaskSection(props: {
  step?: string
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <Card size='sm'>
      <CardHeader>
        <div className='flex items-center gap-2'>
          {props.step ? (
            <Badge className='size-7 justify-center rounded-full p-0'>
              {props.step}
            </Badge>
          ) : null}
          <CardTitle>{props.title}</CardTitle>
        </div>
        {props.description ? (
          <CardDescription>{props.description}</CardDescription>
        ) : null}
      </CardHeader>
      <CardContent className='flex flex-col gap-3'>
        {props.children}
      </CardContent>
    </Card>
  )
}

function TaskSubheading(props: { children: ReactNode }) {
  return (
    <p className='text-muted-foreground text-xs font-semibold tracking-wide uppercase'>
      {props.children}
    </p>
  )
}

function TaskField(props: { label: string; children: ReactNode }) {
  return (
    <Field>
      <FieldLabel>{props.label}</FieldLabel>
      {props.children}
    </Field>
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

function SafeErrorMessageFields(props: {
  response: AdvancedCustomTaskResponse
  onChange: (patch: Partial<AdvancedCustomTaskResponse>) => void
}) {
  const { t } = useTranslation()

  return (
    <div className='space-y-3 rounded-lg border p-3'>
      <div>
        <p className='text-sm font-medium'>{t('Safe business errors')}</p>
        <p className='text-muted-foreground mt-1 text-xs'>
          {t(
            'Map business error codes to fixed safe messages. These messages take precedence over the upstream error message, and unknown codes use the default.'
          )}
        </p>
      </div>
      <PathInput
        label={t('Business error code path')}
        value={props.response.error_code_path}
        placeholder='code'
        onChange={(value) => props.onChange({ error_code_path: value })}
      />
      <JsonTextarea
        label={t('Safe error message map')}
        value={props.response.error_message_map}
        objectOnly
        optional
        placeholder='{"-2000":"Invalid request parameters."}'
        onChange={(value) =>
          props.onChange({
            error_message_map: value as Record<string, string> | undefined,
          })
        }
      />
      <TaskField label={t('Default safe error message')}>
        <Input
          value={props.response.default_error_message || ''}
          placeholder={t(
            'The request could not be processed. Please try again later.'
          )}
          onChange={(event) =>
            props.onChange({ default_error_message: event.target.value })
          }
        />
      </TaskField>
      <p className='text-muted-foreground text-xs'>
        {t(
          'Use a response expression below when matching requires HTTP status, headers, nested fields, or text contained in a non-JSON response.'
        )}
      </p>
    </div>
  )
}

function ExpressionScriptTextarea(props: {
  label: string
  value?: string
  placeholder: string
  onChange: (value: string | undefined) => void
}) {
  return (
    <TaskField label={props.label}>
      <Textarea
        value={props.value || ''}
        placeholder={props.placeholder}
        className='min-h-28 font-mono text-xs'
        onChange={(event) => props.onChange(event.target.value || undefined)}
      />
    </TaskField>
  )
}

function RequestExpressionHelp() {
  const { t } = useTranslation()

  return (
    <p className='text-muted-foreground text-xs'>
      {t(
        'Request expressions can read body, original_body, raw_body, headers, query, method, path, model, task_id and public_task_id. Return an object with optional body or raw_body, headers, query and method fields; null header or query values delete them.'
      )}
    </p>
  )
}

function ResponseExpressionHelp() {
  const { t } = useTranslation()

  return (
    <p className='text-muted-foreground text-xs'>
      {t(
        'Response expressions can also read http_status and response headers. Return nil when unmatched, or an object with task_id, upstream_status, status, message, progress or result_url. Expressions run before fixed paths and maps; only return an upstream message when you explicitly choose it.'
      )}
    </p>
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
