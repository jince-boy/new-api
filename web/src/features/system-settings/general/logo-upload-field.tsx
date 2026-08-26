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

import { removeLogo, uploadLogo } from '../api'

const LOGO_MAX_BYTES = 5 * 1024 * 1024
const LOGO_PUBLIC_URL = '/api/logo'
const LOGO_CONTENT_TYPES = new Set([
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/svg+xml',
  'image/webp',
])

type LogoUploadFieldProps = {
  value: string
  disabled?: boolean
  onSaved: (value: string) => void
}

export function LogoUploadField(props: LogoUploadFieldProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [isRemoving, setIsRemoving] = useState(false)
  const [previewVersion, setPreviewVersion] = useState(() => Date.now())

  const previewURL = useMemo(() => {
    if (!props.value.startsWith(LOGO_PUBLIC_URL)) return props.value
    const separator = props.value.includes('?') ? '&' : '?'
    return `${props.value}${separator}preview=${previewVersion}`
  }, [previewVersion, props.value])

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
      toast.error(t('Logo image must be PNG, JPEG, WebP, GIF, or SVG'))
      return
    }
    if (file.size > LOGO_MAX_BYTES) {
      toast.error(t('Logo image must be 5 MB or smaller'))
      return
    }

    setIsUploading(true)
    try {
      const response = await uploadLogo(file)
      if (!response.success) {
        toast.error(response.message || t('Failed to upload logo'))
        return
      }

      const nextURL = response.data?.url || LOGO_PUBLIC_URL
      props.onSaved(nextURL)
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
      const response = await removeLogo()
      if (!response.success) {
        toast.error(response.message || t('Failed to remove logo'))
        return
      }

      props.onSaved('')
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
        <img
          src={previewURL}
          alt={t('Logo preview')}
          className='bg-muted/30 size-20 rounded-xl border object-contain p-2'
        />
      ) : (
        <div className='text-muted-foreground flex size-20 items-center justify-center rounded-xl border border-dashed p-2 text-center text-xs'>
          {t('No custom logo uploaded')}
        </div>
      )}

      <input
        ref={fileInputRef}
        type='file'
        accept='image/png,image/jpeg,image/svg+xml,image/webp,image/gif'
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
