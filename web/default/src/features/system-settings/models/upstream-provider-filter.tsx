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
import { ChevronDown } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { getLobeIcon } from '@/lib/lobe-icon'

import type { ProviderOption } from './upstream-pricing-utils'

type UpstreamProviderFilterProps = {
  options: ProviderOption[]
  selected: string[]
  disabled: boolean
  onChange: (selected: string[]) => void
}

export function UpstreamProviderFilter(props: UpstreamProviderFilterProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const selectedSet = useMemo(() => new Set(props.selected), [props.selected])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type='button'
            variant='outline'
            size='sm'
            disabled={props.disabled}
            className='h-8 min-w-48 justify-between px-2 text-[12px] font-normal'
          >
            <span className='truncate'>
              {props.selected.length > 0
                ? t('Selected {{count}}', { count: props.selected.length })
                : t('Provider')}
            </span>
            <ChevronDown data-icon='inline-end' />
          </Button>
        }
      />
      <PopoverContent align='start' className='w-72 gap-0 p-0'>
        <Command>
          <CommandInput placeholder={t('Provider')} className='text-[12px]' />
          <CommandList>
            <CommandEmpty>{t('No matching items')}</CommandEmpty>
            <CommandGroup>
              {props.options.map((option) => {
                const selected = selectedSet.has(option.id)
                return (
                  <CommandItem
                    key={option.id}
                    value={`${option.name} ${option.id}`}
                    data-checked={selected}
                    onSelect={() => {
                      if (selected) {
                        props.onChange(
                          props.selected.filter((id) => id !== option.id)
                        )
                      } else {
                        props.onChange([...props.selected, option.id])
                      }
                    }}
                    className='text-[12px]'
                  >
                    <span className='flex size-5 shrink-0 items-center justify-center overflow-hidden rounded-sm border'>
                      {getLobeIcon(`${option.iconKey}.Color`, 14)}
                    </span>
                    <span className='min-w-0 flex-1 truncate'>{option.name}</span>
                    <span className='text-muted-foreground text-[10px] tabular-nums'>
                      {option.count}
                    </span>
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
          {props.selected.length > 0 && (
            <div className='border-t p-1'>
              <Button
                type='button'
                variant='ghost'
                size='sm'
                className='h-7 w-full text-[12px]'
                onClick={() => props.onChange([])}
              >
                {t('Clear all')}
              </Button>
            </div>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  )
}
