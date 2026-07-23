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
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group'

import type { ApiBaseUrls } from '../lib/base-urls'

type ApiBaseUrlFieldsProps = {
  urls: ApiBaseUrls
}

export function ApiBaseUrlFields(props: ApiBaseUrlFieldsProps) {
  const { t } = useTranslation()

  return (
    <FieldSet className='min-w-0 flex-1 gap-2 lg:max-w-3xl'>
      <FieldLegend variant='label'>{t('Base URL')}</FieldLegend>
      <FieldGroup className='grid min-w-0 gap-2 sm:grid-cols-2'>
        <Field className='min-w-0 gap-1'>
          <FieldLabel htmlFor='claude-base-url' className='sr-only'>
            {t('Claude')}
          </FieldLabel>
          <InputGroup>
            <InputGroupAddon className='min-w-16 justify-start pr-1'>
              {t('Claude')}
            </InputGroupAddon>
            <InputGroupInput
              id='claude-base-url'
              value={props.urls.claude}
              readOnly
              onFocus={(event) => event.currentTarget.select()}
              className='font-mono text-xs'
            />
            <InputGroupAddon align='inline-end'>
              <CopyButton
                value={props.urls.claude}
                className='size-6'
                iconClassName='size-3.5'
                tooltip={t('Copy to clipboard')}
                successTooltip={t('Copied!')}
              />
            </InputGroupAddon>
          </InputGroup>
        </Field>

        <Field className='min-w-0 gap-1'>
          <FieldLabel htmlFor='openai-base-url' className='sr-only'>
            {t('OpenAI')}
          </FieldLabel>
          <InputGroup>
            <InputGroupAddon className='min-w-16 justify-start pr-1'>
              {t('OpenAI')}
            </InputGroupAddon>
            <InputGroupInput
              id='openai-base-url'
              value={props.urls.openai}
              readOnly
              onFocus={(event) => event.currentTarget.select()}
              className='font-mono text-xs'
            />
            <InputGroupAddon align='inline-end'>
              <CopyButton
                value={props.urls.openai}
                className='size-6'
                iconClassName='size-3.5'
                tooltip={t('Copy to clipboard')}
                successTooltip={t('Copied!')}
              />
            </InputGroupAddon>
          </InputGroup>
        </Field>
      </FieldGroup>
    </FieldSet>
  )
}
