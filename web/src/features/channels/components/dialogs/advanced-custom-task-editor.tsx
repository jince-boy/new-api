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
import ArrowRight01Icon from '@hugeicons/core-free-icons/ArrowRight01Icon'
import Delete02Icon from '@hugeicons/core-free-icons/Delete02Icon'
import Exchange01Icon from '@hugeicons/core-free-icons/Exchange01Icon'
import WorkflowSquare01Icon from '@hugeicons/core-free-icons/WorkflowSquare01Icon'
import { HugeiconsIcon } from '@hugeicons/react'
import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { CodeBlockEditor } from '@/components/ai-elements/code-block'
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
  const updatePoll = (patch: Partial<AdvancedCustomTask['poll']>) => {
    updateTask({ poll: { ...task.poll, ...patch } })
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
        <TaskField label={t('HTTP method')}>
          <MethodSelect
            value={task.submit_method || 'POST'}
            onChange={(value) => updateTask({ submit_method: value })}
          />
        </TaskField>
        <ScriptEditor
          label={t('Submit headers code')}
          onPassThrough={() =>
            updateTask({
              headers_script: undefined,
              request_script: undefined,
            })
          }
          value={task.headers_script}
          placeholder={`return {
  'X-Provider-Version': header['x-provider-version'],
}`}
          onChange={(value) =>
            updateTask({ headers_script: value, request_script: undefined })
          }
        />
        <ScriptEditor
          label={t('Submit body code')}
          onPassThrough={() =>
            updateTask({
              body_script: undefined,
              body_template: undefined,
              request_mode: undefined,
              request_script: undefined,
            })
          }
          value={task.body_script}
          placeholder={`return {
  prompt: body.prompt,
  images: body.images,
}`}
          onChange={(value) =>
            updateTask({
              body_script: value,
              body_template: undefined,
              request_mode: undefined,
              request_script: undefined,
            })
          }
        />
        <RequestScriptHelp />
        <Separator />
        <TaskSubheading>{t('Values read from submit response')}</TaskSubheading>
        <ScriptEditor
          label={t('Submit response code')}
          value={task.submit_response.response_script}
          placeholder={`const data = row_response.body?.data
return {
  task_id: data?.task_id,
  status: 'SUBMITTED',
}`}
          onChange={(value) =>
            updateTask({
              submit_response: value ? { response_script: value } : {},
            })
          }
        />
        <ResponseScriptHelp phase='submit' />
      </TaskSection>

      <TaskSection
        step='2'
        title={t('Poll until finished')}
        description={t(
          'Build the status request, then map the upstream status and result fields.'
        )}
      >
        <TaskSubheading>{t('Request sent while waiting')}</TaskSubheading>
        <div className='grid gap-3 md:grid-cols-[10rem_minmax(0,1fr)]'>
          <TaskField label={t('HTTP method')}>
            <MethodSelect
              value={task.poll.method || 'GET'}
              onChange={(value) =>
                updatePoll({
                  method: value,
                })
              }
            />
          </TaskField>
          <TaskField label={t('Poll upstream path')}>
            <Input
              value={task.poll.upstream_path}
              placeholder='/v1/videos/tasks/{task_id}'
              onChange={(event) =>
                updatePoll({ upstream_path: event.target.value })
              }
            />
          </TaskField>
        </div>
        <ScriptEditor
          label={t('Poll headers code')}
          onPassThrough={() =>
            updatePoll({
              headers_script: undefined,
              request_script: undefined,
            })
          }
          value={task.poll.headers_script}
          placeholder={`return {
  'X-Task-ID': body.task_id,
}`}
          onChange={(value) =>
            updatePoll({ headers_script: value, request_script: undefined })
          }
        />
        <ScriptEditor
          label={t('Poll body code')}
          onPassThrough={() =>
            updatePoll({
              body_script: undefined,
              body_template: undefined,
              request_script: undefined,
            })
          }
          value={task.poll.body_script}
          placeholder={`return {
  task_id: body.task_id,
}`}
          onChange={(value) =>
            updatePoll({
              body_script: value,
              body_template: undefined,
              request_script: undefined,
            })
          }
        />
        <RequestScriptHelp poll />
        <Separator />
        <TaskSubheading>{t('Values read from poll response')}</TaskSubheading>
        <ScriptEditor
          label={t('Poll response code')}
          value={task.poll.response.response_script}
          placeholder={`const data = row_response.body?.data
const statusMap: Record<string, string> = {
  pending: 'QUEUED',
  running: 'IN_PROGRESS',
  done: 'SUCCESS',
  failed: 'FAILURE',
}
return {
  status: statusMap[data?.status],
  progress: data?.progress,
  result_url: data?.url,
  message: data?.error,
}`}
          onChange={(value) =>
            updatePoll({
              response: value ? { response_script: value } : {},
            })
          }
        />
        <ResponseScriptHelp phase='poll' />
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

function ScriptEditor(props: {
  label: string
  onPassThrough?: () => void
  value?: string
  placeholder: string
  onChange: (value: string | undefined) => void
}) {
  const { t } = useTranslation()
  const value = props.value || ''

  return (
    <TaskField label={props.label}>
      <CodeBlockEditor
        actions={
          props.onPassThrough ? (
            <Button
              onClick={props.onPassThrough}
              size='sm'
              type='button'
              variant='ghost'
            >
              {t('Pass through')}
            </Button>
          ) : undefined
        }
        ariaLabel={props.label}
        autoFocus={false}
        language='typescript'
        onChange={(nextValue) => props.onChange(nextValue || undefined)}
        placeholder={props.placeholder}
        rows={7}
        title={t('TypeScript / JavaScript')}
        value={value}
      />
      {!value ? (
        <p className='text-muted-foreground text-xs'>
          {t('The sample is a placeholder and is not saved until you edit it.')}
        </p>
      ) : null}
    </TaskField>
  )
}

function RequestScriptHelp(props: { poll?: boolean }) {
  const { t } = useTranslation()

  return (
    <div className='bg-muted/30 space-y-1 rounded-lg border p-3 text-xs'>
      <p className='font-medium'>{t('Request code contract')}</p>
      <p className='text-muted-foreground'>
        {props.poll
          ? t(
              'The only variables are header and body. For polling, body contains task_id, public_task_id, and model.'
            )
          : t(
              'The only variables are header and body. They contain the client request headers and parsed JSON body.'
            )}
      </p>
      <p className='text-muted-foreground'>
        {t(
          'Header code must return an object whose values are strings, numbers, booleans, or null. Body code must return a JSON object.'
        )}
      </p>
    </div>
  )
}

function ResponseScriptHelp(props: { phase: 'submit' | 'poll' }) {
  const { t } = useTranslation()

  return (
    <div className='bg-muted/30 space-y-1 rounded-lg border p-3 text-xs'>
      <p className='font-medium'>{t('Response code contract')}</p>
      <p className='text-muted-foreground'>
        {t(
          'The only variable is row_response: { status_code, header, body, raw_body }. body is parsed JSON when possible; header keys are lowercase.'
        )}
      </p>
      <p className='text-muted-foreground'>
        {props.phase === 'submit'
          ? t(
              'Return { task_id, status?, upstream_status?, message? }. task_id is required unless status is FAILURE.'
            )
          : t(
              'Return { status, progress?, result_url?, message?, upstream_status? }. status must be SUBMITTED, QUEUED, IN_PROGRESS, SUCCESS, or FAILURE; result_url is required for SUCCESS.'
            )}
      </p>
    </div>
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
