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
import { Megaphone } from 'lucide-react'
import { memo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { IconBadge } from '@/components/ui/icon-badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useAnnouncements } from '@/features/dashboard/hooks/use-status-data'
import { getPreviewText } from '@/features/dashboard/lib'
import type { AnnouncementItem } from '@/features/dashboard/types'
import { getAnnouncementColorClass } from '@/lib/colors'
import { formatDateTimeObject } from '@/lib/time'
import { cn } from '@/lib/utils'

import { PanelWrapper } from '../ui/panel-wrapper'
import { AnnouncementDetailModal } from './announcement-detail-dialog'

const VISIBLE_ANNOUNCEMENT_COUNT = 3

const AnnouncementStatusDot = memo(function AnnouncementStatusDot(props: {
  type?: string
}) {
  return (
    <span
      className={cn(
        'mt-1.5 inline-block size-2 shrink-0 rounded-full',
        getAnnouncementColorClass(props.type)
      )}
    />
  )
})

export function AnnouncementsPanelContent(props: {
  list: AnnouncementItem[]
  loading?: boolean
}) {
  const { t } = useTranslation()
  const [selectedAnnouncement, setSelectedAnnouncement] =
    useState<AnnouncementItem | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const visibleAnnouncements = props.list.slice(0, VISIBLE_ANNOUNCEMENT_COUNT)

  const handleAnnouncementClick = (item: AnnouncementItem) => {
    setSelectedAnnouncement(item)
    setIsDialogOpen(true)
  }

  let content = (
    <div className='text-muted-foreground flex min-h-0 flex-1 items-center justify-center px-4 text-sm'>
      {t('No announcements at this time')}
    </div>
  )
  if (props.loading) {
    content = (
      <div className='min-h-0 flex-1 divide-y overflow-hidden'>
        {Array.from({ length: VISIBLE_ANNOUNCEMENT_COUNT }, (_, index) => (
          <div key={index} className='p-4'>
            <Skeleton className='h-4 w-4/5' />
            <Skeleton className='mt-3 h-3 w-2/5' />
          </div>
        ))}
      </div>
    )
  } else if (visibleAnnouncements.length > 0) {
    content = (
      <div className='min-h-0 flex-1 divide-y overflow-y-auto'>
        {visibleAnnouncements.map((item: AnnouncementItem, idx: number) => {
          const key = item.id ?? `announcement-${idx}`
          return (
            <button
              key={key}
              type='button'
              onClick={() => handleAnnouncementClick(item)}
              className='group hover:bg-muted/40 focus-visible:ring-ring w-full px-4 py-3 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset'
            >
              <div className='flex items-start gap-2.5'>
                <AnnouncementStatusDot type={item.type} />
                <div className='flex min-w-0 flex-1 flex-col gap-1'>
                  <p className='line-clamp-2 text-sm leading-relaxed font-medium'>
                    {getPreviewText(item.content)}
                  </p>
                  <div className='mt-1 flex items-center justify-between gap-3'>
                    {item.publishDate && (
                      <time className='text-muted-foreground text-xs'>
                        {formatDateTimeObject(new Date(item.publishDate))}
                      </time>
                    )}
                    <span className='text-muted-foreground text-xs opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100'>
                      {t('View details')}
                    </span>
                  </div>
                </div>
              </div>
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <>
      <PanelWrapper
        title={
          <span className='flex items-center gap-2'>
            <IconBadge tone='warning' size='sm'>
              <Megaphone />
            </IconBadge>
            <span className='text-sm font-semibold'>{t('Announcements')}</span>
          </span>
        }
        description={t('Latest platform updates and notices')}
        contentClassName='flex flex-col p-0'
      >
        {content}
      </PanelWrapper>

      <AnnouncementDetailModal
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        announcement={selectedAnnouncement}
      />
    </>
  )
}

export function AnnouncementsPanel() {
  const { items: list, loading } = useAnnouncements()

  return <AnnouncementsPanelContent list={list} loading={loading} />
}
