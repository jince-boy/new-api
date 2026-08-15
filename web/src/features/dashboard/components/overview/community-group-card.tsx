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
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, QrCode } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { IconWeChat } from '@/assets/brand-icons/icon-wechat'
import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { useStatus } from '@/hooks/use-status'

import { getGroupChatQRCodeImage } from '../../api'

export type CommunityGroupCardContentProps = {
  qrCodeUrl?: string
  expiresAt?: string
  imageUrl?: string
  imageError?: boolean
  onRequestImage?: () => void
  onRetry?: () => void
}

export function CommunityGroupCardContent(
  props: CommunityGroupCardContentProps
) {
  const { t } = useTranslation()
  const [dialogOpen, setDialogOpen] = useState(false)
  const qrCodeUrl = props.qrCodeUrl?.trim() ?? ''
  const expirationDate = props.expiresAt
    ? new Date(props.expiresAt.trim())
    : null
  const hasValidExpiration =
    expirationDate !== null && !Number.isNaN(expirationDate.getTime())

  if (
    !qrCodeUrl ||
    (hasValidExpiration && expirationDate.getTime() <= Date.now())
  ) {
    return null
  }

  const expirationText = hasValidExpiration
    ? t('The QR code expires at {{time}}', {
        time: expirationDate.toLocaleString(),
      })
    : null
  const handleDialogOpenChange = (open: boolean) => {
    setDialogOpen(open)
    if (open) {
      props.onRequestImage?.()
    }
  }
  let qrCodeContent = (
    <div className='text-muted-foreground flex flex-col items-center gap-3 text-sm'>
      <Spinner className='size-6' />
      {t('Loading...')}
    </div>
  )
  if (props.imageUrl) {
    qrCodeContent = (
      <img
        src={props.imageUrl}
        alt={t('WeChat user group QR code')}
        className='size-full object-contain'
        draggable={false}
      />
    )
  } else if (props.imageError) {
    qrCodeContent = (
      <div className='flex flex-col items-center gap-3 text-center'>
        <QrCode className='text-muted-foreground size-10' aria-hidden='true' />
        <p className='text-muted-foreground text-sm'>
          {t('Failed to load image')}
        </p>
        <Button type='button' variant='outline' onClick={props.onRetry}>
          {t('Retry')}
        </Button>
      </div>
    )
  }

  return (
    <>
      <section
        className='border-border/60 bg-card/95 h-full overflow-hidden rounded-2xl border shadow-sm'
        aria-labelledby='user-community-title'
      >
        <div className='flex h-full flex-col justify-between gap-6 p-5'>
          <div className='flex min-w-0 items-start gap-4'>
            <span className='bg-success/10 text-success ring-success/20 flex size-11 shrink-0 items-center justify-center rounded-xl ring-1'>
              <IconWeChat className='size-6' aria-hidden='true' />
            </span>
            <div className='min-w-0'>
              <p className='text-success text-xs font-semibold'>
                {t('User community')}
              </p>
              <h3
                id='user-community-title'
                className='mt-1 text-lg font-semibold tracking-tight'
              >
                {t('Join the user community')}
              </h3>
              <p className='text-muted-foreground mt-2 text-sm leading-relaxed'>
                {t(
                  'Connect with other users, share practical experience, and get help faster.'
                )}
              </p>
            </div>
          </div>

          <div className='flex shrink-0 flex-col gap-3'>
            {expirationText ? (
              <p className='text-muted-foreground text-xs'>{expirationText}</p>
            ) : null}
            <Button
              type='button'
              className='w-full justify-between'
              onClick={() => handleDialogOpenChange(true)}
            >
              <QrCode data-icon='inline-start' />
              {t('View QR code')}
              <ArrowRight data-icon='inline-end' />
            </Button>
          </div>
        </div>
      </section>

      <Dialog
        open={dialogOpen}
        onOpenChange={handleDialogOpenChange}
        title={t('Join the WeChat user group')}
        description={t('Scan with WeChat or long-press the QR code on mobile.')}
        contentClassName='sm:max-w-md'
        bodyClassName='flex flex-col items-center gap-4 py-2'
      >
        <div className='flex size-70 items-center justify-center rounded-lg bg-white p-3 ring-1 ring-black/10 sm:size-78'>
          {qrCodeContent}
        </div>
        <div className='flex max-w-sm flex-col items-center gap-1.5 text-center'>
          {expirationText ? (
            <p className='text-muted-foreground text-xs'>{expirationText}</p>
          ) : null}
        </div>
      </Dialog>
    </>
  )
}

export function CommunityGroupCard() {
  const { status } = useStatus()
  const [shouldLoadImage, setShouldLoadImage] = useState(false)
  const imageQuery = useQuery({
    queryKey: [
      'dashboard',
      'overview',
      'group-chat-qrcode',
      status?.group_chat_qrcode_expires_at,
    ],
    queryFn: getGroupChatQRCodeImage,
    enabled: shouldLoadImage && Boolean(status?.group_chat_qrcode),
    staleTime: Number.POSITIVE_INFINITY,
  })
  const imageUrl = useMemo(
    () => (imageQuery.data ? URL.createObjectURL(imageQuery.data) : ''),
    [imageQuery.data]
  )

  useEffect(() => {
    return () => {
      if (imageUrl) {
        URL.revokeObjectURL(imageUrl)
      }
    }
  }, [imageUrl])

  return (
    <CommunityGroupCardContent
      qrCodeUrl={status?.group_chat_qrcode}
      expiresAt={status?.group_chat_qrcode_expires_at}
      imageUrl={imageUrl}
      imageError={imageQuery.isError}
      onRequestImage={() => setShouldLoadImage(true)}
      onRetry={() => void imageQuery.refetch()}
    />
  )
}
