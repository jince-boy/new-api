/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/

import { AddInvoiceIcon, Search01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { SectionPageLayout } from '@/components/layout'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { submitPaymentForm } from '@/features/wallet/lib'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

import {
  createInvoiceApplication,
  downloadInvoiceFile,
  getEligibleInvoiceOrders,
  getInvoiceApplications,
  getInvoiceConfig,
  getInvoicePaymentMethods,
  requestInvoiceSupplementPayment,
  reviewInvoiceApplication,
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
  ReviewInvoiceApplicationRequest,
} from './types'

const PAGE_SIZE = 20
const EMPTY_ORDERS: EligibleInvoiceOrder[] = []
const EMPTY_PAYMENT_METHODS: InvoicePaymentMethod[] = []

export function Invoices() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const userRole = useAuthStore((state) => state.auth.user?.role)
  const isAdmin = Boolean(userRole && userRole >= ROLE.ADMIN)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState<string | null>('all')
  const [keywordInput, setKeywordInput] = useState('')
  const [keyword, setKeyword] = useState('')
  const [applicationDialogOpen, setApplicationDialogOpen] = useState(false)
  const [detailsTarget, setDetailsTarget] = useState<InvoiceApplication | null>(
    null
  )
  const [downloading, setDownloading] = useState(false)

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
    queryKey: ['invoices', 'applications', isAdmin, page, status, keyword],
    queryFn: () =>
      getInvoiceApplications(page, PAGE_SIZE, {
        status: status === 'all' ? undefined : status || undefined,
        keyword: keyword || undefined,
      }),
  })

  const refreshApplications = async () => {
    await queryClient.invalidateQueries({
      queryKey: ['invoices', 'applications'],
    })
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
    onError: (error: Error) => toast.error(t(error.message)),
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
    onError: (error: Error) => toast.error(t(error.message)),
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
    onError: (error: Error) => toast.error(t(error.message)),
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
      toast.success(t('Invoice uploaded.'))
      setDetailsTarget(null)
      await refreshApplications()
    },
    onError: (error: Error) => toast.error(t(error.message)),
  })

  const handleDownload = async () => {
    if (!detailsTarget) return
    try {
      setDownloading(true)
      await downloadInvoiceFile(detailsTarget)
    } catch {
      toast.error(t('Failed to download invoice.'))
    } finally {
      setDownloading(false)
    }
  }

  const handleOpenApplicationDialog = () => {
    setApplicationDialogOpen(true)
    void Promise.all([configQuery.refetch(), eligibleOrdersQuery.refetch()])
  }

  const config = configQuery.data?.data
  const applications = applicationsQuery.data?.data
  const eligibleOrders = eligibleOrdersQuery.data?.data ?? EMPTY_ORDERS
  const paymentMethods = paymentMethodsQuery.data?.data ?? EMPTY_PAYMENT_METHODS
  const busy =
    reviewMutation.isPending ||
    paymentMutation.isPending ||
    uploadMutation.isPending ||
    downloading

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>
        {isAdmin ? t('Invoice review') : t('Invoice applications')}
      </SectionPageLayout.Title>
      {!isAdmin ? (
        <SectionPageLayout.Actions>
          <Button onClick={handleOpenApplicationDialog}>
            <HugeiconsIcon icon={AddInvoiceIcon} data-icon='inline-start' />
            {t('Apply for an invoice')}
          </Button>
        </SectionPageLayout.Actions>
      ) : null}
      <SectionPageLayout.Content>
        <div className='mx-auto flex w-full max-w-7xl flex-col gap-4'>
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

          <Card>
            <CardHeader className='gap-3'>
              <div className='flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between'>
                <CardTitle>
                  {isAdmin
                    ? t('Invoice application list')
                    : t('Application history')}
                </CardTitle>
                <div className='flex flex-col gap-2 sm:flex-row'>
                  <div className='flex min-w-64 gap-2'>
                    <Input
                      value={keywordInput}
                      placeholder={t(
                        'Search application number, title, tax number, or email'
                      )}
                      onChange={(event) => setKeywordInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          setPage(1)
                          setKeyword(keywordInput.trim())
                        }
                      }}
                    />
                    <Button
                      variant='outline'
                      size='icon'
                      aria-label={t('Search')}
                      onClick={() => {
                        setPage(1)
                        setKeyword(keywordInput.trim())
                      }}
                    >
                      <HugeiconsIcon icon={Search01Icon} />
                    </Button>
                  </div>
                  <Select
                    items={[
                      { value: 'all', label: t('All statuses') },
                      { value: 'pending_review', label: t('Review pending') },
                      {
                        value: 'pending_payment',
                        label: t('Awaiting tax supplement'),
                      },
                      { value: 'approved', label: t('Approved') },
                      { value: 'issued', label: t('Issued') },
                      { value: 'rejected', label: t('Rejected') },
                    ]}
                    value={status}
                    onValueChange={(value) => {
                      setPage(1)
                      setStatus(value)
                    }}
                  >
                    <SelectTrigger className='sm:w-52'>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent alignItemWithTrigger={false}>
                      <SelectGroup>
                        <SelectItem value='all'>{t('All statuses')}</SelectItem>
                        <SelectItem value='pending_review'>
                          {t('Review pending')}
                        </SelectItem>
                        <SelectItem value='pending_payment'>
                          {t('Awaiting tax supplement')}
                        </SelectItem>
                        <SelectItem value='approved'>
                          {t('Approved')}
                        </SelectItem>
                        <SelectItem value='issued'>{t('Issued')}</SelectItem>
                        <SelectItem value='rejected'>
                          {t('Rejected')}
                        </SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {config ? (
                <details className='rounded-md border px-3 py-2 text-sm'>
                  <summary className='cursor-pointer font-medium'>
                    {t('Detailed invoicing instructions')}
                  </summary>
                  <div className='text-muted-foreground mt-3 space-y-2'>
                    <p>{config.policy_notice}</p>
                    <p>
                      {t('VAT threshold')}: {config.vat_threshold_cents / 100}{' '}
                      {config.currency} · {t('Current estimated VAT rate')}:{' '}
                      {config.vat_rate_basis_points / 100}%
                    </p>
                    <div className='flex flex-wrap gap-x-3 gap-y-1'>
                      {config.policy_source_urls
                        .split('\n')
                        .filter(Boolean)
                        .map((source) => (
                          <a
                            key={source}
                            className='text-primary underline'
                            href={source}
                            target='_blank'
                            rel='noreferrer'
                          >
                            {t('Policy source')}
                          </a>
                        ))}
                    </div>
                  </div>
                </details>
              ) : null}
            </CardHeader>
            <CardContent>
              <InvoiceApplicationsList
                applications={applications?.items ?? []}
                loading={applicationsQuery.isLoading}
                page={page}
                pageSize={PAGE_SIZE}
                total={applications?.total ?? 0}
                onPageChange={setPage}
                showUser={isAdmin}
                renderActions={(application) => (
                  <Button
                    size='sm'
                    variant='outline'
                    onClick={() => setDetailsTarget(application)}
                  >
                    {isAdmin ? t('View and review') : t('View details')}
                  </Button>
                )}
              />
            </CardContent>
          </Card>
        </div>
      </SectionPageLayout.Content>

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
        onDownload={() => void handleDownload()}
      />
    </SectionPageLayout>
  )
}
