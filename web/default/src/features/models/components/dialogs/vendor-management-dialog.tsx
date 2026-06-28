/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { BadgeCell } from '@/components/data-table'
import { StaticDataTable } from '@/components/data-table/static/static-data-table'
import { Dialog } from '@/components/dialog'
import { ProviderBadge } from '@/components/provider-badge'
import { StatusBadge } from '@/components/status-badge'
import { getVendors } from '../../api'
import { handleDeleteVendor, vendorsQueryKeys } from '../../lib'
import type { Vendor } from '../../types'
import { VendorMutateDialog } from './vendor-mutate-dialog'

type VendorManagementDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function VendorManagementDialog(props: VendorManagementDialogProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [mutateOpen, setMutateOpen] = useState(false)
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Vendor | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: vendorsQueryKeys.list({ page_size: 1000 }),
    queryFn: () => getVendors({ page_size: 1000 }),
    enabled: props.open,
  })

  const vendors = data?.data?.items ?? []

  const handleCreate = () => {
    setEditingVendor(null)
    setMutateOpen(true)
  }

  const handleEdit = (vendor: Vendor) => {
    setEditingVendor(vendor)
    setMutateOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return
    setIsDeleting(true)
    try {
      await handleDeleteVendor(deleteTarget.id, queryClient, () => {
        setDeleteTarget(null)
      })
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <>
      <Dialog
        open={props.open}
        onOpenChange={props.onOpenChange}
        title={t('Manage Vendors')}
        contentClassName='sm:max-w-4xl'
        contentHeight='min(520px, calc(100vh - 14rem))'
        bodyClassName='space-y-4'
      >
        <div className='flex items-center justify-end'>
          <Button size='sm' onClick={handleCreate}>
            <Plus className='h-4 w-4' />
            {t('Create Vendor')}
          </Button>
        </div>

        <StaticDataTable
          data={isLoading ? [] : vendors}
          getRowKey={(vendor) => vendor.id}
          emptyClassName='text-sm text-muted-foreground'
          emptyContent={
            isLoading ? t('Loading...') : t('No providers available')
          }
          columns={[
            {
              id: 'name',
              header: t('Vendor'),
              cellClassName: 'min-w-[160px]',
              cell: (vendor) => (
                <ProviderBadge
                  iconKey={vendor.icon}
                  label={vendor.name}
                  copyable={false}
                />
              ),
            },
            {
              id: 'description',
              header: t('Description'),
              cellClassName: 'text-muted-foreground max-w-[320px]',
              cell: (vendor) => vendor.description || '-',
            },
            {
              id: 'status',
              header: t('Status'),
              cell: (vendor) => (
                <BadgeCell>
                  <StatusBadge
                    label={vendor.status === 1 ? t('Enabled') : t('Disabled')}
                    variant={vendor.status === 1 ? 'success' : 'neutral'}
                    copyable={false}
                    size='sm'
                  />
                </BadgeCell>
              ),
            },
            {
              id: 'actions',
              header: t('Actions'),
              className: 'text-right',
              cellClassName: 'text-right',
              cell: (vendor) => (
                <div className='flex justify-end gap-1'>
                  <Button
                    variant='ghost'
                    size='icon-sm'
                    onClick={() => handleEdit(vendor)}
                    aria-label={t('Edit')}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    variant='ghost'
                    size='icon-sm'
                    onClick={() => setDeleteTarget(vendor)}
                    aria-label={t('Delete')}
                    className='text-destructive hover:text-destructive'
                  >
                    <Trash2 />
                  </Button>
                </div>
              ),
            },
          ]}
        />
      </Dialog>

      <VendorMutateDialog
        open={mutateOpen}
        onOpenChange={setMutateOpen}
        currentVendor={editingVendor}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={t('Delete')}
        desc={
          <span>
            {t('Are you sure you want to delete')}{' '}
            <strong>{deleteTarget?.name || ''}</strong>?
          </span>
        }
        confirmText={t('Delete')}
        destructive
        handleConfirm={handleConfirmDelete}
        isLoading={isDeleting}
      />
    </>
  )
}
