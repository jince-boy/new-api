/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/

import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'

import type { InvoiceStatus } from '../types'

type InvoiceStatusBadgeProps = {
  status: InvoiceStatus
}

export function InvoiceStatusBadge(props: InvoiceStatusBadgeProps) {
  const { t } = useTranslation()
  const variant = props.status === 'rejected' ? 'destructive' : 'secondary'
  let label = t('Review pending')
  if (props.status === 'pending_payment') label = t('Awaiting tax supplement')
  if (props.status === 'approved') label = t('Approved')
  if (props.status === 'rejected') label = t('Rejected')
  if (props.status === 'issued') label = t('Issued')

  return <Badge variant={variant}>{label}</Badge>
}
