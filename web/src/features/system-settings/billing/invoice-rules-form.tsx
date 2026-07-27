/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/

import { Controller, type UseFormReturn } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'

import type { InvoiceRuleFormValues } from './lib/invoice-rule-form'

type InvoiceRulesFormProps = {
  form: UseFormReturn<InvoiceRuleFormValues>
  onSubmit: (values: InvoiceRuleFormValues) => void
}

export function InvoiceRulesForm(props: InvoiceRulesFormProps) {
  const { t } = useTranslation()

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('Invoice settings')}</CardTitle>
        <CardDescription>
          {t(
            'Configure application eligibility and the invoice item used for paid orders. Buyer information is collected from each application.'
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={props.form.handleSubmit(props.onSubmit)}>
          <FieldGroup>
            <Controller
              control={props.form.control}
              name='enabled'
              render={({ field }) => (
                <Field orientation='horizontal'>
                  <div className='flex flex-1 flex-col gap-0.5'>
                    <FieldLabel htmlFor='invoice-enabled'>
                      {t('Enable invoice applications')}
                    </FieldLabel>
                    <FieldDescription>
                      {t(
                        'Allow users to create applications from eligible paid orders.'
                      )}
                    </FieldDescription>
                  </div>
                  <Switch
                    id='invoice-enabled'
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </Field>
              )}
            />

            <div className='grid gap-5 sm:grid-cols-2'>
              <Field
                data-invalid={Boolean(
                  props.form.formState.errors.minimumAmount
                )}
              >
                <FieldLabel htmlFor='invoice-minimum-amount'>
                  {t('Minimum invoice amount')}
                </FieldLabel>
                <Input
                  id='invoice-minimum-amount'
                  type='number'
                  min='0'
                  step='0.01'
                  aria-invalid={Boolean(
                    props.form.formState.errors.minimumAmount
                  )}
                  {...props.form.register('minimumAmount', {
                    valueAsNumber: true,
                  })}
                />
                <FieldError
                  errors={[props.form.formState.errors.minimumAmount]}
                />
              </Field>

              <Field
                data-invalid={Boolean(
                  props.form.formState.errors.applicationWindowDays
                )}
              >
                <FieldLabel htmlFor='invoice-window-days'>
                  {t('Application window (days)')}
                </FieldLabel>
                <Input
                  id='invoice-window-days'
                  type='number'
                  min='0'
                  max='3650'
                  step='1'
                  aria-invalid={Boolean(
                    props.form.formState.errors.applicationWindowDays
                  )}
                  {...props.form.register('applicationWindowDays', {
                    valueAsNumber: true,
                  })}
                />
                <FieldDescription>
                  {t('Use 0 for no time limit.')}
                </FieldDescription>
                <FieldError
                  errors={[props.form.formState.errors.applicationWindowDays]}
                />
              </Field>

              <Field
                data-invalid={Boolean(props.form.formState.errors.currency)}
              >
                <FieldLabel htmlFor='invoice-currency'>
                  {t('Currency')}
                </FieldLabel>
                <Input
                  id='invoice-currency'
                  maxLength={3}
                  readOnly
                  aria-invalid={Boolean(
                    props.form.formState.errors.currency
                  )}
                  {...props.form.register('currency')}
                />
                <FieldDescription>
                  {t('Mainland China invoices use CNY.')}
                </FieldDescription>
                <FieldError errors={[props.form.formState.errors.currency]} />
              </Field>

              <Field
                data-invalid={Boolean(
                  props.form.formState.errors.invoiceItemName
                )}
              >
                <FieldLabel htmlFor='invoice-item-name'>
                  {t('Invoice item name')}
                </FieldLabel>
                <Input
                  id='invoice-item-name'
                  maxLength={255}
                  aria-invalid={Boolean(
                    props.form.formState.errors.invoiceItemName
                  )}
                  {...props.form.register('invoiceItemName')}
                />
                <FieldDescription>
                  {t('Use the actual service name shown on the invoice.')}{' '}
                  <code>AI Agent服务</code>
                </FieldDescription>
                <FieldError
                  errors={[props.form.formState.errors.invoiceItemName]}
                />
              </Field>
            </div>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}
