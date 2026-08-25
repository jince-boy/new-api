/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/

import AddInvoiceIcon from '@hugeicons/core-free-icons/AddInvoiceIcon'
import { HugeiconsIcon } from '@hugeicons/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { SectionPageLayout } from '@/components/layout'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { submitPaymentForm } from '@/features/wallet/lib'

import {
  createInvoiceApplication,
  getEligibleInvoiceOrders,
  getInvoiceConfig,
  getInvoicePaymentMethods,
  getOwnInvoiceApplications,
  getOwnInvoiceFile,
  requestInvoiceSupplementPayment,
  sendOwnInvoiceEmail,
} from './api'
import { InvoiceApplicationDialog } from './components/invoice-application-dialog'
import { InvoiceApplicationsList } from './components/invoice-applications-list'
import { InvoiceDetailsDialog } from './components/invoice-details-dialog'
import type { InvoiceApplicationFormValues } from './lib/invoice-application-form'
import type {
  EligibleInvoiceOrder,
  InvoiceApplication,
  InvoicePaymentMethod,
  InvoiceStatus,
} from './types'

const EMPTY_ORDERS: EligibleInvoiceOrder[] = []
const EMPTY_PAYMENT_METHODS: InvoicePaymentMethod[] = []

/** Self-service invoice applications. Admins use this page as normal users. */
export function Invoices() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [status, setStatus] = useState<InvoiceStatus>()
  const [keyword, setKeyword] = useState('')
  const [applicationDialogOpen, setApplicationDialogOpen] = useState(false)
  const [detailsTarget, setDetailsTarget] = useState<InvoiceApplication | null>(
    null
  )
  const [fileActionPending, setFileActionPending] = useState(false)

  const configQuery = useQuery({
    queryKey: ['invoices', 'config'],
    queryFn: getInvoiceConfig,
  })
  const eligibleOrdersQuery = useQuery({
    queryKey: ['invoices', 'eligible-orders'],
    queryFn: getEligibleInvoiceOrders,
  })
  const paymentMethodsQuery = useQuery({
    queryKey: ['invoices', 'payment-methods'],
    queryFn: getInvoicePaymentMethods,
  })
  const applicationsQuery = useQuery({
    queryKey: ['invoices', 'self', page, pageSize, status, keyword],
    queryFn: () =>
      getOwnInvoiceApplications(page, pageSize, {
        status,
        keyword: keyword.trim() || undefined,
      }),
    placeholderData: (previousData) => previousData,
  })

  const refreshApplications = () =>
    queryClient.invalidateQueries({ queryKey: ['invoices', 'self'] })

  const createMutation = useMutation({
    mutationFn: async (request: InvoiceApplicationFormValues) => {
      const response = await createInvoiceApplication(request)
      if (!response.success) throw new Error(response.message)
      return response
    },
    onSuccess: async () => {
      toast.success(t('Invoice application submitted.'))
      setApplicationDialogOpen(false)
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['invoices', 'eligible-orders'],
        }),
        refreshApplications(),
      ])
    },
    onError: () => toast.error(t('Failed to submit invoice application.')),
  })

  const paymentMutation = useMutation({
    mutationFn: async (paymentMethod: string) => {
      if (!detailsTarget) {
        throw new Error(t('Invoice application is unavailable.'))
      }
      const response = await requestInvoiceSupplementPayment(
        detailsTarget.id,
        paymentMethod
      )
      if (!response.success || !response.url || !response.data) {
        throw new Error(response.message || t('Payment request failed'))
      }
      return { url: response.url, data: response.data }
    },
    onSuccess: ({ url, data }) => {
      submitPaymentForm(url, data)
      toast.success(t('Redirecting to payment page...'))
    },
    onError: () => toast.error(t('Payment request failed')),
  })

  const sendMutation = useMutation({
    mutationFn: async (application: InvoiceApplication) => {
      const response = await sendOwnInvoiceEmail(application.id)
      if (!response.success) throw new Error(response.message)
      return response
    },
    onSuccess: async () => {
      toast.success(t('Invoice email sent.'))
      setDetailsTarget(null)
      await refreshApplications()
    },
    onError: () => toast.error(t('Failed to send invoice email.')),
  })

  const handleOpenApplicationDialog = () => {
    setApplicationDialogOpen(true)
    void Promise.all([configQuery.refetch(), eligibleOrdersQuery.refetch()])
  }

  const handleViewInvoiceFile = async () => {
    if (!detailsTarget) return
    const previewWindow = window.open('about:blank', '_blank')
    if (!previewWindow) {
      toast.error(t('Failed to download invoice.'))
      return
    }
    previewWindow.opener = null
    setFileActionPending(true)
    try {
      const blob = await getOwnInvoiceFile(detailsTarget.id)
      const objectUrl = URL.createObjectURL(blob)
      previewWindow.location.href = objectUrl
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
    } catch {
      previewWindow.close()
      toast.error(t('Failed to download invoice.'))
    } finally {
      setFileActionPending(false)
    }
  }

  const config = configQuery.data?.data
  const applications = applicationsQuery.data?.data
  const paymentMethods = paymentMethodsQuery.data?.data ?? EMPTY_PAYMENT_METHODS
  const eligibleOrders = eligibleOrdersQuery.data?.data ?? EMPTY_ORDERS
  const refreshing =
    configQuery.isFetching ||
    eligibleOrdersQuery.isFetching ||
    paymentMethodsQuery.isFetching ||
    applicationsQuery.isFetching

  return (
    <>
      <SectionPageLayout fixedContent>
        <SectionPageLayout.Title>
          {t('Invoice applications')}
        </SectionPageLayout.Title>
        <SectionPageLayout.Actions>
          <Button
            onClick={handleOpenApplicationDialog}
            disabled={config?.enabled === false}
          >
            <HugeiconsIcon icon={AddInvoiceIcon} data-icon='inline-start' />
            {t('Apply for an invoice')}
          </Button>
        </SectionPageLayout.Actions>
        <SectionPageLayout.Content>
          <div className='flex h-full min-h-0 flex-col gap-3'>
            {config && !config.enabled ? (
              <Alert>
                <AlertTitle>
                  {t('Invoice applications are unavailable')}
                </AlertTitle>
                <AlertDescription>
                  {t('The administrator has not enabled invoice applications.')}
                </AlertDescription>
              </Alert>
            ) : null}
            <div className='min-h-0 flex-1'>
              <InvoiceApplicationsList
                applications={applications?.items ?? []}
                loading={applicationsQuery.isLoading}
                fetching={applicationsQuery.isFetching}
                page={page}
                pageSize={pageSize}
                total={applications?.total ?? 0}
                keyword={keyword}
                status={status}
                isAdmin={false}
                sendingId={
                  sendMutation.isPending
                    ? (sendMutation.variables?.id ?? null)
                    : null
                }
                deletingId={null}
                refreshing={refreshing}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
                onKeywordChange={setKeyword}
                onStatusChange={setStatus}
                onView={setDetailsTarget}
                onSend={(application) => sendMutation.mutate(application)}
                onDelete={() => undefined}
                onRefresh={() =>
                  void Promise.all([
                    configQuery.refetch(),
                    eligibleOrdersQuery.refetch(),
                    paymentMethodsQuery.refetch(),
                    applicationsQuery.refetch(),
                  ])
                }
              />
            </div>
          </div>
        </SectionPageLayout.Content>
      </SectionPageLayout>

      <InvoiceApplicationDialog
        open={applicationDialogOpen}
        onOpenChange={setApplicationDialogOpen}
        config={config}
        orders={eligibleOrders}
        configLoading={configQuery.isLoading}
        configError={configQuery.isError || configQuery.data?.success === false}
        ordersLoading={eligibleOrdersQuery.isLoading}
        ordersError={
          eligibleOrdersQuery.isError ||
          eligibleOrdersQuery.data?.success === false
        }
        submitting={createMutation.isPending}
        onRetry={() =>
          void Promise.all([
            configQuery.refetch(),
            eligibleOrdersQuery.refetch(),
          ])
        }
        onSubmit={async (values) => {
          await createMutation.mutateAsync(values)
        }}
      />

      <InvoiceDetailsDialog
        application={detailsTarget}
        isAdmin={false}
        paymentMethods={paymentMethods}
        busy={
          paymentMutation.isPending ||
          sendMutation.isPending ||
          fileActionPending
        }
        onOpenChange={(open) => !open && setDetailsTarget(null)}
        onReview={() => undefined}
        onPay={(method) => paymentMutation.mutate(method)}
        onUpload={() => undefined}
        onViewFile={() => void handleViewInvoiceFile()}
        onSend={() => detailsTarget && sendMutation.mutate(detailsTarget)}
      />
    </>
  )
}
