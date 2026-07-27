/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/

export type InvoiceStatus =
  | 'pending_payment'
  | 'pending_review'
  | 'approved'
  | 'rejected'
  | 'issued'

export type InvoicePaymentStatus = 'not_required' | 'pending' | 'paid'

export type InvoiceConfig = {
  enabled: boolean
  price_includes_tax: boolean
  tax_burden_mode: 'included' | 'supplement_by_customer'
  minimum_amount: number
  application_window_days: number
  currency: string
  invoice_item_name: string
  vat_period_mode: 'per_transaction' | 'monthly_special_case'
  vat_threshold_cents: number
  vat_rate_basis_points: number
  vat_standard_rate_basis_points: number
  vat_preferential_end_date: string
  urban_maintenance_tax_rate_basis_points: number
  education_surcharge_rate_basis_points: number
  local_education_rate_basis_points: number
  surcharge_relief_basis_points: number
  pit_withholding_enabled: boolean
  policy_effective_date: string
  policy_notice: string
  policy_source_urls: string
}

export type InvoicePaymentMethod = {
  name: string
  type: string
  color?: string
}

export type EligibleInvoiceOrder = {
  id: number
  money: number
  trade_no: string
  payment_method: string
  create_time: number
  complete_time: number
  status: string
}

export type InvoiceOrder = {
  id: number
  application_id: number
  top_up_id: number
  trade_no: string
  paid_amount_cents: number
  payment_method: string
  completed_at: number
}

export type InvoiceApplication = {
  id: number
  user_id: number
  status: InvoiceStatus
  payment_status: InvoicePaymentStatus
  invoice_title: string
  tax_number: string
  company_address: string
  company_phone: string
  bank_name: string
  bank_account: string
  recipient_email: string
  applicant_note: string
  invoice_item_name: string
  currency: string
  order_amount_cents: number
  invoice_amount_cents: number
  estimated_vat_cents: number
  estimated_urban_tax_cents: number
  estimated_education_surcharge_cents: number
  estimated_local_education_surcharge_cents: number
  estimated_pit_withholding_cents: number
  estimated_total_tax_cents: number
  suggested_supplement_cents: number
  final_supplement_cents: number
  tax_breakdown: string
  rule_snapshot: string
  tax_adjustment_reason: string
  payment_trade_no: string
  payment_method: string
  payment_confirmed_at: number
  admin_note: string
  reject_reason: string
  reviewer_id: number
  reviewed_at: number
  invoice_file_name: string
  invoice_file_content_type: string
  created_at: number
  updated_at: number
  issued_at: number
  orders: InvoiceOrder[]
}

export type InvoiceApplicationPage = {
  page: number
  page_size: number
  total: number
  items: InvoiceApplication[]
}

export type CreateInvoiceApplicationRequest = {
  top_up_ids: number[]
  invoice_title: string
  tax_number: string
  company_address: string
  company_phone: string
  bank_name: string
  bank_account: string
  recipient_email: string
  applicant_note: string
}

export type ReviewInvoiceApplicationRequest = {
  action: 'approve' | 'reject'
  final_supplement_amount_cents?: number
  tax_adjustment_reason: string
  reason: string
  note: string
}

export type InvoicePaymentResponse = InvoiceApiResponse<
  Record<string, string>
> & {
  url?: string
  trade_no?: string
}

export type InvoiceApiResponse<T> = {
  success: boolean
  message: string
  data: T
}
