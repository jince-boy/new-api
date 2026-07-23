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
import { SearchIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

import { apiDocGroups, apiDocItems } from '../data/catalog'
import type { ApiDocItem } from '../types'
import { MethodBadge } from './method-badge'

type DocsSidebarProps = {
  className?: string
  query: string
  selectedId: string
  onQueryChange: (query: string) => void
  onSelect: (item: ApiDocItem) => void
}

export function DocsSidebar(props: DocsSidebarProps) {
  const { t } = useTranslation()

  const groupedItems = useMemo(() => {
    const normalizedQuery = props.query.trim().toLocaleLowerCase()
    return apiDocGroups
      .map((group) => {
        const items = apiDocItems.filter((item) => {
          if (item.group !== group.id) return false
          if (!normalizedQuery) return true
          const searchable = [
            t(item.title),
            t(item.summary),
            item.kind === 'endpoint' ? item.path : '',
          ]
            .join(' ')
            .toLocaleLowerCase()
          return searchable.includes(normalizedQuery)
        })
        return { group, items }
      })
      .filter((entry) => entry.items.length > 0)
  }, [props.query, t])

  return (
    <div className={cn('flex min-h-0 flex-col gap-6', props.className)}>
      <InputGroup className='bg-muted/35 focus-within:border-border h-9 rounded-lg border-transparent shadow-none'>
        <InputGroupAddon>
          <HugeiconsIcon icon={SearchIcon} strokeWidth={2} aria-hidden='true' />
        </InputGroupAddon>
        <InputGroupInput
          value={props.query}
          onChange={(event) => props.onQueryChange(event.target.value)}
          placeholder={t('Search endpoints...')}
          aria-label={t('Search API documentation')}
        />
      </InputGroup>

      <ScrollArea className='min-h-0 flex-1 pr-3'>
        <nav aria-label={t('API documentation navigation')}>
          <div className='flex flex-col gap-7 pb-8'>
            {groupedItems.map((entry) => (
              <section key={entry.group.id} className='flex flex-col gap-1'>
                <h2 className='text-muted-foreground mb-1.5 px-2 text-[10px] font-semibold tracking-[0.16em] uppercase'>
                  {t(entry.group.title)}
                </h2>
                {entry.items.map((item) => {
                  const isActive = props.selectedId === item.id
                  return (
                    <button
                      key={item.id}
                      type='button'
                      onClick={() => props.onSelect(item)}
                      aria-current={isActive ? 'page' : undefined}
                      className={cn(
                        'hover:bg-muted/55 focus-visible:ring-ring/50 flex min-w-0 items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors focus-visible:ring-3 focus-visible:outline-none',
                        isActive && 'bg-muted/80 text-foreground'
                      )}
                    >
                      {item.kind === 'endpoint' && (
                        <MethodBadge method={item.method} />
                      )}
                      <span className='min-w-0 flex-1'>
                        <span className='block truncate text-sm font-medium'>
                          {t(item.title)}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </section>
            ))}

            {groupedItems.length === 0 && (
              <p className='text-muted-foreground px-2 py-8 text-center text-sm'>
                {t('No matching endpoints found.')}
              </p>
            )}
          </div>
        </nav>
      </ScrollArea>
    </div>
  )
}
