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
  useCallback,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
} from 'react'
import {
  PaperclipIcon,
  FileIcon,
  ImageIcon,
  ImagesIcon,
  MessageSquareIcon,
  ScreenShareIcon,
  CameraIcon,
  GlobeIcon,
  SendIcon,
  SquareIcon,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  PromptInput,
  PromptInputButton,
  PromptInputFooter,
  PromptInputTextarea,
  PromptInputTools,
  type PromptInputMessage,
} from '@/components/ai-elements/prompt-input'
import { ModelGroupSelector } from '@/components/model-group-selector'
import { IMAGE_SIZE_OPTIONS, PLAYGROUND_MODES } from '../constants'
import { readImageFilesAsDataUrls } from '../lib'
import type { ModelOption, GroupOption, PlaygroundMode } from '../types'

interface PlaygroundInputProps {
  onSubmit: (text: string) => void
  onStop?: () => void
  disabled?: boolean
  isGenerating?: boolean
  models: ModelOption[]
  modelValue: string
  onModelChange: (value: string) => void
  isModelLoading?: boolean
  groups: GroupOption[]
  groupValue: string
  onGroupChange: (value: string) => void
  activeMode: PlaygroundMode
  onModeChange: (mode: PlaygroundMode) => void
  onAddReferences: (urls: string[]) => void
  referenceCount: number
  onClearReferences: () => void
  imageSize: string
  onImageSizeChange: (value: string) => void
  stream: boolean
  onStreamChange: (value: boolean) => void
}

const modeItems = [
  { key: PLAYGROUND_MODES.CHAT, label: 'Chat', icon: MessageSquareIcon },
  { key: PLAYGROUND_MODES.IMAGE, label: 'Image', icon: ImageIcon },
  { key: PLAYGROUND_MODES.IMAGE_EDIT, label: 'Edit image', icon: ImagesIcon },
] as const

export function PlaygroundInput({
  onSubmit,
  onStop,
  disabled,
  isGenerating,
  models,
  modelValue,
  onModelChange,
  isModelLoading = false,
  groups,
  groupValue,
  onGroupChange,
  activeMode,
  onModeChange,
  onAddReferences,
  referenceCount,
  onClearReferences,
  imageSize,
  onImageSizeChange,
  stream,
  onStreamChange,
}: PlaygroundInputProps) {
  const { t } = useTranslation()
  const [text, setText] = useState('')
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const isModelSelectDisabled =
    disabled || isModelLoading || models.length === 0
  const isGroupSelectDisabled = disabled || groups.length === 0
  const isImageMode = activeMode !== PLAYGROUND_MODES.CHAT
  const imageSizeValue = IMAGE_SIZE_OPTIONS.includes(
    imageSize as (typeof IMAGE_SIZE_OPTIONS)[number]
  )
    ? imageSize
    : IMAGE_SIZE_OPTIONS[0]

  const handleSubmit = (message: PromptInputMessage) => {
    if (!message.text?.trim() || disabled) return
    onSubmit(message.text)
    setText('')
  }

  const handleFileAction = (action: string) => {
    if (action === 'upload-photo') {
      fileInputRef.current?.click()
      return
    }

    toast.info(t('Feature in development'), {
      description: action,
    })
  }

  const addImageFiles = useCallback(
    async (files: File[]) => {
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

  const handleFileChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files || [])
      event.target.value = ''
      void addImageFiles(files)
    },
    [addImageFiles]
  )

  const handlePaste = useCallback(
    (event: ClipboardEvent<HTMLTextAreaElement>) => {
      const files = Array.from(event.clipboardData.files || []).filter((file) =>
        file.type.startsWith('image/')
      )
      if (files.length === 0) return

      event.preventDefault()
      void addImageFiles(files)
    },
    [addImageFiles]
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
    <div className='grid shrink-0 gap-4 px-1 md:pb-4'>
      <input
        ref={fileInputRef}
        type='file'
        accept='image/*'
        multiple
        className='hidden'
        onChange={handleFileChange}
      />
      <PromptInput groupClassName='rounded-xl' onSubmit={handleSubmit}>
        <PromptInputTextarea
          autoComplete='off'
          autoCorrect='off'
          autoCapitalize='off'
          spellCheck={false}
          className='px-5 md:text-base'
          disabled={disabled}
          onChange={(event) => setText(event.target.value)}
          onPaste={handlePaste}
          placeholder={t('Ask anything')}
          value={text}
        />

        <PromptInputFooter className='p-2.5'>
          <PromptInputTools>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <PromptInputButton
                    className='border font-medium'
                    disabled={disabled}
                    variant='outline'
                  />
                }
              >
                <PaperclipIcon size={16} />
                <span className='hidden sm:inline'>{t('Attach')}</span>
                <span className='sr-only sm:hidden'>{t('Attach')}</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align='start'>
                <DropdownMenuItem
                  onClick={() => handleFileAction('upload-file')}
                >
                  <FileIcon className='mr-2' size={16} />
                  {t('Upload file')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleFileAction('upload-photo')}
                >
                  <ImageIcon className='mr-2' size={16} />
                  {t('Upload photo')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleFileAction('take-screenshot')}
                >
                  <ScreenShareIcon className='mr-2' size={16} />
                  {t('Take screenshot')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleFileAction('take-photo')}
                >
                  <CameraIcon className='mr-2' size={16} />
                  {t('Take photo')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <PromptInputButton
              className='border font-medium'
              disabled={disabled}
              onClick={() => toast.info(t('Search feature in development'))}
              variant='outline'
            >
              <GlobeIcon size={16} />
              <span className='hidden sm:inline'>{t('Search')}</span>
              <span className='sr-only sm:hidden'>{t('Search')}</span>
            </PromptInputButton>

            <ToggleGroup
              value={[activeMode]}
              onValueChange={handleModeChange}
              aria-label={t('Creative mode')}
              variant='outline'
              size='sm'
              spacing={1}
              className='hidden sm:flex'
            >
              {modeItems.map((item) => {
                const Icon = item.icon
                return (
                  <ToggleGroupItem
                    key={item.key}
                    value={item.key}
                    className='gap-1 px-2 text-xs'
                  >
                    <Icon size={14} />
                    {t(item.label)}
                  </ToggleGroupItem>
                )
              })}
            </ToggleGroup>

            {referenceCount > 0 && (
              <button
                type='button'
                className='focus-visible:ring-ring flex items-center rounded-md outline-none focus-visible:ring-2'
                onClick={onClearReferences}
                title={t('Clear references')}
              >
                <Badge variant='secondary'>
                  {t('{{count}} references', { count: referenceCount })}
                </Badge>
              </button>
            )}
          </PromptInputTools>

          <div className='flex items-center gap-1.5 md:gap-2'>
            <ModelGroupSelector
              selectedModel={modelValue}
              models={models}
              onModelChange={onModelChange}
              selectedGroup={groupValue}
              groups={groups}
              onGroupChange={onGroupChange}
              disabled={isModelSelectDisabled || isGroupSelectDisabled}
            />

            {activeMode === PLAYGROUND_MODES.CHAT && (
              <label className='border-input bg-background flex h-8 items-center gap-2 rounded-md border px-2.5 text-xs font-medium'>
                <span className='text-muted-foreground hidden whitespace-nowrap md:inline'>
                  {t('Streaming')}
                </span>
                <Switch
                  size='sm'
                  aria-label={t('Streaming')}
                  checked={stream}
                  disabled={disabled}
                  onCheckedChange={onStreamChange}
                />
              </label>
            )}

            {isGenerating && onStop ? (
              <PromptInputButton
                className='text-foreground font-medium'
                onClick={onStop}
                variant='secondary'
              >
                <SquareIcon className='fill-current' size={16} />
                <span className='hidden sm:inline'>{t('Stop')}</span>
                <span className='sr-only sm:hidden'>{t('Stop')}</span>
              </PromptInputButton>
            ) : (
              <PromptInputButton
                className='text-foreground font-medium'
                disabled={disabled || !text.trim()}
                type='submit'
                variant='secondary'
              >
                <SendIcon size={16} />
                <span className='hidden sm:inline'>
                  {activeMode === PLAYGROUND_MODES.CHAT
                    ? t('Send')
                    : t('Generate')}
                </span>
                <span className='sr-only sm:hidden'>
                  {activeMode === PLAYGROUND_MODES.CHAT
                    ? t('Send')
                    : t('Generate')}
                </span>
              </PromptInputButton>
            )}
          </div>
        </PromptInputFooter>
      </PromptInput>

      {isImageMode && (
        <div className='bg-background flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2'>
          <span className='text-muted-foreground text-xs font-medium'>
            {t('Image size')}
          </span>
          <Select
            items={IMAGE_SIZE_OPTIONS.map((value) => ({ value, label: value }))}
            value={imageSizeValue}
            disabled={disabled}
            onValueChange={(value) => {
              if (!value) return
              onImageSizeChange(value)
            }}
          >
            <SelectTrigger className='h-8 w-36'>
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
        </div>
      )}

    </div>
  )
}
