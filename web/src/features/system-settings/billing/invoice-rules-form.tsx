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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'

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
        <CardTitle>{t('Invoice rules')}</CardTitle>
        <CardDescription>
          {t(
            'Configure eligibility and the tax policy snapshot used for administrator review. Tax settings are estimates and do not replace a tax filing result.'
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
              <Controller
                control={props.form.control}
                name='taxBurdenMode'
                render={({ field }) => (
                  <Field>
                    <FieldLabel>{t('Tax burden mode')}</FieldLabel>
                    <Select
                      items={[
                        {
                          value: 'included',
                          label: t('Included in paid price'),
                        },
                        {
                          value: 'supplement_by_customer',
                          label: t(
                            'All enabled taxes supplemented by customer'
                          ),
                        },
                      ]}
                      value={field.value}
                      onValueChange={field.onChange}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent alignItemWithTrigger={false}>
                        <SelectGroup>
                          <SelectItem value='included'>
                            {t('Included in paid price')}
                          </SelectItem>
                          <SelectItem value='supplement_by_customer'>
                            {t('All enabled taxes supplemented by customer')}
                          </SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    <FieldDescription>
                      {t(
                        "Customer-borne mode treats the paid order amount as the seller's target net income."
                      )}
                    </FieldDescription>
                  </Field>
                )}
              />

              <Controller
                control={props.form.control}
                name='pitWithholdingEnabled'
                render={({ field }) => (
                  <Field orientation='horizontal'>
                    <div className='flex flex-1 flex-col gap-0.5'>
                      <FieldLabel htmlFor='invoice-pit-enabled'>
                        {t('Estimate individual income tax withholding')}
                      </FieldLabel>
                      <FieldDescription>
                        {t(
                          'Include the withholding estimate in the customer gross-up when customer-borne mode is selected.'
                        )}
                      </FieldDescription>
                    </div>
                    <Switch
                      id='invoice-pit-enabled'
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </Field>
                )}
              />
            </div>

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
                  aria-invalid={Boolean(props.form.formState.errors.currency)}
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

              <Field
                data-invalid={Boolean(
                  props.form.formState.errors.vatThresholdAmount
                )}
              >
                <FieldLabel htmlFor='invoice-vat-threshold'>
                  {t('VAT threshold amount')}
                </FieldLabel>
                <Input
                  id='invoice-vat-threshold'
                  type='number'
                  min='0'
                  step='0.01'
                  aria-invalid={Boolean(
                    props.form.formState.errors.vatThresholdAmount
                  )}
                  {...props.form.register('vatThresholdAmount', {
                    valueAsNumber: true,
                  })}
                />
                <FieldError
                  errors={[props.form.formState.errors.vatThresholdAmount]}
                />
              </Field>

              <Field
                data-invalid={Boolean(
                  props.form.formState.errors.vatRatePercent
                )}
              >
                <FieldLabel htmlFor='invoice-vat-rate'>
                  {t('Preferential VAT rate (%)')}
                </FieldLabel>
                <Input
                  id='invoice-vat-rate'
                  type='number'
                  min='0'
                  max='100'
                  step='0.01'
                  aria-invalid={Boolean(
                    props.form.formState.errors.vatRatePercent
                  )}
                  {...props.form.register('vatRatePercent', {
                    valueAsNumber: true,
                  })}
                />
                <FieldError
                  errors={[props.form.formState.errors.vatRatePercent]}
                />
              </Field>

              <Field
                data-invalid={Boolean(
                  props.form.formState.errors.vatStandardRatePercent
                )}
              >
                <FieldLabel htmlFor='invoice-vat-standard-rate'>
                  {t('Standard VAT rate after preference (%)')}
                </FieldLabel>
                <Input
                  id='invoice-vat-standard-rate'
                  type='number'
                  min='0'
                  max='100'
                  step='0.01'
                  aria-invalid={Boolean(
                    props.form.formState.errors.vatStandardRatePercent
                  )}
                  {...props.form.register('vatStandardRatePercent', {
                    valueAsNumber: true,
                  })}
                />
                <FieldError
                  errors={[props.form.formState.errors.vatStandardRatePercent]}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor='invoice-vat-end-date'>
                  {t('VAT preference end date')}
                </FieldLabel>
                <Input
                  id='invoice-vat-end-date'
                  type='date'
                  {...props.form.register('vatPreferentialEndDate')}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor='invoice-urban-rate'>
                  {t('Urban maintenance and construction tax rate (%)')}
                </FieldLabel>
                <Input
                  id='invoice-urban-rate'
                  type='number'
                  min='0'
                  max='100'
                  step='0.01'
                  {...props.form.register('urbanMaintenanceTaxRatePercent', {
                    valueAsNumber: true,
                  })}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor='invoice-education-rate'>
                  {t('Education surcharge rate (%)')}
                </FieldLabel>
                <Input
                  id='invoice-education-rate'
                  type='number'
                  min='0'
                  max='100'
                  step='0.01'
                  {...props.form.register('educationSurchargeRatePercent', {
                    valueAsNumber: true,
                  })}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor='invoice-local-education-rate'>
                  {t('Local education surcharge rate (%)')}
                </FieldLabel>
                <Input
                  id='invoice-local-education-rate'
                  type='number'
                  min='0'
                  max='100'
                  step='0.01'
                  {...props.form.register('localEducationRatePercent', {
                    valueAsNumber: true,
                  })}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor='invoice-surcharge-relief'>
                  {t('Surcharge relief (%)')}
                </FieldLabel>
                <Input
                  id='invoice-surcharge-relief'
                  type='number'
                  min='0'
                  max='100'
                  step='0.01'
                  {...props.form.register('surchargeReliefPercent', {
                    valueAsNumber: true,
                  })}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor='invoice-policy-effective-date'>
                  {t('Policy effective date')}
                </FieldLabel>
                <Input
                  id='invoice-policy-effective-date'
                  type='date'
                  {...props.form.register('policyEffectiveDate')}
                />
              </Field>

              <Field className='sm:col-span-2'>
                <FieldLabel htmlFor='invoice-policy-notice'>
                  {t('Policy notice')}
                </FieldLabel>
                <Textarea
                  id='invoice-policy-notice'
                  maxLength={4000}
                  {...props.form.register('policyNotice')}
                />
              </Field>
            </div>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}
