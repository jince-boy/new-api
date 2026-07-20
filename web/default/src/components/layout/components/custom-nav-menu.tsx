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
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card'
import { cn } from '@/lib/utils'

import type { TopNavLink } from '../types'

type CustomNavMenuProps = {
  links: TopNavLink[]
  triggerClassName?: string
}

export function CustomNavMenu(props: CustomNavMenuProps) {
  const { t } = useTranslation()
  const label = t('More')

  return (
    <HoverCard>
      <HoverCardTrigger
        delay={100}
        closeDelay={100}
        render={
          <Button
            type='button'
            variant='ghost'
            size='sm'
            className={cn(
              'text-muted-foreground hover:text-foreground h-8 rounded-lg px-2.5 text-sm font-medium',
              props.triggerClassName
            )}
            aria-label={label}
          >
            {label}
          </Button>
        }
      />
      <HoverCardContent align='end' className='w-48 p-1.5'>
        <nav aria-label={label} className='flex flex-col gap-0.5'>
          {props.links.map((link) => {
            const linkClassName = cn(
              'text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring/50 flex min-h-9 items-center rounded-md px-2.5 py-2 text-sm font-medium transition-colors outline-none focus-visible:ring-3',
              link.disabled && 'pointer-events-none opacity-50'
            )

            if (link.external) {
              return (
                <a
                  key={`${link.title}-${link.href}`}
                  href={link.href}
                  target={link.openInNewTab ? '_blank' : undefined}
                  rel={link.openInNewTab ? 'noopener noreferrer' : undefined}
                  aria-disabled={link.disabled}
                  tabIndex={link.disabled ? -1 : undefined}
                  className={linkClassName}
                >
                  {link.title}
                </a>
              )
            }

            return (
              <Link
                key={`${link.title}-${link.href}`}
                to={link.href}
                disabled={link.disabled}
                className={linkClassName}
              >
                {link.title}
              </Link>
            )
          })}
        </nav>
      </HoverCardContent>
    </HoverCard>
  )
}
