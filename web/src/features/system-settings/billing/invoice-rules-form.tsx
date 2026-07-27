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
            <div className='grid gap-5 sm:grid-cols-2'>
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
              <Controller
                control={props.form.control}
                name='priceIncludesTax'
                render={({ field }) => (
                  <Field orientation='horizontal'>
                    <div className='flex flex-1 flex-col gap-0.5'>
                      <FieldLabel htmlFor='invoice-price-includes-tax'>
                        {t('Paid price includes tax')}
                      </FieldLabel>
                      <FieldDescription>
                        {t(
                          'Use the paid amount as a tax-inclusive service price.'
                        )}
                      </FieldDescription>
                    </div>
                    <Switch
                      id='invoice-price-includes-tax'
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
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
                          'Show the labor-remuneration withholding estimate separately from the customer supplement.'
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
                            'VAT and surcharges supplemented by customer'
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
                            {t('VAT and surcharges supplemented by customer')}
                          </SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                )}
              />
              <Controller
                control={props.form.control}
                name='vatPeriodMode'
                render={({ field }) => (
                  <Field>
                    <FieldLabel>{t('VAT threshold period')}</FieldLabel>
                    <Select
                      items={[
                        {
                          value: 'per_transaction',
                          label: t('Per transaction'),
                        },
                        {
                          value: 'monthly_special_case',
                          label: t('Monthly special case'),
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
                          <SelectItem value='per_transaction'>
                            {t('Per transaction')}
                          </SelectItem>
                          <SelectItem value='monthly_special_case'>
                            {t('Monthly special case')}
                          </SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    <FieldDescription>
                      {t(
                        'Natural persons normally use per-transaction taxation. Select monthly only after confirming a qualifying continuous-business case.'
                      )}
                    </FieldDescription>
                  </Field>
                )}
              />

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
                  {...props.form.register('currency')}
                />
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
                  {...props.form.register('invoiceItemName')}
                />
                <FieldError
                  errors={[props.form.formState.errors.invoiceItemName]}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor='invoice-vat-threshold'>
                  {t('VAT threshold amount')}
                </FieldLabel>
                <Input
                  id='invoice-vat-threshold'
                  type='number'
                  min='0'
                  step='0.01'
                  {...props.form.register('vatThresholdAmount', {
                    valueAsNumber: true,
                  })}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor='invoice-vat-rate'>
                  {t('Preferential VAT rate (%)')}
                </FieldLabel>
                <Input
                  id='invoice-vat-rate'
                  type='number'
                  min='0'
                  max='100'
                  step='0.01'
                  {...props.form.register('vatRatePercent', {
                    valueAsNumber: true,
                  })}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor='invoice-vat-standard-rate'>
                  {t('Standard VAT rate after preference (%)')}
                </FieldLabel>
                <Input
                  id='invoice-vat-standard-rate'
                  type='number'
                  min='0'
                  max='100'
                  step='0.01'
                  {...props.form.register('vatStandardRatePercent', {
                    valueAsNumber: true,
                  })}
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
              <Field className='sm:col-span-2'>
                <FieldLabel htmlFor='invoice-policy-sources'>
                  {t('Policy source URLs')}
                </FieldLabel>
                <Textarea
                  id='invoice-policy-sources'
                  maxLength={4000}
                  placeholder={t('One URL per line')}
                  {...props.form.register('policySourceUrls')}
                />
              </Field>
            </div>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}
