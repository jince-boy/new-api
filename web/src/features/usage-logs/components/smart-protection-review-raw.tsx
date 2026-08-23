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

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

export function SmartProtectionReviewRaw(props: {
  raw: string
  children: ReactNode
}) {
  const { t } = useTranslation()

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type='button'
            className='focus-visible:ring-ring inline-flex rounded-sm focus-visible:ring-2 focus-visible:outline-none'
            aria-label={t('Show safety model response')}
            onClick={(event) => event.stopPropagation()}
          />
        }
      >
        {props.children}
      </PopoverTrigger>
      <PopoverContent
        side='top'
        align='start'
        className='w-96 max-w-[min(24rem,calc(100vw-2rem))]'
      >
        <div className='flex flex-col gap-2'>
          <p className='font-medium'>{t('Safety model response')}</p>
          <pre className='text-muted-foreground max-h-64 overflow-auto font-mono text-xs break-words whitespace-pre-wrap'>
            {props.raw}
          </pre>
        </div>
      </PopoverContent>
    </Popover>
  )
}
