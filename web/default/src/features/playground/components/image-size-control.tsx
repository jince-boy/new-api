/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CUSTOM_IMAGE_SIZE_VALUE, IMAGE_SIZE_OPTIONS } from '../constants'
import {
  isPresetImageSize,
  normalizeImageSizeInput,
  parseImageSizeDimensions,
  validateImageSize,
} from '../lib/image-size'

interface ImageSizeControlProps {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  className?: string
  selectClassName?: string
  compact?: boolean
}

export function ImageSizeControl({
  value,
  onChange,
  disabled = false,
  className,
  selectClassName,
  compact = false,
}: ImageSizeControlProps) {
  const { t } = useTranslation()
  const normalizedValue = normalizeImageSizeInput(value)
  const [customMode, setCustomMode] = useState(
    Boolean(normalizedValue) && !isPresetImageSize(normalizedValue)
  )
  const [draftWidth, setDraftWidth] = useState('1024')
  const [draftHeight, setDraftHeight] = useState('1024')

  useEffect(() => {
    const dimensions = parseImageSizeDimensions(value)
    if (!dimensions) return

    setDraftWidth(String(dimensions.width))
    setDraftHeight(String(dimensions.height))
    if (!isPresetImageSize(value)) {
      setCustomMode(true)
    }
  }, [value])

  const selectedValue =
    customMode || !isPresetImageSize(normalizedValue)
      ? CUSTOM_IMAGE_SIZE_VALUE
      : normalizedValue || IMAGE_SIZE_OPTIONS[0]

  const draftSize = `${draftWidth}x${draftHeight}`
  const validation = useMemo(
    () => validateImageSize(draftSize),
    [draftSize]
  )
  const showValidation = customMode && draftWidth && draftHeight

  const updateDraft = (nextWidth: string, nextHeight: string) => {
    setDraftWidth(nextWidth)
    setDraftHeight(nextHeight)
    if (nextWidth && nextHeight) {
      onChange(`${nextWidth}x${nextHeight}`)
    }
  }

  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <div className='flex min-w-0 flex-wrap items-center gap-2'>
        <Select
          items={[
            ...IMAGE_SIZE_OPTIONS.map((size) => ({ value: size, label: size })),
            { value: CUSTOM_IMAGE_SIZE_VALUE, label: t('Custom size') },
          ]}
          value={selectedValue}
          disabled={disabled}
          onValueChange={(nextValue) => {
            if (!nextValue) return
            if (nextValue === CUSTOM_IMAGE_SIZE_VALUE) {
              setCustomMode(true)
              return
            }
            setCustomMode(false)
            onChange(nextValue)
          }}
        >
          <SelectTrigger
            className={cn(
              'h-8 w-40 min-w-0 shrink-0',
              compact && 'w-36',
              selectClassName
            )}
          >
            <SelectValue placeholder={t('Image size')} />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            <SelectGroup>
              {IMAGE_SIZE_OPTIONS.map((size) => (
                <SelectItem key={size} value={size}>
                  {size}
                </SelectItem>
              ))}
              <SelectItem value={CUSTOM_IMAGE_SIZE_VALUE}>
                {t('Custom size')}
              </SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>

        {customMode && (
          <div
            className={cn(
              'grid min-w-0 flex-1 grid-cols-[minmax(72px,1fr)_auto_minmax(72px,1fr)] items-center gap-1.5',
              !compact && 'max-w-64 flex-none'
            )}
          >
            <Input
              className='h-8 text-sm'
              inputMode='numeric'
              pattern='[0-9]*'
              value={draftWidth}
              disabled={disabled}
              aria-label={t('Width')}
              placeholder={t('Width')}
              onChange={(event) =>
                updateDraft(
                  event.target.value.replace(/\D/g, '').slice(0, 5),
                  draftHeight
                )
              }
            />
            <span className='text-muted-foreground self-center text-xs'>x</span>
            <Input
              className='h-8 text-sm'
              inputMode='numeric'
              pattern='[0-9]*'
              value={draftHeight}
              disabled={disabled}
              aria-label={t('Height')}
              placeholder={t('Height')}
              onChange={(event) =>
                updateDraft(
                  draftWidth,
                  event.target.value.replace(/\D/g, '').slice(0, 5)
                )
              }
            />
          </div>
        )}
      </div>

      {customMode && (
        <p
          className={cn(
            'text-xs leading-relaxed',
            showValidation && !validation.valid
              ? 'text-destructive'
              : 'text-muted-foreground'
          )}
        >
          {showValidation && !validation.valid
            ? t(validation.reason || 'Invalid image size.')
            : t(
                'Custom size rules: long edge <= 3840px; multiples of 16; ratio <= 3:1; total pixels 655,360-8,294,400.'
              )}
        </p>
      )}
    </div>
  )
}
