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
import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { formatQuota, formatTimestampToDate } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog } from '@/components/dialog'
import { getInvitationDetails, isApiSuccess } from '../../api'
import type { InvitationDetails } from '../../types'

interface InvitationDetailsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const LOADING_ROW_KEYS = ['loading-1', 'loading-2', 'loading-3', 'loading-4', 'loading-5']

function formatUserStatus(status: number, t: (key: string) => string) {
  return status === 1 ? t('Enabled') : t('Disabled')
}

export function InvitationDetailsDialog({
  open,
  onOpenChange,
}: InvitationDetailsDialogProps) {
  const { t } = useTranslation()
  const [details, setDetails] = useState<InvitationDetails | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return

    let cancelled = false
    async function loadDetails() {
      setLoading(true)
      try {
        const response = await getInvitationDetails()
        if (cancelled) return
        if (isApiSuccess(response) && response.data) {
          setDetails(response.data)
        } else {
          toast.error(response.message || t('Failed to load invitation details'))
        }
      } catch {
        if (!cancelled) {
          toast.error(t('Failed to load invitation details'))
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadDetails()
    return () => {
      cancelled = true
    }
  }, [open, t])

  const invitedUsers = details?.invited_users ?? []
  const rebateDetails = details?.rebate_details ?? []

  let invitedUsersContent: ReactNode
  if (loading) {
    invitedUsersContent = (
      <div className='flex flex-col gap-2'>
        {LOADING_ROW_KEYS.map((key) => (
          <Skeleton key={`user-${key}`} className='h-10 rounded-md' />
        ))}
      </div>
    )
  } else if (invitedUsers.length === 0) {
    invitedUsersContent = (
      <div className='text-muted-foreground flex min-h-36 items-center justify-center text-sm'>
        {t('No invited users found')}
      </div>
    )
  } else {
    invitedUsersContent = (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('User ID')}</TableHead>
            <TableHead>{t('Username')}</TableHead>
            <TableHead>{t('Status')}</TableHead>
            <TableHead>{t('Created At')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invitedUsers.map((user) => (
            <TableRow key={user.id}>
              <TableCell>{user.id}</TableCell>
              <TableCell>{user.username}</TableCell>
              <TableCell>
                <Badge variant={user.status === 1 ? 'default' : 'secondary'}>
                  {formatUserStatus(user.status, t)}
                </Badge>
              </TableCell>
              <TableCell>{formatTimestampToDate(user.created_at)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    )
  }

  let rebateDetailsContent: ReactNode
  if (loading) {
    rebateDetailsContent = (
      <div className='flex flex-col gap-2'>
        {LOADING_ROW_KEYS.map((key) => (
          <Skeleton key={`rebate-${key}`} className='h-10 rounded-md' />
        ))}
      </div>
    )
  } else if (rebateDetails.length === 0) {
    rebateDetailsContent = (
      <div className='text-muted-foreground flex min-h-36 items-center justify-center text-sm'>
        {t('No rebate records found')}
      </div>
    )
  } else {
    rebateDetailsContent = (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('Invitee')}</TableHead>
            <TableHead>{t('Recharge Amount')}</TableHead>
            <TableHead>{t('Reward')}</TableHead>
            <TableHead>{t('Payment Method')}</TableHead>
            <TableHead>{t('Completed At')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rebateDetails.map((rebate) => (
            <TableRow key={rebate.id}>
              <TableCell>
                {rebate.invitee_name || rebate.invitee_username || '-'}
              </TableCell>
              <TableCell>{formatQuota(rebate.recharge_quota)}</TableCell>
              <TableCell>{formatQuota(rebate.reward_quota)}</TableCell>
              <TableCell>
                {rebate.payment_method || rebate.payment_provider || '-'}
              </TableCell>
              <TableCell>
                {formatTimestampToDate(
                  rebate.complete_time || rebate.create_time
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    )
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('Invitation Details')}
      description={t('Review invited users and recharge rebate records')}
      contentClassName='flex max-h-[calc(100dvh-2rem)] flex-col max-sm:w-screen max-sm:max-w-none max-sm:rounded-none max-sm:p-4 sm:max-w-5xl'
      contentHeight='auto'
      bodyClassName='flex min-h-0 flex-col gap-3'
    >
      <Tabs defaultValue='users' className='min-h-0'>
        <TabsList className='grid w-full grid-cols-2'>
          <TabsTrigger value='users'>
            {t('Invited Users')} ({details?.invited_total ?? 0})
          </TabsTrigger>
          <TabsTrigger value='rebates'>
            {t('Rebate Details')} ({details?.rebate_total ?? 0})
          </TabsTrigger>
        </TabsList>

        <TabsContent value='users' className='mt-3 min-h-0'>
          <ScrollArea className='max-h-[min(56vh,520px)] pr-3'>
            {invitedUsersContent}
          </ScrollArea>
        </TabsContent>

        <TabsContent value='rebates' className='mt-3 min-h-0'>
          <ScrollArea className='max-h-[min(56vh,520px)] pr-3'>
            {rebateDetailsContent}
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </Dialog>
  )
}
