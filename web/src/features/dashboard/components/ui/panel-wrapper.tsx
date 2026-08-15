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
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

interface PanelWrapperProps {
  title: ReactNode
  description?: ReactNode
  loading?: boolean
  empty?: boolean
  emptyMessage?: string
  className?: string
  contentClassName?: string
  headerActions?: ReactNode
  children?: ReactNode
}

function PanelHeader(props: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
}) {
  const heading = (
    <div className='flex flex-col gap-1'>
      <div className='text-sm font-semibold'>{props.title}</div>
      {props.description != null && (
        <div className='text-muted-foreground text-xs'>{props.description}</div>
      )}
    </div>
  )

  return (
    <div className='border-border/50 bg-muted/15 flex min-h-18 items-center border-b px-4 py-3 sm:px-5'>
      {props.actions != null ? (
        <div className='flex w-full items-start justify-between gap-2'>
          {heading}
          {props.actions}
        </div>
      ) : (
        heading
      )}
    </div>
  )
}

export function PanelWrapper(props: PanelWrapperProps) {
  const { t } = useTranslation()
  const resolvedEmptyMessage = props.emptyMessage ?? t('No data available')
  const frameClassName = cn(
    'border-border/60 bg-card/95 flex h-[22rem] min-w-0 flex-col overflow-hidden rounded-2xl border shadow-xs',
    props.className
  )

  if (props.loading) {
    return (
      <section className={frameClassName}>
        <PanelHeader title={props.title} description={props.description} />
        <div
          className={cn('min-h-0 flex-1 p-4 sm:p-5', props.contentClassName)}
        >
          <Skeleton className='size-full' />
        </div>
      </section>
    )
  }

  if (props.empty) {
    return (
      <section className={frameClassName}>
        <PanelHeader title={props.title} description={props.description} />
        <div
          className={cn(
            'text-muted-foreground flex min-h-0 flex-1 items-center justify-center px-4 text-sm',
            props.contentClassName
          )}
        >
          {resolvedEmptyMessage}
        </div>
      </section>
    )
  }

  return (
    <section className={frameClassName}>
      <PanelHeader
        title={props.title}
        description={props.description}
        actions={props.headerActions}
      />
      <div className={cn('min-h-0 flex-1 p-4 sm:p-5', props.contentClassName)}>
        {props.children}
      </div>
    </section>
  )
}
