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
import { ChevronDown, RotateCcw, SlidersHorizontal } from 'lucide-react'
import { Controller, type UseFormReturn } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'

import type { SchedulingSettingsForm } from '../lib/scheduling-settings'
import { recommendedTuning, tuningSections } from '../lib/scheduling-tuning'

interface AdvancedTuningFieldsProps {
  form: UseFormReturn<SchedulingSettingsForm>
}

export function AdvancedTuningFields(props: AdvancedTuningFieldsProps) {
  const { t } = useTranslation()

  return (
    <Collapsible className='rounded-lg border'>
      <div className='flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between'>
        <div className='space-y-1'>
          <div className='flex items-center gap-2 font-medium'>
            <SlidersHorizontal className='size-4' aria-hidden='true' />
            {t('Advanced tuning')}
          </div>
          <p className='text-muted-foreground text-sm'>
            {t(
              'The recommended values are already active. Most deployments do not need to change these parameters.'
            )}
          </p>
        </div>
        <CollapsibleTrigger
          render={<Button type='button' size='sm' variant='outline' />}
        >
          {t('Show advanced settings')}
          <ChevronDown className='size-4' aria-hidden='true' />
        </CollapsibleTrigger>
      </div>

      <CollapsibleContent className='border-t p-4'>
        <div className='flex flex-col gap-6'>
          <Alert>
            <AlertTitle>
              {t('Advanced settings affect live traffic')}
            </AlertTitle>
            <AlertDescription>
              {t(
                'Change these values only after reviewing the real-time charts. Invalid combinations are rejected before anything is saved.'
              )}
            </AlertDescription>
          </Alert>

          <FieldSet>
            <FieldLegend>{t('Session affinity')}</FieldLegend>
            <FieldDescription>
              {t(
                'When enabled, reliable session keys bind a session to its assigned channel while it remains available. New sessions still use global intelligent scheduling, and failures trigger reassignment.'
              )}
            </FieldDescription>
            <Controller
              control={props.form.control}
              name='soft_affinity_enabled'
              render={({ field }) => (
                <Field className='flex flex-row items-center justify-between gap-4 rounded-md border p-4'>
                  <div className='space-y-1'>
                    <FieldLabel htmlFor='soft-affinity-enabled'>
                      {t('Enable session channel binding')}
                    </FieldLabel>
                    <FieldDescription>
                      {t(
                        'Existing sessions stay on their assigned channel until it is unavailable; new sessions continue to use intelligent scheduling.'
                      )}
                    </FieldDescription>
                  </div>
                  <Switch
                    id='soft-affinity-enabled'
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </Field>
              )}
            />
          </FieldSet>

          {tuningSections.map((section) => (
            <FieldSet key={section.title}>
              <FieldLegend>{t(section.title)}</FieldLegend>
              <FieldDescription>{t(section.description)}</FieldDescription>
              <div className='grid gap-5 sm:grid-cols-2'>
                {section.fields.map(
                  ({ name, label, description, step, min, max }) => {
                    const error = props.form.formState.errors[name]
                    return (
                      <Field key={name} data-invalid={!!error}>
                        <FieldLabel htmlFor={name}>{t(label)}</FieldLabel>
                        <Input
                          id={name}
                          type='number'
                          inputMode='decimal'
                          step={step}
                          min={min}
                          max={max}
                          aria-invalid={!!error}
                          {...props.form.register(name, {
                            valueAsNumber: true,
                          })}
                        />
                        <FieldDescription>{t(description)}</FieldDescription>
                        <FieldError>
                          {error
                            ? t('Enter a value within the allowed range.')
                            : null}
                        </FieldError>
                      </Field>
                    )
                  }
                )}
              </div>
            </FieldSet>
          ))}

          <Button
            type='button'
            variant='outline'
            className='self-start'
            onClick={() => {
              for (const name of Object.keys(recommendedTuning) as Array<
                keyof typeof recommendedTuning
              >) {
                props.form.setValue(name, recommendedTuning[name], {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
            }}
          >
            <RotateCcw className='size-4' aria-hidden='true' />{' '}
            {t('Restore recommended tuning')}
          </Button>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
