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

import { ConfirmDialog } from '@/components/confirm-dialog'
import { SectionPageLayout } from '@/components/layout'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { submitPaymentForm } from '@/features/wallet/lib'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

import {
  createInvoiceApplication,
  deleteInvoiceApplication,
  getEligibleInvoiceOrders,
  getInvoiceApplications,
  getInvoiceConfig,
  getInvoiceFile,
  getInvoicePaymentMethods,
  requestInvoiceSupplementPayment,
  reviewInvoiceApplication,
  sendInvoiceEmail,
  uploadInvoiceFile,
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
  ReviewInvoiceApplicationRequest,
} from './types'

const EMPTY_ORDERS: EligibleInvoiceOrder[] = []
const EMPTY_PAYMENT_METHODS: InvoicePaymentMethod[] = []

export function Invoices() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const userRole = useAuthStore((state) => state.auth.user?.role)
  const isAdmin = Boolean(userRole && userRole >= ROLE.ADMIN)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [status, setStatus] = useState<InvoiceStatus>()
  const [keyword, setKeyword] = useState('')
  const [applicationDialogOpen, setApplicationDialogOpen] = useState(false)
  const [detailsTarget, setDetailsTarget] = useState<InvoiceApplication | null>(
    null
  )
  const [deleteTarget, setDeleteTarget] = useState<InvoiceApplication | null>(
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
    enabled: !isAdmin,
  })
  const paymentMethodsQuery = useQuery({
    queryKey: ['invoices', 'payment-methods'],
    queryFn: getInvoicePaymentMethods,
    enabled: !isAdmin,
  })
  const applicationsQuery = useQuery({
    queryKey: [
      'invoices',
      'applications',
      isAdmin,
      page,
      pageSize,
      status,
      keyword,
    ],
    queryFn: () =>
      getInvoiceApplications(page, pageSize, {
        status,
        keyword: keyword.trim() || undefined,
      }),
    placeholderData: (previousData) => previousData,
  })

  const refreshApplications = async () => {
    await queryClient.invalidateQueries({
      queryKey: ['invoices', 'applications'],
    })
  }

  const handleRefresh = async () => {
    const requests: Promise<unknown>[] = [
      configQuery.refetch(),
      applicationsQuery.refetch(),
    ]
    if (!isAdmin) {
      requests.push(
        eligibleOrdersQuery.refetch(),
        paymentMethodsQuery.refetch()
      )
    }
    await Promise.all(requests)
  }

  const createMutation = useMutation({
    mutationFn: async (request: InvoiceApplicationFormValues) => {
      const response = await createInvoiceApplication(request)
      if (!response.success) {
        throw new Error(
          response.message || t('Failed to submit invoice application.')
        )
      }
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

  const reviewMutation = useMutation({
    mutationFn: async (request: ReviewInvoiceApplicationRequest) => {
      if (!detailsTarget) {
        throw new Error(t('Invoice application is unavailable.'))
      }
      const response = await reviewInvoiceApplication(detailsTarget.id, request)
      if (!response.success) throw new Error(response.message)
      return response
    },
    onSuccess: async () => {
      toast.success(t('Invoice review completed.'))
      setDetailsTarget(null)
      await refreshApplications()
    },
    onError: () => toast.error(t('Failed to review invoice application.')),
  })

  const deleteMutation = useMutation({
    mutationFn: async (applicationId: number) => {
      const response = await deleteInvoiceApplication(applicationId)
      if (!response.success) throw new Error(response.message)
      return response
    },
    onSuccess: async () => {
      toast.success(t('Deleted successfully'))
      if (detailsTarget?.id === deleteTarget?.id) {
        setDetailsTarget(null)
      }
      setDeleteTarget(null)
      await refreshApplications()
    },
    onError: () => toast.error(t('Delete failed')),
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
    onSuccess: (response) => {
      submitPaymentForm(response.url, response.data)
      toast.success(t('Redirecting to payment page...'))
    },
    onError: () => toast.error(t('Payment request failed')),
  })

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!detailsTarget) {
        throw new Error(t('Invoice application is unavailable.'))
      }
      const response = await uploadInvoiceFile(detailsTarget.id, file)
      if (!response.success) throw new Error(response.message)
      return response
    },
    onSuccess: async () => {
      toast.success(t('Invoice uploaded and sent.'))
      setDetailsTarget(null)
      await refreshApplications()
    },
    onError: async () => {
      toast.error(
        t(
          'Invoice upload or email delivery failed. Refresh the list and try again.'
        )
      )
      setDetailsTarget(null)
      await refreshApplications()
    },
  })

  const sendMutation = useMutation({
    mutationFn: async (application: InvoiceApplication) => {
      const response = await sendInvoiceEmail(application.id)
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
      const blob = await getInvoiceFile(detailsTarget.id)
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
  const eligibleOrders = eligibleOrdersQuery.data?.data ?? EMPTY_ORDERS
  const paymentMethods = paymentMethodsQuery.data?.data ?? EMPTY_PAYMENT_METHODS
  const busy =
    reviewMutation.isPending ||
    paymentMutation.isPending ||
    uploadMutation.isPending ||
    sendMutation.isPending ||
    deleteMutation.isPending ||
    fileActionPending
  const refreshing =
    configQuery.isFetching ||
    applicationsQuery.isFetching ||
    (!isAdmin &&
      (eligibleOrdersQuery.isFetching || paymentMethodsQuery.isFetching))

  return (
    <>
      <SectionPageLayout fixedContent>
        <SectionPageLayout.Title>
          {isAdmin ? t('Invoice review') : t('Invoice applications')}
        </SectionPageLayout.Title>
        {!isAdmin ? (
          <SectionPageLayout.Actions>
            <Button
              onClick={handleOpenApplicationDialog}
              disabled={config?.enabled === false}
            >
              <HugeiconsIcon icon={AddInvoiceIcon} data-icon='inline-start' />
              {t('Apply for an invoice')}
            </Button>
          </SectionPageLayout.Actions>
        ) : null}
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
                isAdmin={isAdmin}
                sendingId={
                  sendMutation.isPending
                    ? (sendMutation.variables?.id ?? null)
                    : null
                }
                deletingId={
                  deleteMutation.isPending ? deleteMutation.variables : null
                }
                refreshing={refreshing}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
                onKeywordChange={setKeyword}
                onStatusChange={setStatus}
                onView={setDetailsTarget}
                onSend={(application) => sendMutation.mutate(application)}
                onDelete={setDeleteTarget}
                onRefresh={() => void handleRefresh()}
              />
            </div>
          </div>
        </SectionPageLayout.Content>
      </SectionPageLayout>

      {!isAdmin ? (
        <InvoiceApplicationDialog
          open={applicationDialogOpen}
          onOpenChange={setApplicationDialogOpen}
          config={config}
          orders={eligibleOrders}
          configLoading={configQuery.isLoading}
          configError={
            configQuery.isError || configQuery.data?.success === false
          }
          ordersLoading={eligibleOrdersQuery.isLoading}
          ordersError={
            eligibleOrdersQuery.isError ||
            eligibleOrdersQuery.data?.success === false
          }
          submitting={createMutation.isPending}
          onRetry={() => {
            void Promise.all([
              configQuery.refetch(),
              eligibleOrdersQuery.refetch(),
            ])
          }}
          onSubmit={async (values) => {
            await createMutation.mutateAsync(values)
          }}
        />
      ) : null}

      <InvoiceDetailsDialog
        application={detailsTarget}
        isAdmin={isAdmin}
        paymentMethods={paymentMethods}
        busy={busy}
        onOpenChange={(open) => !open && setDetailsTarget(null)}
        onReview={(request) => reviewMutation.mutate(request)}
        onPay={(method) => paymentMutation.mutate(method)}
        onUpload={(file) => uploadMutation.mutate(file)}
        onViewFile={() => void handleViewInvoiceFile()}
        onSend={() => detailsTarget && sendMutation.mutate(detailsTarget)}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={t('Confirm delete')}
        desc={
          <div className='flex flex-col gap-2'>
            <span className='text-foreground font-medium'>
              #{deleteTarget?.id} {deleteTarget?.invoice_title}
            </span>
            <span>{t('This action cannot be undone.')}</span>
          </div>
        }
        destructive
        confirmText={t('Delete')}
        isLoading={deleteMutation.isPending}
        handleConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.id)
        }}
      />
    </>
  )
}
