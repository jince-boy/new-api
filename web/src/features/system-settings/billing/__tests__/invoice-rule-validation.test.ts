/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/

import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import type { TFunction } from 'i18next'

import { createInvoiceRuleSchema } from '../lib/invoice-rule-form'

const t = ((key: string) => key) as TFunction

const baseRules = {
  enabled: true,
  supplementPaymentMethod: 'epay',
  taxBurdenMode: 'supplement_by_customer',
  minimumAmount: 0,
  applicationWindowDays: 365,
  currency: 'CNY',
  invoiceItemName: 'AI Agent服务',
  vatThresholdAmount: 1000,
  vatRatePercent: 1,
  vatStandardRatePercent: 3,
  vatPreferentialEndDate: '2027-12-31',
  urbanMaintenanceTaxRatePercent: 7,
  educationSurchargeRatePercent: 3,
  localEducationRatePercent: 2,
  surchargeReliefPercent: 50,
  pitWithholdingEnabled: true,
  policyEffectiveDate: '2026-01-01',
  policyNotice: '',
}

describe('invoice rule validation', () => {
  test('accepts a complete individual-service tax policy', () => {
    const result = createInvoiceRuleSchema(t).safeParse(baseRules)

    assert.equal(result.success, true)
  })

  test('rejects a tax rate above one hundred percent', () => {
    const result = createInvoiceRuleSchema(t).safeParse({
      ...baseRules,
      vatRatePercent: 101,
    })

    assert.equal(result.success, false)
    if (!result.success) {
      assert.deepEqual(result.error.issues[0]?.path, ['vatRatePercent'])
    }
  })

  test('rejects a non-CNY invoice currency', () => {
    const result = createInvoiceRuleSchema(t).safeParse({
      ...baseRules,
      currency: 'USD',
    })

    assert.equal(result.success, false)
    if (!result.success) {
      assert.deepEqual(result.error.issues[0]?.path, ['currency'])
    }
  })

  test('rejects an unsupported invoice supplement payment method', () => {
    const result = createInvoiceRuleSchema(t).safeParse({
      ...baseRules,
      supplementPaymentMethod: 'manual_transfer',
    })

    assert.equal(result.success, false)
    if (!result.success) {
      assert.deepEqual(result.error.issues[0]?.path, [
        'supplementPaymentMethod',
      ])
    }
  })
})
