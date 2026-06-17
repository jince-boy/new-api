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
import { useCallback, useRef, type ChangeEvent } from 'react'
import {
  Copy,
  Download,
  ImageIcon,
  ImagesIcon,
  MessageSquareIcon,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { ModelGroupSelector } from '@/components/model-group-selector'
import {
  IMAGE_COUNT_OPTIONS,
  IMAGE_QUALITY_OPTIONS,
  IMAGE_SIZE_OPTIONS,
  PLAYGROUND_MODES,
} from '../constants'
import { readImageFilesAsDataUrls } from '../lib'
import type {
  GroupOption,
  ImageAsset,
  ModelOption,
  PlaygroundConfig,
  PlaygroundMode,
} from '../types'

interface ImageStudioPanelProps {
  activeMode: PlaygroundMode
  config: PlaygroundConfig
  models: ModelOption[]
  groups: GroupOption[]
  references: string[]
  latestImages: ImageAsset[]
  imageLibrary: ImageAsset[]
  isGenerating: boolean
  isModelLoading?: boolean
  onModeChange: (mode: PlaygroundMode) => void
  onConfigChange: <K extends keyof PlaygroundConfig>(
    key: K,
    value: PlaygroundConfig[K]
  ) => void
  onAddReferences: (urls: string[]) => void
  onRemoveReference: (index: number) => void
  onClearReferences: () => void
  onUseImageAsReference: (url: string) => void
  onDeleteImageAsset: (assetId: string) => void
  onClearImageLibrary: () => void
}

const modeItems = [
  {
    key: PLAYGROUND_MODES.CHAT,
    label: 'Chat',
    icon: MessageSquareIcon,
  },
  {
    key: PLAYGROUND_MODES.IMAGE,
    label: 'Generate image',
    icon: ImageIcon,
  },
  {
    key: PLAYGROUND_MODES.IMAGE_EDIT,
    label: 'Image to image',
    icon: ImagesIcon,
  },
] as const

function ImageAssetTile({
  asset,
  onUseAsReference,
  onDelete,
}: {
  asset: ImageAsset
  onUseAsReference: (url: string) => void
  onDelete?: (assetId: string) => void
}) {
  const { t } = useTranslation()

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(asset.url)
      toast.success(t('Image URL copied'))
    } catch {
      toast.error(t('Failed to copy image URL'))
    }
  }

  return (
    <Card size='sm' className='rounded-lg py-0'>
      <div className='bg-muted aspect-square overflow-hidden'>
        <img
          src={asset.url}
          alt={asset.prompt || t('Creative result')}
          className='size-full object-cover'
        />
      </div>
      <CardContent className='flex flex-col gap-2 p-2'>
        <p className='text-muted-foreground line-clamp-2 text-xs'>
          {asset.prompt || t('No prompt')}
        </p>
        <div className='flex items-center gap-1'>
          <Button
            aria-label={t('Use as reference')}
            title={t('Use as reference')}
            size='icon-sm'
            variant='ghost'
            onClick={() => onUseAsReference(asset.url)}
          >
            <Plus />
          </Button>
          <Button
            aria-label={t('Copy image URL')}
            title={t('Copy image URL')}
            size='icon-sm'
            variant='ghost'
            onClick={() => void copyUrl()}
          >
            <Copy />
          </Button>
          <Button
            aria-label={t('Download image')}
            title={t('Download image')}
            size='icon-sm'
            variant='ghost'
            render={<a href={asset.url} download />}
          >
            <Download />
          </Button>
          {onDelete && (
            <Button
              aria-label={t('Delete image')}
              title={t('Delete image')}
              size='icon-sm'
              variant='ghost'
              onClick={() => onDelete(asset.id)}
            >
              <Trash2 />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export function ImageStudioPanel({
  activeMode,
  config,
  models,
  groups,
  references,
  latestImages,
  imageLibrary,
  isModelLoading = false,
  onModeChange,
  onConfigChange,
  onAddReferences,
  onRemoveReference,
  onClearReferences,
  onUseImageAsReference,
  onDeleteImageAsset,
  onClearImageLibrary,
}: ImageStudioPanelProps) {
  const { t } = useTranslation()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const isImageMode = activeMode !== PLAYGROUND_MODES.CHAT
  const hasReferences = references.length > 0
  const imageSizeValue = IMAGE_SIZE_OPTIONS.includes(
    config.imageSize as (typeof IMAGE_SIZE_OPTIONS)[number]
  )
    ? config.imageSize
    : IMAGE_SIZE_OPTIONS[0]

  const handleFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files || [])
      event.target.value = ''
      if (files.length === 0) return

      try {
        const dataUrls = await readImageFilesAsDataUrls(files)
        onAddReferences(dataUrls)
        toast.success(t('Reference image added'))
      } catch {
        toast.warning(t('Please select image files'))
      }
    },
    [onAddReferences, t]
  )

  const handleModeChange = useCallback(
    (value: string[]) => {
      const next = value.find((item) => item !== activeMode) as
        | PlaygroundMode
        | undefined
      if (next) onModeChange(next)
    },
    [activeMode, onModeChange]
  )

  return (
    <aside className='bg-background/95 flex h-full min-h-0 w-full flex-col border-l xl:w-[340px]'>
      <div className='flex items-center justify-between gap-3 border-b px-4 py-3'>
        <div className='min-w-0'>
          <p className='text-sm font-medium'>{t('Image studio')}</p>
          <p className='text-muted-foreground truncate text-xs'>
            {t('Prompt, references, output size, and local image library')}
          </p>
        </div>
      </div>

      <div className='flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4'>
        <section className='flex flex-col gap-2'>
          <p className='text-sm font-medium'>{t('Creative mode')}</p>
          <ToggleGroup
            value={[activeMode]}
            onValueChange={handleModeChange}
            aria-label={t('Creative mode')}
            variant='outline'
            size='sm'
            spacing={1}
            className='grid w-full grid-cols-3'
          >
            {modeItems.map((item) => {
              const Icon = item.icon
              return (
                <ToggleGroupItem
                  key={item.key}
                  value={item.key}
                  className={cn(
                    'h-auto min-w-0 flex-col gap-1 px-2 py-2 text-xs',
                    activeMode === item.key && 'bg-muted'
                  )}
                >
                  <Icon />
                  <span className='truncate'>{t(item.label)}</span>
                </ToggleGroupItem>
              )
            })}
          </ToggleGroup>
        </section>

        <Separator />

        <section className='flex flex-col gap-3'>
          <div className='flex items-center justify-between gap-2'>
            <p className='text-sm font-medium'>{t('Output settings')}</p>
            <p className='text-muted-foreground text-xs'>
              {isImageMode
                ? t('Image requests use these settings')
                : t('Chat keeps image settings idle')}
            </p>
          </div>
          <ModelGroupSelector
            selectedModel={config.model}
            models={models}
            onModelChange={(value) => onConfigChange('model', value)}
            selectedGroup={config.group}
            groups={groups}
            onGroupChange={(value) => onConfigChange('group', value)}
            disabled={isModelLoading || models.length === 0 || groups.length === 0}
            className='justify-start'
          />
          <div className='grid grid-cols-3 gap-2'>
            <Select
              items={IMAGE_SIZE_OPTIONS.map((value) => ({
                value,
                label: value,
              }))}
              value={imageSizeValue}
              onValueChange={(value) => {
                if (!value) return
                onConfigChange('imageSize', value)
              }}
            >
              <SelectTrigger className='w-full'>
                <SelectValue placeholder={t('Image size')} />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                <SelectGroup>
                  {IMAGE_SIZE_OPTIONS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Select
              items={IMAGE_COUNT_OPTIONS.map((value) => ({
                value: String(value),
                label: String(value),
              }))}
              value={String(config.imageCount)}
              onValueChange={(value) =>
                value && onConfigChange('imageCount', Number(value))
              }
            >
              <SelectTrigger className='w-full'>
                <SelectValue placeholder={t('Image count')} />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                <SelectGroup>
                  {IMAGE_COUNT_OPTIONS.map((value) => (
                    <SelectItem key={value} value={String(value)}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Select
              items={IMAGE_QUALITY_OPTIONS.map((value) => ({
                value,
                label: value,
              }))}
              value={config.imageQuality}
              onValueChange={(value) =>
                value && onConfigChange('imageQuality', value)
              }
            >
              <SelectTrigger className='w-full'>
                <SelectValue placeholder={t('Image quality')} />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                <SelectGroup>
                  {IMAGE_QUALITY_OPTIONS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        </section>

        <Separator />

        <section className='flex flex-col gap-3'>
          <div className='flex items-center justify-between gap-2'>
            <p className='text-sm font-medium'>{t('Reference images')}</p>
            <div className='flex items-center gap-1'>
              <input
                ref={fileInputRef}
                type='file'
                accept='image/*'
                multiple
                className='hidden'
                onChange={handleFileChange}
              />
              <Button
                aria-label={t('Upload reference images')}
                title={t('Upload reference images')}
                size='icon-sm'
                variant='ghost'
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload />
              </Button>
              {hasReferences && (
                <Button
                  aria-label={t('Clear references')}
                  title={t('Clear references')}
                  size='icon-sm'
                  variant='ghost'
                  onClick={onClearReferences}
                >
                  <Trash2 />
                </Button>
              )}
            </div>
          </div>
          {hasReferences ? (
            <div className='grid grid-cols-3 gap-2'>
              {references.map((url, index) => (
                <div
                  key={`${url}-${index}`}
                  className='group relative aspect-square overflow-hidden rounded-lg border'
                >
                  <img
                    src={url}
                    alt={t('Reference image')}
                    className='size-full object-cover'
                  />
                  <Button
                    aria-label={t('Delete image')}
                    title={t('Delete image')}
                    size='icon-xs'
                    variant='secondary'
                    className='absolute top-1 right-1 opacity-0 group-hover:opacity-100'
                    onClick={() => onRemoveReference(index)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <Empty className='min-h-28 rounded-lg border p-4'>
              <EmptyHeader>
                <EmptyMedia variant='icon'>
                  <ImageIcon />
                </EmptyMedia>
                <EmptyDescription className='text-xs'>
                  {activeMode === PLAYGROUND_MODES.IMAGE_EDIT
                    ? t('Image-to-image needs at least one reference image.')
                    : t(
                        'Optional: upload references to switch into image-to-image.'
                      )}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </section>

        <Separator />

        <section className='flex flex-col gap-3'>
          <div className='flex items-center justify-between gap-2'>
            <p className='text-sm font-medium'>{t('Output canvas')}</p>
            <p className='text-muted-foreground text-xs'>
              {latestImages.length > 0
                ? t('{{count}} result images', { count: latestImages.length })
                : t('Waiting for generation')}
            </p>
          </div>
          {latestImages.length > 0 ? (
            <div className='grid grid-cols-2 gap-2'>
              {latestImages.map((asset) => (
                <ImageAssetTile
                  key={asset.id}
                  asset={asset}
                  onUseAsReference={onUseImageAsReference}
                />
              ))}
            </div>
          ) : (
            <Empty className='min-h-36 rounded-lg border p-4'>
              <EmptyHeader>
                <EmptyMedia variant='icon'>
                  <ImageIcon />
                </EmptyMedia>
                <EmptyTitle>{t('No images yet')}</EmptyTitle>
                <EmptyDescription className='text-xs'>
                  {t(
                    'Generated images will appear here after you submit a prompt in image mode.'
                  )}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </section>

        <Separator />

        <section className='flex flex-col gap-3'>
          <div className='flex items-center justify-between gap-2'>
            <p className='text-sm font-medium'>{t('Local image library')}</p>
            {imageLibrary.length > 0 && (
              <Button size='sm' variant='ghost' onClick={onClearImageLibrary}>
                <Trash2 data-icon='inline-start' />
                {t('Clear')}
              </Button>
            )}
          </div>
          {imageLibrary.length > 0 ? (
            <div className='grid grid-cols-2 gap-2'>
              {imageLibrary.slice(0, 12).map((asset) => (
                <ImageAssetTile
                  key={asset.id}
                  asset={asset}
                  onUseAsReference={onUseImageAsReference}
                  onDelete={onDeleteImageAsset}
                />
              ))}
            </div>
          ) : (
            <Card size='sm' className='rounded-lg'>
              <CardHeader>
                <CardTitle className='text-sm'>
                  {t('Generated images are saved in this browser.')}
                </CardTitle>
              </CardHeader>
            </Card>
          )}
        </section>
      </div>
    </aside>
  )
}
