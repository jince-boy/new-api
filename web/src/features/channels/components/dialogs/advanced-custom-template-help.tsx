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
import { InformationCircleIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useTranslation } from 'react-i18next'

type TemplateVariableScope = 'synchronous' | 'submit' | 'poll' | 'download'

type VariableGroup = {
  label: string
  variables: string[]
}

export function AdvancedCustomTemplateHelp(props: {
  scope: TemplateVariableScope
}) {
  const { t } = useTranslation()
  let groups: VariableGroup[]

  switch (props.scope) {
    case 'synchronous':
      groups = [
        {
          label: t('Request body template'),
          variables: ['{model}', '{request}', '{request.<path>}'],
        },
        {
          label: t('Response body template'),
          variables: ['{model}', '{response}', '{response.<path>}'],
        },
        { label: t('Upstream path'), variables: ['{model}'] },
        { label: t('Authentication'), variables: ['{api_key}'] },
        {
          label: t('Custom headers'),
          variables: ['{api_key}', '{model}'],
        },
      ]
      break
    case 'submit':
      groups = [
        {
          label: t('Submit body template'),
          variables: [
            '{model}',
            '{public_task_id}',
            '{request}',
            '{request.<path>}',
          ],
        },
        { label: t('Upstream path'), variables: ['{model}'] },
        { label: t('Authentication'), variables: ['{api_key}'] },
        {
          label: t('Submit headers'),
          variables: ['{api_key}', '{model}'],
        },
      ]
      break
    case 'poll':
      groups = [
        {
          label: t('Poll upstream path'),
          variables: ['{model}', '{task_id}'],
        },
        {
          label: t('Poll body template'),
          variables: ['{model}', '{task_id}', '{public_task_id}'],
        },
        { label: t('Poll auth'), variables: ['{api_key}'] },
        {
          label: t('Poll headers'),
          variables: ['{api_key}', '{model}', '{task_id}'],
        },
      ]
      break
    case 'download':
      groups = [
        { label: t('Download auth'), variables: ['{api_key}'] },
        {
          label: t('Download headers'),
          variables: ['{api_key}', '{model}', '{task_id}'],
        },
      ]
      break
  }

  const supportsRequestFields =
    props.scope === 'synchronous' || props.scope === 'submit'
  const supportsResponseFields = props.scope === 'synchronous'
  const supportsJSONValues = props.scope !== 'download'

  return (
    <div className='bg-muted/30 rounded-lg border p-3'>
      <div className='flex items-start gap-2'>
        <HugeiconsIcon
          icon={InformationCircleIcon}
          className='text-muted-foreground mt-0.5 size-4 shrink-0'
          aria-hidden='true'
        />
        <div className='min-w-0 flex-1'>
          <p className='text-sm font-medium'>{t('Available variables:')}</p>
          <p className='text-muted-foreground mt-0.5 text-xs'>
            {t('Variable availability depends on the field being configured.')}
          </p>
        </div>
      </div>

      <div className='mt-3 grid gap-2 md:grid-cols-2'>
        {groups.map((group) => (
          <div
            key={group.label}
            className='bg-background/80 flex min-w-0 flex-col gap-1.5 rounded-md border px-2.5 py-2'
          >
            <span className='text-muted-foreground text-xs font-medium'>
              {group.label}
            </span>
            <div className='flex flex-wrap gap-1.5'>
              {group.variables.map((variable) => (
                <code
                  key={variable}
                  className='bg-muted rounded px-1.5 py-0.5 text-xs'
                >
                  {variable}
                </code>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className='text-muted-foreground mt-2 space-y-1 text-xs leading-relaxed'>
        {supportsRequestFields ? (
          <p>
            {t(
              'Client request fields are not predefined. Replace <path> with any JSON field path, such as {request.prompt}, {request.seconds}, or {request.images}.'
            )}
          </p>
        ) : null}
        {supportsResponseFields ? (
          <p>
            {t(
              'Upstream response fields are not predefined either; for example, {response.result.url} reads result.url from the upstream JSON.'
            )}
          </p>
        ) : null}
        {supportsJSONValues ? (
          <p>
            {t(
              'A placeholder used as the entire JSON value keeps its original type, and a missing field is omitted. Inside a longer string, it is converted to text.'
            )}
          </p>
        ) : null}
      </div>
    </div>
  )
}
