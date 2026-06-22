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
import {
  CropIcon,
  ExternalLinkIcon,
  ImageUploadIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useQueryClient } from '@tanstack/react-query'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type PointerEvent,
} from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { CopyButton } from '@/components/copy-button'
import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'

import { uploadGroupChatQRCode } from '../api'
import { SettingsSection } from '../components/settings-section'

const GROUP_CHAT_QRCODE_PUBLIC_PATH = '/api/group-chat-qrcode'
const MAX_CROP_PREVIEW_SIZE = 360
const MAX_CROP_OUTPUT_SIZE = 1024

type CropFrame = {
  x: number
  y: number
  size: number
}

type CropImage = {
  file: File
  objectURL: string
  naturalWidth: number
  naturalHeight: number
}

type DragState = {
  pointerId: number
  offsetX: number
  offsetY: number
}

type GroupChatQRCodeSectionProps = {
  defaultValue: string
  defaultExpiresAt: string
}

function normalizeValue(value: unknown): string {
  if (value === undefined || value === null) return ''
  return typeof value === 'string' ? value : String(value)
}

function resolvePublicURL(value: string): string {
  if (!value) return ''
  if (typeof window === 'undefined') return value
  try {
    return new URL(value, window.location.origin).toString()
  } catch {
    return value
  }
}

function resolvePreviewURL(value: string, cacheBust: number): string {
  if (!value) return ''
  try {
    const url = new URL(value)
    url.searchParams.set('_', String(cacheBust))
    return url.toString()
  } catch {
    const separator = value.includes('?') ? '&' : '?'
    return `${value}${separator}_=${cacheBust}`
  }
}

function dateFromOptionValue(value: string): Date | null {
  const normalized = normalizeValue(value).trim()
  if (!normalized) return null

  if (/^\d+$/.test(normalized)) {
    const timestamp = Number(normalized)
    const date = new Date(
      timestamp > 1_000_000_000_000 ? timestamp : timestamp * 1000
    )
    return Number.isNaN(date.getTime()) ? null : date
  }

  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? null : date
}

function toDatetimeLocalValue(value: string): string {
  const date = dateFromOptionValue(value)
  if (!date) return ''

  const pad = (nextValue: number) => String(nextValue).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function toExpiresAtPayload(value: string): string {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString()
}

function formatExpirationTime(value: string): string {
  const date = dateFromOptionValue(value)
  return date ? date.toLocaleString() : ''
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function createCenteredCropFrame(width: number, height: number): CropFrame {
  const size = Math.min(width, height)
  return {
    x: Math.round((width - size) / 2),
    y: Math.round((height - size) / 2),
    size,
  }
}

function getMinimumCropSize(image: CropImage): number {
  const shortestSide = Math.min(image.naturalWidth, image.naturalHeight)
  return Math.min(shortestSide, Math.max(32, Math.round(shortestSide * 0.2)))
}

function getPreviewMetrics(image: CropImage) {
  const scale = Math.min(
    MAX_CROP_PREVIEW_SIZE / image.naturalWidth,
    MAX_CROP_PREVIEW_SIZE / image.naturalHeight,
    1
  )
  return {
    displayWidth: Math.round(image.naturalWidth * scale),
    displayHeight: Math.round(image.naturalHeight * scale),
    scale,
  }
}

function readImageSize(objectURL: string) {
  return new Promise<{ naturalWidth: number; naturalHeight: number }>(
    (resolve, reject) => {
      const image = new Image()
      image.onload = () => {
        if (!image.naturalWidth || !image.naturalHeight) {
          reject(new Error('Image has no dimensions'))
          return
        }
        resolve({
          naturalWidth: image.naturalWidth,
          naturalHeight: image.naturalHeight,
        })
      }
      image.onerror = () => reject(new Error('Unable to load image'))
      image.src = objectURL
    }
  )
}

function loadImageElement(objectURL: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Unable to load image'))
    image.src = objectURL
  })
}

async function cropImageToFile(image: CropImage, frame: CropFrame) {
  const sourceImage = await loadImageElement(image.objectURL)
  const outputSize = clamp(Math.round(frame.size), 1, MAX_CROP_OUTPUT_SIZE)
  const canvas = document.createElement('canvas')
  canvas.width = outputSize
  canvas.height = outputSize

  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Canvas is not available')
  }

  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(
    sourceImage,
    frame.x,
    frame.y,
    frame.size,
    frame.size,
    0,
    0,
    outputSize,
    outputSize
  )

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((nextBlob) => {
      if (!nextBlob) {
        reject(new Error('Failed to create cropped image'))
        return
      }
      resolve(nextBlob)
    }, 'image/png')
  })

  return new File([blob], `group-chat-qrcode-${Date.now()}.png`, {
    type: 'image/png',
  })
}

export function GroupChatQRCodeSection({
  defaultValue,
  defaultExpiresAt,
}: GroupChatQRCodeSectionProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const cropAreaRef = useRef<HTMLDivElement | null>(null)
  const selectedImageRef = useRef<CropImage | null>(null)
  const dragStateRef = useRef<DragState | null>(null)
  const [groupChatQRCodeURL, setGroupChatQRCodeURL] = useState(
    normalizeValue(defaultValue)
  )
  const [groupChatQRCodeExpiresAt, setGroupChatQRCodeExpiresAt] = useState(
    normalizeValue(defaultExpiresAt)
  )
  const [expiresAtValue, setExpiresAtValue] = useState(() =>
    toDatetimeLocalValue(normalizeValue(defaultExpiresAt))
  )
  const [previewCacheBust, setPreviewCacheBust] = useState(() => Date.now())
  const [isUploadingQRCode, setIsUploadingQRCode] = useState(false)
  const [cropDialogOpen, setCropDialogOpen] = useState(false)
  const [selectedImage, setSelectedImage] = useState<CropImage | null>(null)
  const [cropFrame, setCropFrame] = useState<CropFrame | null>(null)

  useEffect(() => {
    setGroupChatQRCodeURL(normalizeValue(defaultValue))
  }, [defaultValue])

  useEffect(() => {
    const nextExpiresAt = normalizeValue(defaultExpiresAt)
    setGroupChatQRCodeExpiresAt(nextExpiresAt)
    setExpiresAtValue(toDatetimeLocalValue(nextExpiresAt))
  }, [defaultExpiresAt])

  useEffect(
    () => () => {
      if (selectedImageRef.current) {
        URL.revokeObjectURL(selectedImageRef.current.objectURL)
      }
    },
    []
  )

  const resolvedGroupChatQRCodeURL = useMemo(
    () => resolvePublicURL(groupChatQRCodeURL),
    [groupChatQRCodeURL]
  )

  const previewGroupChatQRCodeURL = useMemo(
    () => resolvePreviewURL(resolvedGroupChatQRCodeURL, previewCacheBust),
    [previewCacheBust, resolvedGroupChatQRCodeURL]
  )

  const minExpirationValue = useMemo(
    () => toDatetimeLocalValue(new Date(Date.now() + 60_000).toISOString()),
    []
  )

  const expirationText = useMemo(() => {
    const formattedTime = formatExpirationTime(groupChatQRCodeExpiresAt)
    return formattedTime
      ? t('The QR code expires at {{time}}', { time: formattedTime })
      : t('No expiration time has been set.')
  }, [groupChatQRCodeExpiresAt, t])

  const previewMetrics = useMemo(
    () => (selectedImage ? getPreviewMetrics(selectedImage) : null),
    [selectedImage]
  )

  const cropSizeRange = useMemo(() => {
    if (!selectedImage) {
      return { min: 1, max: 1 }
    }
    return {
      min: getMinimumCropSize(selectedImage),
      max: Math.min(selectedImage.naturalWidth, selectedImage.naturalHeight),
    }
  }, [selectedImage])

  const setNextSelectedImage = (image: CropImage | null) => {
    if (selectedImageRef.current) {
      URL.revokeObjectURL(selectedImageRef.current.objectURL)
    }
    selectedImageRef.current = image
    setSelectedImage(image)
  }

  const closeCropDialog = () => {
    dragStateRef.current = null
    setCropDialogOpen(false)
    setCropFrame(null)
    setNextSelectedImage(null)
  }

  const uploadQRCodeFile = async (file: File) => {
    const expiresAtPayload = toExpiresAtPayload(expiresAtValue)
    if (!expiresAtPayload) {
      toast.error(t('Please select the QR code expiration time'))
      return false
    }

    setIsUploadingQRCode(true)
    try {
      const response = await uploadGroupChatQRCode(file, expiresAtPayload)
      if (!response.success) {
        toast.error(response.message || t('Failed to upload QR code'))
        return false
      }

      const nextURL = response.data?.url || GROUP_CHAT_QRCODE_PUBLIC_PATH
      const nextExpiresAt = response.data?.expires_at || expiresAtPayload
      setGroupChatQRCodeURL(nextURL)
      setGroupChatQRCodeExpiresAt(nextExpiresAt)
      setExpiresAtValue(toDatetimeLocalValue(nextExpiresAt))
      setPreviewCacheBust(Date.now())
      queryClient.invalidateQueries({ queryKey: ['system-options'] })
      queryClient.invalidateQueries({ queryKey: ['status'] })
      try {
        window.localStorage.removeItem('status')
      } catch {
        /* empty */
      }
      closeCropDialog()
      toast.success(t('QR code uploaded successfully'))
      return true
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t('Failed to upload QR code')
      )
      return false
    } finally {
      setIsUploadingQRCode(false)
    }
  }

  const handleSelectQRCodeImage = () => {
    if (!toExpiresAtPayload(expiresAtValue)) {
      toast.error(t('Please select the QR code expiration time'))
      return
    }
    fileInputRef.current?.click()
  }

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    const objectURL = URL.createObjectURL(file)
    try {
      const imageSize = await readImageSize(objectURL)
      const nextImage = {
        file,
        objectURL,
        ...imageSize,
      }
      setNextSelectedImage(nextImage)
      setCropFrame(
        createCenteredCropFrame(nextImage.naturalWidth, nextImage.naturalHeight)
      )
      setCropDialogOpen(true)
    } catch {
      URL.revokeObjectURL(objectURL)
      toast.error(t('Failed to prepare image'))
    }
  }

  const updateCropSize = (nextSizeValue: number) => {
    if (!selectedImage) return
    setCropFrame((current) => {
      if (!current) return current
      const nextSize = clamp(
        Math.round(nextSizeValue),
        cropSizeRange.min,
        cropSizeRange.max
      )
      const centerX = current.x + current.size / 2
      const centerY = current.y + current.size / 2
      return {
        x: clamp(
          centerX - nextSize / 2,
          0,
          selectedImage.naturalWidth - nextSize
        ),
        y: clamp(
          centerY - nextSize / 2,
          0,
          selectedImage.naturalHeight - nextSize
        ),
        size: nextSize,
      }
    })
  }

  const moveCropFrame = (nextX: number, nextY: number) => {
    if (!selectedImage) return
    setCropFrame((current) => {
      if (!current) return current
      return {
        ...current,
        x: clamp(nextX, 0, selectedImage.naturalWidth - current.size),
        y: clamp(nextY, 0, selectedImage.naturalHeight - current.size),
      }
    })
  }

  const handleCropPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!previewMetrics || !cropFrame || event.button !== 0) return
    event.preventDefault()
    const cropArea = cropAreaRef.current
    if (!cropArea) return

    const bounds = cropArea.getBoundingClientRect()
    const pointerX = (event.clientX - bounds.left) / previewMetrics.scale
    const pointerY = (event.clientY - bounds.top) / previewMetrics.scale
    dragStateRef.current = {
      pointerId: event.pointerId,
      offsetX: pointerX - cropFrame.x,
      offsetY: pointerY - cropFrame.y,
    }
    cropArea.setPointerCapture(event.pointerId)
  }

  const handleCropPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!previewMetrics) return
    const dragState = dragStateRef.current
    if (!dragState || dragState.pointerId !== event.pointerId) return

    const cropArea = cropAreaRef.current
    if (!cropArea) return

    const bounds = cropArea.getBoundingClientRect()
    const pointerX = (event.clientX - bounds.left) / previewMetrics.scale
    const pointerY = (event.clientY - bounds.top) / previewMetrics.scale
    moveCropFrame(pointerX - dragState.offsetX, pointerY - dragState.offsetY)
  }

  const handleCropPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const cropArea = cropAreaRef.current
    if (cropArea?.hasPointerCapture(event.pointerId)) {
      cropArea.releasePointerCapture(event.pointerId)
    }
    if (dragStateRef.current?.pointerId === event.pointerId) {
      dragStateRef.current = null
    }
  }

  const handleCropKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!cropFrame) return
    const step = event.shiftKey ? 10 : 1
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      moveCropFrame(cropFrame.x - step, cropFrame.y)
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      moveCropFrame(cropFrame.x + step, cropFrame.y)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      moveCropFrame(cropFrame.x, cropFrame.y - step)
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      moveCropFrame(cropFrame.x, cropFrame.y + step)
    }
  }

  const handleCropAndUpload = async () => {
    if (!selectedImage || !cropFrame) return
    try {
      const croppedFile = await cropImageToFile(selectedImage, cropFrame)
      await uploadQRCodeFile(croppedFile)
    } catch {
      toast.error(t('Failed to crop image'))
    }
  }

  return (
    <SettingsSection title={t('Group Chat QR Code')}>
      <div className='flex min-w-0 flex-col gap-4'>
        <div className='flex min-w-0 flex-col gap-2'>
          <p className='text-muted-foreground text-sm'>
            {t(
              'Upload the current WeChat group QR code and share the public link below.'
            )}
          </p>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor='group-chat-qrcode-expires-at'>
                {t('QR code expiration time')}
              </FieldLabel>
              <Input
                id='group-chat-qrcode-expires-at'
                type='datetime-local'
                value={expiresAtValue}
                min={minExpirationValue}
                onChange={(event) => setExpiresAtValue(event.target.value)}
              />
              <FieldDescription>
                {t(
                  'The system will email root users within 24 hours before the QR code expires.'
                )}
              </FieldDescription>
            </Field>
          </FieldGroup>
          <p className='text-muted-foreground text-sm'>{expirationText}</p>
          {resolvedGroupChatQRCodeURL ? (
            <div className='flex min-w-0 flex-col gap-3'>
              <div className='flex min-w-0 gap-2'>
                <Input
                  value={resolvedGroupChatQRCodeURL}
                  readOnly
                  aria-label={t('Group chat QR code public link')}
                  className='min-w-0'
                />
                <CopyButton
                  value={resolvedGroupChatQRCodeURL}
                  tooltip={t('Copy public link')}
                  successTooltip={t('Copied!')}
                  aria-label={t('Copy public link')}
                />
                <Button
                  type='button'
                  variant='outline'
                  size='icon'
                  onClick={() =>
                    window.open(
                      resolvedGroupChatQRCodeURL,
                      '_blank',
                      'noopener,noreferrer'
                    )
                  }
                  aria-label={t('Open public link')}
                  title={t('Open public link')}
                >
                  <HugeiconsIcon icon={ExternalLinkIcon} strokeWidth={2} />
                </Button>
              </div>
              <img
                src={previewGroupChatQRCodeURL}
                alt={t('Group chat QR code preview')}
                className='size-40 rounded-lg border object-contain p-2'
              />
            </div>
          ) : (
            <p className='text-muted-foreground text-sm'>
              {t('No group chat QR code has been uploaded yet.')}
            </p>
          )}
        </div>

        <div className='flex flex-wrap items-center gap-2'>
          <input
            ref={fileInputRef}
            type='file'
            accept='image/png,image/jpeg,image/webp,image/gif'
            className='hidden'
            onChange={handleFileChange}
          />
          <Button
            type='button'
            variant='outline'
            onClick={handleSelectQRCodeImage}
            disabled={isUploadingQRCode}
          >
            {isUploadingQRCode ? (
              <Spinner data-icon='inline-start' />
            ) : (
              <HugeiconsIcon
                icon={ImageUploadIcon}
                data-icon='inline-start'
                strokeWidth={2}
              />
            )}
            {isUploadingQRCode ? t('Uploading...') : t('Select QR Code Image')}
          </Button>
        </div>
      </div>

      <Dialog
        open={cropDialogOpen}
        onOpenChange={(open) => {
          if (!open && !isUploadingQRCode) {
            closeCropDialog()
          }
        }}
        title={t('Crop QR Code')}
        description={t(
          'Move the crop box over the QR code, then upload the cropped image.'
        )}
        contentHeight='auto'
        contentClassName='sm:max-w-xl'
        bodyClassName='flex flex-col gap-4'
        footer={
          <>
            <Button
              type='button'
              variant='outline'
              onClick={closeCropDialog}
              disabled={isUploadingQRCode}
            >
              {t('Cancel')}
            </Button>
            <Button
              type='button'
              variant='secondary'
              onClick={() => {
                if (selectedImage) {
                  uploadQRCodeFile(selectedImage.file)
                }
              }}
              disabled={!selectedImage || isUploadingQRCode}
            >
              {t('Use original image')}
            </Button>
            <Button
              type='button'
              onClick={handleCropAndUpload}
              disabled={!selectedImage || !cropFrame || isUploadingQRCode}
            >
              {isUploadingQRCode ? (
                <Spinner data-icon='inline-start' />
              ) : (
                <HugeiconsIcon
                  icon={CropIcon}
                  data-icon='inline-start'
                  strokeWidth={2}
                />
              )}
              {t('Crop and upload')}
            </Button>
          </>
        }
      >
        {selectedImage && previewMetrics && cropFrame ? (
          <>
            <div className='bg-muted/30 flex justify-center overflow-auto rounded-lg border p-3'>
              <div
                ref={cropAreaRef}
                className='relative shrink-0 touch-none select-none'
                style={{
                  width: previewMetrics.displayWidth,
                  height: previewMetrics.displayHeight,
                }}
                onPointerMove={handleCropPointerMove}
                onPointerUp={handleCropPointerUp}
                onPointerCancel={handleCropPointerUp}
              >
                <img
                  src={selectedImage.objectURL}
                  alt={t('Group chat QR code preview')}
                  className='block rounded-lg object-contain'
                  style={{
                    width: previewMetrics.displayWidth,
                    height: previewMetrics.displayHeight,
                  }}
                />
                <div
                  role='button'
                  tabIndex={0}
                  aria-label={t('Drag to crop')}
                  className={cn(
                    'absolute cursor-move rounded-lg border-2 border-primary bg-background/10 shadow-sm outline-none',
                    'ring-primary/20 focus-visible:ring-2'
                  )}
                  style={{
                    left: cropFrame.x * previewMetrics.scale,
                    top: cropFrame.y * previewMetrics.scale,
                    width: cropFrame.size * previewMetrics.scale,
                    height: cropFrame.size * previewMetrics.scale,
                  }}
                  onPointerDown={handleCropPointerDown}
                  onKeyDown={handleCropKeyDown}
                />
              </div>
            </div>

            <FieldGroup>
              <Field>
                <div className='flex items-center justify-between gap-3'>
                  <FieldLabel>{t('Crop size')}</FieldLabel>
                  <span className='text-muted-foreground text-sm'>
                    {Math.round(cropFrame.size)}px
                  </span>
                </div>
                <Slider
                  value={[cropFrame.size]}
                  min={cropSizeRange.min}
                  max={cropSizeRange.max}
                  step={1}
                  onValueChange={(value) => {
                    const nextValue = Array.isArray(value) ? value[0] : value
                    updateCropSize(nextValue)
                  }}
                  disabled={isUploadingQRCode}
                />
                <FieldDescription>
                  {t(
                    'Drag the crop box or use the size slider to keep the QR code inside the square.'
                  )}
                </FieldDescription>
              </Field>
            </FieldGroup>
          </>
        ) : (
          <p className='text-muted-foreground text-sm'>
            {t('Failed to prepare image')}
          </p>
        )}
      </Dialog>
    </SettingsSection>
  )
}
