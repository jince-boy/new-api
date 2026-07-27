/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/

import { zodResolver } from '@hookform/resolvers/zod'
import { AddInvoiceIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { type ReactNode, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'

import { formatInvoiceDate, formatInvoiceMoney } from '../lib/format'
import {
  canSubmitInvoiceApplication,
  getInvoiceOrderSelectionState,
} from '../lib/invoice-application-availability'
import {
  createInvoiceApplicationSchema,
  invoiceApplicationFormDefaults,
  type InvoiceApplicationFormValues,
} from '../lib/invoice-application-form'
import type { EligibleInvoiceOrder, InvoiceConfig } from '../types'

type InvoiceApplicationDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  config?: InvoiceConfig
  orders: EligibleInvoiceOrder[]
  configLoading: boolean
  configError: boolean
  ordersLoading: boolean
  ordersError: boolean
  submitting: boolean
  onRetry: () => void
  onSubmit: (values: InvoiceApplicationFormValues) => Promise<void>
}

export function InvoiceApplicationDialog(props: InvoiceApplicationDialogProps) {
  const { t } = useTranslation()
  const schema = useMemo(() => createInvoiceApplicationSchema(t), [t])
  const form = useForm<InvoiceApplicationFormValues>({
    resolver: zodResolver(schema),
    defaultValues: invoiceApplicationFormDefaults,
  })
  const selectedIds = form.watch('top_up_ids')
  const currency = props.config?.currency ?? 'CNY'
  const selectedTotal = props.orders.reduce((total, order) => {
    return selectedIds.includes(order.id)
      ? total + Math.round(order.money * 100)
      : total
  }, 0)

  const handleOpenChange = (open: boolean) => {
    props.onOpenChange(open)
    if (!open) form.reset(invoiceApplicationFormDefaults)
  }

  const toggleOrder = (orderId: number, checked: boolean) => {
    const current = form.getValues('top_up_ids')
    const next = checked
      ? [...current, orderId]
      : current.filter((id) => id !== orderId)
    form.setValue('top_up_ids', next, {
      shouldDirty: true,
      shouldValidate: true,
    })
  }

  const submit = form.handleSubmit(async (values) => {
    await props.onSubmit(values)
    form.reset(invoiceApplicationFormDefaults)
  })
  const availability = {
    configEnabled: props.config?.enabled,
    configLoading: props.configLoading,
    configError: props.configError,
    ordersLoading: props.ordersLoading,
    ordersError: props.ordersError,
    orderCount: props.orders.length,
  }
  const selectionState = getInvoiceOrderSelectionState(availability)
  const submitDisabled = !canSubmitInvoiceApplication(
    availability,
    selectedIds.length,
    props.submitting
  )

  let orderSelectionContent: ReactNode
  if (selectionState === 'config_loading') {
    orderSelectionContent = (
      <div className='text-muted-foreground flex items-center gap-2 rounded-lg border p-4 text-sm'>
        <Spinner />
        {t('Loading invoice application settings...')}
      </div>
    )
  } else if (selectionState === 'config_error') {
    orderSelectionContent = (
      <Alert variant='destructive'>
        <AlertTitle>
          {t('Failed to load invoice application settings.')}
        </AlertTitle>
        <AlertDescription>
          <Button
            type='button'
            variant='outline'
            size='sm'
            className='mt-2'
            onClick={props.onRetry}
          >
            {t('Retry')}
          </Button>
        </AlertDescription>
      </Alert>
    )
  } else if (selectionState === 'disabled') {
    orderSelectionContent = (
      <Alert>
        <AlertTitle>{t('Invoice applications are unavailable')}</AlertTitle>
        <AlertDescription>
          {t('The administrator has not enabled invoice applications.')}
        </AlertDescription>
      </Alert>
    )
  } else if (selectionState === 'orders_loading') {
    orderSelectionContent = (
      <div className='text-muted-foreground flex items-center gap-2 rounded-lg border p-4 text-sm'>
        <Spinner />
        {t('Loading eligible paid orders...')}
      </div>
    )
  } else if (selectionState === 'orders_error') {
    orderSelectionContent = (
      <Alert variant='destructive'>
        <AlertTitle>{t('Failed to load eligible paid orders.')}</AlertTitle>
        <AlertDescription>
          <Button
            type='button'
            variant='outline'
            size='sm'
            className='mt-2'
            onClick={props.onRetry}
          >
            {t('Retry')}
          </Button>
        </AlertDescription>
      </Alert>
    )
  } else if (selectionState === 'empty') {
    orderSelectionContent = (
      <Alert>
        <AlertTitle>{t('No eligible paid orders')}</AlertTitle>
        <AlertDescription>
          {t('There are no paid orders currently available for invoicing.')}
        </AlertDescription>
      </Alert>
    )
  } else {
    orderSelectionContent = (
      <div className='max-h-56 overflow-y-auto rounded-lg border'>
        {props.orders.map((order) => {
          const checked = selectedIds.includes(order.id)
          return (
            <Field
              key={order.id}
              orientation='horizontal'
              className='border-b p-3 last:border-b-0'
            >
              <Checkbox
                id={`invoice-order-${order.id}`}
                checked={checked}
                onCheckedChange={(value) =>
                  toggleOrder(order.id, value === true)
                }
              />
              <FieldLabel htmlFor={`invoice-order-${order.id}`}>
                <span className='flex min-w-0 flex-1 flex-col gap-0.5'>
                  <span className='truncate font-mono text-xs'>
                    {order.trade_no}
                  </span>
                  <span className='text-muted-foreground text-xs'>
                    {formatInvoiceDate(
                      order.complete_time || order.create_time
                    )}{' '}
                    · {order.payment_method}
                  </span>
                </span>
                <span className='tabular-nums'>
                  {formatInvoiceMoney(Math.round(order.money * 100), currency)}
                </span>
              </FieldLabel>
            </Field>
          )
        })}
      </div>
    )
  }

  return (
    <Dialog open={props.open} onOpenChange={handleOpenChange}>
      <DialogContent className='max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle>{t('Apply for an invoice')}</DialogTitle>
          <DialogDescription>
            {t(
              'Select paid orders and enter the enterprise buyer information shown on the invoice.'
            )}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit}>
          <FieldGroup>
            <FieldSet>
              <FieldLegend>{t('Paid orders')}</FieldLegend>
              <FieldDescription>
                {t('Selected amount')}:{' '}
                {formatInvoiceMoney(selectedTotal, currency)}
              </FieldDescription>
              {orderSelectionContent}
              <FieldError errors={[form.formState.errors.top_up_ids]} />
            </FieldSet>

            <div className='grid gap-5 sm:grid-cols-2'>
              <Field
                data-invalid={Boolean(form.formState.errors.invoice_title)}
              >
                <FieldLabel htmlFor='invoice-title'>
                  {t('Invoice title')}
                </FieldLabel>
                <Input
                  id='invoice-title'
                  autoComplete='organization'
                  aria-invalid={Boolean(form.formState.errors.invoice_title)}
                  {...form.register('invoice_title')}
                />
                <FieldError errors={[form.formState.errors.invoice_title]} />
              </Field>
              <Field data-invalid={Boolean(form.formState.errors.tax_number)}>
                <FieldLabel htmlFor='invoice-tax-number'>
                  {t('Tax identification number')}
                </FieldLabel>
                <Input
                  id='invoice-tax-number'
                  aria-invalid={Boolean(form.formState.errors.tax_number)}
                  {...form.register('tax_number')}
                />
                <FieldError errors={[form.formState.errors.tax_number]} />
              </Field>
              <Field>
                <FieldLabel htmlFor='invoice-company-address'>
                  {t('Company address')}
                </FieldLabel>
                <Input
                  id='invoice-company-address'
                  autoComplete='street-address'
                  {...form.register('company_address')}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor='invoice-company-phone'>
                  {t('Company phone')}
                </FieldLabel>
                <Input
                  id='invoice-company-phone'
                  autoComplete='tel'
                  {...form.register('company_phone')}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor='invoice-bank-name'>
                  {t('Bank name')}
                </FieldLabel>
                <Input id='invoice-bank-name' {...form.register('bank_name')} />
              </Field>
              <Field>
                <FieldLabel htmlFor='invoice-bank-account'>
                  {t('Bank account')}
                </FieldLabel>
                <Input
                  id='invoice-bank-account'
                  {...form.register('bank_account')}
                />
              </Field>
              <Field
                className='sm:col-span-2'
                data-invalid={Boolean(form.formState.errors.recipient_email)}
              >
                <FieldLabel htmlFor='invoice-recipient-email'>
                  {t('Recipient email')}
                </FieldLabel>
                <Input
                  id='invoice-recipient-email'
                  type='email'
                  autoComplete='email'
                  aria-invalid={Boolean(form.formState.errors.recipient_email)}
                  {...form.register('recipient_email')}
                />
                <FieldDescription>
                  {t(
                    'Optional. Used by the administrator when delivering the invoice.'
                  )}
                </FieldDescription>
                <FieldError errors={[form.formState.errors.recipient_email]} />
              </Field>
              <Field
                className='sm:col-span-2'
                data-invalid={Boolean(form.formState.errors.applicant_note)}
              >
                <FieldLabel htmlFor='invoice-applicant-note'>
                  {t('Application note')}
                </FieldLabel>
                <Textarea
                  id='invoice-applicant-note'
                  maxLength={2000}
                  aria-invalid={Boolean(form.formState.errors.applicant_note)}
                  {...form.register('applicant_note')}
                />
                <FieldDescription>
                  {t(
                    'Optional information for the administrator reviewing this invoice application.'
                  )}
                </FieldDescription>
                <FieldError errors={[form.formState.errors.applicant_note]} />
              </Field>
            </div>

            <Alert>
              <AlertDescription>
                {t(
                  'The system will estimate VAT, surcharges, and individual income tax withholding after submission. An administrator must verify the estimate and confirm any final tax supplement before payment.'
                )}
              </AlertDescription>
            </Alert>

            <DialogFooter>
              <Button
                type='button'
                variant='outline'
                onClick={() => handleOpenChange(false)}
              >
                {t('Cancel')}
              </Button>
              <Button type='submit' disabled={submitDisabled}>
                {props.submitting ? (
                  <Spinner data-icon='inline-start' />
                ) : (
                  <HugeiconsIcon
                    icon={AddInvoiceIcon}
                    data-icon='inline-start'
                  />
                )}
                {t('Submit application')}
              </Button>
            </DialogFooter>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  )
}
