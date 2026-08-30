/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/

import type { TFunction } from 'i18next'
import { z } from 'zod'

export function createInvoiceRuleSchema(t: TFunction) {
  const rate = z.coerce
    .number()
    .min(0, t('Tax rate cannot be negative.'))
    .max(100, t('Tax rate cannot exceed 100%.'))

  return z.object({
    enabled: z.boolean(),
    supplementPaymentMethod: z.enum(['epay', 'balance']),
    taxBurdenMode: z.enum(['included', 'supplement_by_customer']),
    minimumAmount: z.coerce
      .number()
      .min(0, t('Minimum invoice amount cannot be negative.')),
    applicationWindowDays: z.coerce
      .number()
      .int(t('Application window must be a whole number of days.'))
      .min(0)
      .max(3650, t('Application window cannot exceed 3650 days.')),
    currency: z
      .string()
      .trim()
      .toUpperCase()
      .refine(
        (value) => value === 'CNY',
        t('Currency must be CNY for mainland China tax estimates.')
      ),
    invoiceItemName: z
      .string()
      .trim()
      .min(1, t('Invoice item name is required.'))
      .max(255),
    vatThresholdAmount: z.coerce.number().min(0),
    vatRatePercent: rate,
    vatStandardRatePercent: rate,
    vatPreferentialEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    urbanMaintenanceTaxRatePercent: rate,
    educationSurchargeRatePercent: rate,
    localEducationRatePercent: rate,
    surchargeReliefPercent: rate,
    pitWithholdingEnabled: z.boolean(),
    policyEffectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    policyNotice: z.string().trim().max(4000),
  })
}

export type InvoiceRuleFormValues = z.infer<
  ReturnType<typeof createInvoiceRuleSchema>
>
