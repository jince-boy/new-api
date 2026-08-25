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
import ImageUploadIcon from '@hugeicons/core-free-icons/ImageUploadIcon'
import { HugeiconsIcon } from '@hugeicons/react'
import { useQueryClient } from '@tanstack/react-query'
import { type ChangeEvent, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import { useSystemConfigStore } from '@/stores/system-config-store'

import { removeLogo, uploadLogo, type LogoVariant } from '../api'

const LOGO_MAX_BYTES = 5 * 1024 * 1024
const LOGO_CONTENT_TYPES = new Set([
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
])

type LogoUploadFieldProps = {
  variant: LogoVariant
  value: string
  disabled?: boolean
  onSaved: (value: string) => void
}

export function LogoUploadField(props: LogoUploadFieldProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const setSystemConfig = useSystemConfigStore((state) => state.setConfig)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [isRemoving, setIsRemoving] = useState(false)
  const [previewVersion, setPreviewVersion] = useState(() => Date.now())
  const publicURL = `/api/logo/${props.variant}`

  const previewURL = useMemo(() => {
    if (!props.value.startsWith(publicURL)) return props.value
    const separator = props.value.includes('?') ? '&' : '?'
    return `${props.value}${separator}preview=${previewVersion}`
  }, [previewVersion, props.value, publicURL])
  const previewClassName = cn(
    'flex size-20 items-center justify-center rounded-xl border p-2',
    props.variant === 'light' && 'border-zinc-200 bg-white text-zinc-500',
    props.variant === 'dark' && 'border-zinc-800 bg-zinc-950 text-zinc-400',
    !previewURL && 'border-dashed text-center text-xs'
  )

  const refreshSystemConfig = () => {
    queryClient.invalidateQueries({ queryKey: ['system-options'] })
    queryClient.invalidateQueries({ queryKey: ['status'] })
    try {
      window.localStorage.removeItem('status')
    } catch {
      /* empty */
    }
  }

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    if (!LOGO_CONTENT_TYPES.has(file.type)) {
      toast.error(t('Logo image must be PNG, JPEG, WebP, or GIF'))
      return
    }
    if (file.size > LOGO_MAX_BYTES) {
      toast.error(t('Logo image must be 5 MB or smaller'))
      return
    }

    setIsUploading(true)
    try {
      const response = await uploadLogo(props.variant, file)
      if (!response.success) {
        toast.error(response.message || t('Failed to upload logo'))
        return
      }

      const nextURL = response.data?.url || publicURL
      props.onSaved(nextURL)
      if (props.variant === 'light') {
        setSystemConfig({ logoLight: nextURL })
      } else {
        setSystemConfig({ logoDark: nextURL })
      }
      setPreviewVersion(Date.now())
      refreshSystemConfig()
      toast.success(t('Logo uploaded successfully'))
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t('Failed to upload logo')
      )
    } finally {
      setIsUploading(false)
    }
  }

  const handleRemove = async () => {
    setIsRemoving(true)
    try {
      const response = await removeLogo(props.variant)
      if (!response.success) {
        toast.error(response.message || t('Failed to remove logo'))
        return
      }

      props.onSaved('')
      if (props.variant === 'light') {
        setSystemConfig({ logoLight: '' })
      } else {
        setSystemConfig({ logoDark: '' })
      }
      refreshSystemConfig()
      toast.success(t('Logo removed successfully'))
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t('Failed to remove logo')
      )
    } finally {
      setIsRemoving(false)
    }
  }

  const isPending = isUploading || isRemoving
  const uploadLabel = props.value ? t('Replace') : t('Upload')

  return (
    <div className='flex min-w-0 flex-col gap-3'>
      {previewURL ? (
        <div className={previewClassName}>
          <img
            src={previewURL}
            alt={t('Logo preview')}
            className='size-full object-contain'
          />
        </div>
      ) : (
        <div className={previewClassName}>{t('No custom logo uploaded')}</div>
      )}

      <input
        ref={fileInputRef}
        type='file'
        accept='image/png,image/jpeg,image/webp,image/gif'
        className='hidden'
        onChange={handleFileChange}
      />
      <div className='flex flex-wrap items-center gap-2'>
        <Button
          type='button'
          variant='outline'
          onClick={() => fileInputRef.current?.click()}
          disabled={props.disabled || isPending}
        >
          {isUploading ? (
            <Spinner data-icon='inline-start' />
          ) : (
            <HugeiconsIcon
              icon={ImageUploadIcon}
              data-icon='inline-start'
              strokeWidth={2}
            />
          )}
          {isUploading ? t('Uploading...') : uploadLabel}
        </Button>
        {props.value && (
          <Button
            type='button'
            variant='outline'
            onClick={handleRemove}
            disabled={props.disabled || isPending}
          >
            {isRemoving && <Spinner data-icon='inline-start' />}
            {t('Remove')}
          </Button>
        )}
      </div>
    </div>
  )
}
