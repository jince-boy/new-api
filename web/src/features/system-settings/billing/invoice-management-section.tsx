/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/

import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm, type Resolver } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

import { updateSystemOption } from '../api'
import { SettingsPageFormActions } from '../components/settings-page-context'
import { InvoiceRulesForm } from './invoice-rules-form'
import {
  createInvoiceRuleSchema,
  type InvoiceRuleFormValues,
} from './lib/invoice-rule-form'

export type InvoiceRuleDefaults = InvoiceRuleFormValues

type InvoiceManagementSectionProps = {
  defaultValues: InvoiceRuleDefaults
}

export function InvoiceManagementSection(props: InvoiceManagementSectionProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const form = useForm<InvoiceRuleFormValues>({
    resolver: zodResolver(
      createInvoiceRuleSchema(t)
    ) as unknown as Resolver<InvoiceRuleFormValues>,
    defaultValues: props.defaultValues,
    values: props.defaultValues,
  })

  const saveRulesMutation = useMutation({
    mutationFn: async (values: InvoiceRuleFormValues) => {
      const updates = [
        ['invoice_setting.enabled', values.enabled],
        [
          'invoice_setting.supplement_payment_method',
          values.supplementPaymentMethod,
        ],
        ['invoice_setting.tax_burden_mode', values.taxBurdenMode],
        ['invoice_setting.minimum_amount', values.minimumAmount],
        [
          'invoice_setting.application_window_days',
          values.applicationWindowDays,
        ],
        ['invoice_setting.currency', values.currency],
        ['invoice_setting.invoice_item_name', values.invoiceItemName],
        [
          'invoice_setting.vat_threshold_cents',
          Math.round(values.vatThresholdAmount * 100),
        ],
        [
          'invoice_setting.vat_rate_basis_points',
          Math.round(values.vatRatePercent * 100),
        ],
        [
          'invoice_setting.vat_standard_rate_basis_points',
          Math.round(values.vatStandardRatePercent * 100),
        ],
        [
          'invoice_setting.vat_preferential_end_date',
          values.vatPreferentialEndDate,
        ],
        [
          'invoice_setting.urban_maintenance_tax_rate_basis_points',
          Math.round(values.urbanMaintenanceTaxRatePercent * 100),
        ],
        [
          'invoice_setting.education_surcharge_rate_basis_points',
          Math.round(values.educationSurchargeRatePercent * 100),
        ],
        [
          'invoice_setting.local_education_rate_basis_points',
          Math.round(values.localEducationRatePercent * 100),
        ],
        [
          'invoice_setting.surcharge_relief_basis_points',
          Math.round(values.surchargeReliefPercent * 100),
        ],
        [
          'invoice_setting.pit_withholding_enabled',
          values.pitWithholdingEnabled,
        ],
        ['invoice_setting.policy_effective_date', values.policyEffectiveDate],
        ['invoice_setting.policy_notice', values.policyNotice],
      ] as const
      const responses = await Promise.all(
        updates.map(([key, value]) => updateSystemOption({ key, value }))
      )
      const failed = responses.find((response) => !response.success)
      if (failed) {
        throw new Error(failed.message || t('Failed to update setting'))
      }
    },
    onSuccess: async () => {
      toast.success(t('Invoice rules saved.'))
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['system-options'] }),
        queryClient.invalidateQueries({ queryKey: ['invoices', 'config'] }),
      ])
    },
    onError: () => toast.error(t('Failed to save invoice settings.')),
  })

  return (
    <div className='flex flex-col gap-4'>
      <SettingsPageFormActions
        onSave={form.handleSubmit((values) => saveRulesMutation.mutate(values))}
        onReset={() => form.reset(props.defaultValues)}
        isSaving={saveRulesMutation.isPending}
        saveLabel='Save invoice rules'
      />
      <Alert>
        <AlertTitle>{t('Tax compliance notice')}</AlertTitle>
        <AlertDescription>
          {t(
            'These settings produce an estimate for an individual providing technical services to an enterprise in mainland China. Administrators must verify every application against the competent tax authority, withholding declaration, and tax payment certificate before issuing an invoice.'
          )}
        </AlertDescription>
      </Alert>
      <InvoiceRulesForm
        form={form}
        onSubmit={(values) => saveRulesMutation.mutate(values)}
      />
    </div>
  )
}
