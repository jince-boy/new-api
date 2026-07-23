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
import { BookOpen02Icon, Menu01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { PublicLayout } from '@/components/layout'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { useStatus } from '@/hooks/use-status'

import { DocsSidebar } from './components/docs-sidebar'
import { EndpointReference } from './components/endpoint-reference'
import { GuideContent } from './components/guide-content'
import { apiDocItemsById, defaultApiDocItem } from './data/catalog'
import { resolveApiDocsBaseUrl } from './lib/base-url'
import { apiDocsLayoutClasses } from './lib/layout'
import type { ApiDocItem } from './types'

type ApiDocsPageProps = {
  selectedId?: string
  onSelectedIdChange: (id: string) => void
}

export function ApiDocsPage(props: ApiDocsPageProps) {
  const { t } = useTranslation()
  const { status } = useStatus()
  const [query, setQuery] = useState('')
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false)
  const selectedItem =
    (props.selectedId && apiDocItemsById.get(props.selectedId)) ||
    defaultApiDocItem
  const baseUrl = resolveApiDocsBaseUrl(
    status,
    typeof window === 'undefined' ? '' : window.location.origin
  )

  const selectItem = (item: ApiDocItem) => {
    props.onSelectedIdChange(item.id)
    setMobileNavigationOpen(false)
    window.scrollTo({ top: 0, behavior: 'auto' })
  }

  return (
    <PublicLayout showMainContainer={false}>
      <header className='bg-background/92 supports-backdrop-filter:bg-background/78 sticky top-0 z-40 border-b pt-14 backdrop-blur-xl'>
        <div
          className={`${apiDocsLayoutClasses.pageContainer} flex h-16 items-center justify-between gap-6`}
        >
          <div className='flex min-w-0 items-center gap-3'>
            <span className='shrink-0 text-sm font-semibold tracking-tight'>
              {t('API Reference')}
            </span>
            <span className='bg-border h-4 w-px' aria-hidden='true' />
            <span className='text-muted-foreground truncate text-xs'>
              {t('One gateway, several API formats')}
            </span>
          </div>
          <div className='hidden min-w-0 items-center gap-2 lg:flex'>
            <span className='text-muted-foreground text-xs'>
              {t('Base URL')}
            </span>
            <code className='text-foreground/80 max-w-72 truncate font-mono text-xs'>
              {baseUrl}
            </code>
            <CopyButton
              value={baseUrl}
              tooltip={t('Copy base URL')}
              successTooltip={t('Base URL copied')}
            />
          </div>
          <Button
            type='button'
            variant='outline'
            size='sm'
            className='lg:hidden'
            onClick={() => setMobileNavigationOpen(true)}
          >
            <HugeiconsIcon
              icon={Menu01Icon}
              strokeWidth={2}
              data-icon='inline-start'
              aria-hidden='true'
            />
            {t('Browse')}
          </Button>
        </div>
      </header>

      <main className={apiDocsLayoutClasses.contentGrid}>
        <aside className={apiDocsLayoutClasses.desktopSidebar}>
          <DocsSidebar
            className={apiDocsLayoutClasses.desktopSidebarContent}
            query={query}
            selectedId={selectedItem.id}
            onQueryChange={setQuery}
            onSelect={selectItem}
          />
        </aside>

        <div className={apiDocsLayoutClasses.readingColumn}>
          {selectedItem.kind === 'endpoint' ? (
            <EndpointReference endpoint={selectedItem} />
          ) : (
            <GuideContent baseUrl={baseUrl} guide={selectedItem} />
          )}
        </div>
      </main>

      <Sheet open={mobileNavigationOpen} onOpenChange={setMobileNavigationOpen}>
        <SheetContent side='left' className='w-[88%] max-w-sm'>
          <SheetHeader>
            <div className='flex items-center gap-2'>
              <HugeiconsIcon
                icon={BookOpen02Icon}
                strokeWidth={2}
                aria-hidden='true'
              />
              <SheetTitle>{t('Browse API documentation')}</SheetTitle>
            </div>
            <SheetDescription>
              {t('Search guides and public endpoints.')}
            </SheetDescription>
          </SheetHeader>
          <DocsSidebar
            className='min-h-0 flex-1 px-4 pb-4'
            query={query}
            selectedId={selectedItem.id}
            onQueryChange={setQuery}
            onSelect={selectItem}
          />
        </SheetContent>
      </Sheet>
    </PublicLayout>
  )
}
