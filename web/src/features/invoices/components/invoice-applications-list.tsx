/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/

import { Invoice01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import { formatInvoiceDate, formatInvoiceMoney } from '../lib/format'
import type { InvoiceApplication } from '../types'
import { InvoiceStatusBadge } from './invoice-status-badge'

type InvoiceApplicationsListProps = {
  applications: InvoiceApplication[]
  loading: boolean
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
  showUser?: boolean
  renderActions: (application: InvoiceApplication) => ReactNode
}

export function InvoiceApplicationsList(props: InvoiceApplicationsListProps) {
  const { t } = useTranslation()
  const totalPages = Math.max(1, Math.ceil(props.total / props.pageSize))

  if (props.loading) {
    return (
      <div className='flex flex-col gap-3'>
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className='h-12 w-full' />
        ))}
      </div>
    )
  }

  if (props.applications.length === 0) {
    return (
      <Empty className='min-h-52 border'>
        <EmptyHeader>
          <EmptyMedia variant='icon'>
            <HugeiconsIcon icon={Invoice01Icon} />
          </EmptyMedia>
          <EmptyTitle>{t('No invoice applications')}</EmptyTitle>
          <EmptyDescription>
            {t(
              'Invoice applications will appear here after they are submitted.'
            )}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className='flex min-h-0 flex-col gap-3'>
      <div className='overflow-x-auto rounded-lg border'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('Application')}</TableHead>
              {props.showUser ? <TableHead>{t('User')}</TableHead> : null}
              <TableHead>{t('Status')}</TableHead>
              <TableHead>{t('Paid order amount')}</TableHead>
              <TableHead>{t('Tax supplement')}</TableHead>
              <TableHead>{t('Invoice amount')}</TableHead>
              <TableHead>{t('Submitted at')}</TableHead>
              <TableHead className='text-right'>{t('Actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {props.applications.map((application) => (
              <TableRow key={application.id}>
                <TableCell>
                  <div className='flex min-w-40 flex-col gap-0.5'>
                    <span className='font-medium'>
                      #{application.id} · {application.invoice_title}
                    </span>
                    <span className='text-muted-foreground text-xs'>
                      {application.invoice_item_name} ·{' '}
                      {t('{{count}} paid orders', {
                        count: application.orders.length,
                      })}
                    </span>
                    {application.reject_reason ? (
                      <span className='text-destructive text-xs'>
                        {t('Reason')}: {application.reject_reason}
                      </span>
                    ) : null}
                  </div>
                </TableCell>
                {props.showUser ? (
                  <TableCell className='tabular-nums'>
                    {application.user_id}
                  </TableCell>
                ) : null}
                <TableCell>
                  <InvoiceStatusBadge status={application.status} />
                </TableCell>
                <TableCell className='tabular-nums'>
                  {formatInvoiceMoney(
                    application.order_amount_cents,
                    application.currency
                  )}
                </TableCell>
                <TableCell className='tabular-nums'>
                  {formatInvoiceMoney(
                    application.status === 'pending_review'
                      ? application.suggested_supplement_cents
                      : application.final_supplement_cents,
                    application.currency
                  )}
                </TableCell>
                <TableCell className='tabular-nums'>
                  {formatInvoiceMoney(
                    application.invoice_amount_cents,
                    application.currency
                  )}
                </TableCell>
                <TableCell className='whitespace-nowrap'>
                  {formatInvoiceDate(application.created_at)}
                </TableCell>
                <TableCell>
                  <div className='flex justify-end gap-2'>
                    {props.renderActions(application)}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className='flex items-center justify-between gap-3'>
        <span className='text-muted-foreground text-sm'>
          {t('{{total}} applications', { total: props.total })}
        </span>
        <div className='flex items-center gap-2'>
          <Button
            type='button'
            variant='outline'
            size='sm'
            disabled={props.page <= 1}
            onClick={() => props.onPageChange(props.page - 1)}
          >
            {t('Previous')}
          </Button>
          <span className='text-sm tabular-nums'>
            {props.page} / {totalPages}
          </span>
          <Button
            type='button'
            variant='outline'
            size='sm'
            disabled={props.page >= totalPages}
            onClick={() => props.onPageChange(props.page + 1)}
          >
            {t('Next')}
          </Button>
        </div>
      </div>
    </div>
  )
}
