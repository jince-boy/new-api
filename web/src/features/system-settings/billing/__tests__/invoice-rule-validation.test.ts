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
  minimumAmount: 0,
  applicationWindowDays: 365,
  currency: 'CNY',
  invoiceItemName: 'AI Agent服务',
}

describe('invoice rule validation', () => {
  test('accepts the invoice application settings required by the workflow', () => {
    const result = createInvoiceRuleSchema(t).safeParse(baseRules)

    assert.equal(result.success, true)
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
})
