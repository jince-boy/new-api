/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/

import type { InvoiceApplication } from '../types'

export type InvoiceEmailAction = 'send' | 'resend' | null

export function getInvoiceEmailAction(
  application: InvoiceApplication,
  isAdmin: boolean
): InvoiceEmailAction {
  if (!application.invoice_file_name) return null

  if (isAdmin) {
    if (application.status !== 'approved' && application.status !== 'issued') {
      return null
    }
    return application.invoice_email_send_count > 0 ? 'resend' : 'send'
  }

  return application.status === 'issued' ? 'resend' : null
}
