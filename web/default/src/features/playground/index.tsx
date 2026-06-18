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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  ImageIcon,
  ImagesIcon,
  MessageSquareIcon,
  Plus,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { PLAYGROUND_MODES } from './constants'
import { getUserModels, getUserGroups, sendImageGeneration } from './api'
import { ImageStudioPanel } from './components/image-studio-panel'
import { PlaygroundChat } from './components/playground-chat'
import { PlaygroundInput } from './components/playground-input'
import { usePlaygroundState, useChatHandler } from './hooks'
import {
  createAssistantMessage,
  createImageAssets,
  createLoadingAssistantMessage,
  createUserMessageWithImages,
  extractGeneratedImageUrls,
  normalizeImageSizeInput,
  loadConversations,
  loadActiveConversationId,
  loadImageLibrary,
  saveMessages,
  saveConversations,
  saveActiveConversationId,
  saveImageLibrary,
  validateImageSize,
} from './lib'
import type {
  ImageAsset,
  Message as MessageType,
  PlaygroundConversation,
  PlaygroundMode,
} from './types'

type ConfirmAction = {
  title: string
  description: string
  actionLabel: string
  onConfirm: () => void
}

type MessageUpdater = MessageType[] | ((prev: MessageType[]) => MessageType[])

const modeMeta: Record<
  PlaygroundMode,
  { label: string; icon: typeof MessageSquareIcon }
> = {
  [PLAYGROUND_MODES.CHAT]: {
    label: 'Chat',
    icon: MessageSquareIcon,
  },
  [PLAYGROUND_MODES.IMAGE]: {
    label: 'Generate image',
    icon: ImageIcon,
  },
  [PLAYGROUND_MODES.IMAGE_EDIT]: {
    label: 'Image to image',
    icon: ImagesIcon,
  },
}

function getMessagePlainText(message?: MessageType): string {
  return message?.versions?.[0]?.content?.trim() || ''
}

function getConversationTitle(
  messages: MessageType[],
  fallback: string
): string {
  const firstUserMessage = messages.find(
    (message) => message.from === 'user' && getMessagePlainText(message)
  )
  const text = getMessagePlainText(firstUserMessage)
  if (!text) return fallback
  return text.length > 28 ? `${text.slice(0, 28)}...` : text
}

function getConversationPreview(messages: MessageType[]): string {
  const lastMessage = [...messages]
    .reverse()
    .find((message) => getMessagePlainText(message))
  const text = getMessagePlainText(lastMessage)
  if (!text) return ''
  return text.length > 44 ? `${text.slice(0, 44)}...` : text
}

function createConversation(
  messages: MessageType[],
  mode: PlaygroundMode,
  fallbackTitle: string
): PlaygroundConversation {
  const now = Date.now()
  return {
    id: `pg-${now}-${Math.random().toString(36).slice(2, 8)}`,
    title: getConversationTitle(messages, fallbackTitle),
    preview: getConversationPreview(messages),
    mode,
    messages,
    updatedAt: now,
  }
}

export function Playground() {
  const { t } = useTranslation()
  const {
    config,
    parameterEnabled,
    messages,
    models,
    groups,
    updateMessages,
    setModels,
    setGroups,
    updateConfig,
  } = usePlaygroundState()
  const [activeMode, setActiveMode] = useState<PlaygroundMode>(
    PLAYGROUND_MODES.CHAT
  )
  const [conversations, setConversations] = useState<PlaygroundConversation[]>(
    () => loadConversations()
  )
  const [activeConversationId, setActiveConversationId] = useState(() => {
    const saved = loadConversations()
    const savedActiveId = loadActiveConversationId()
    return (
      saved.find((conversation) => conversation.id === savedActiveId)?.id ||
      saved[0]?.id ||
      ''
    )
  })
  const [imageLibrary, setImageLibrary] =
    useState<ImageAsset[]>(loadImageLibrary)
  const [isImageGenerating, setIsImageGenerating] = useState(false)
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(
    null
  )
  const hasHydratedConversation = useRef(false)
  const skipNextConversationPersist = useRef(false)
  const messagesRef = useRef<MessageType[]>(messages)
  const activeConversationIdRef = useRef(activeConversationId)
  const activeModeRef = useRef(activeMode)
  const deferredPersistTimerRef = useRef<number | null>(null)

  // Edit dialog state
  const [editingMessageKey, setEditingMessageKey] = useState<string | null>(
    null
  )
  const validImageUrls = useMemo(
    () => (config.imageUrls || []).filter((url) => url.trim() !== ''),
    [config.imageUrls]
  )
  const latestImages = useMemo(() => {
    const messageWithImages = [...messages]
      .reverse()
      .find((message) => message.generatedImages?.length)
    return messageWithImages?.generatedImages?.slice(0, 6) || []
  }, [messages])

  messagesRef.current = messages
  activeConversationIdRef.current = activeConversationId
  activeModeRef.current = activeMode

  useEffect(
    () => () => {
      if (deferredPersistTimerRef.current !== null) {
        window.clearTimeout(deferredPersistTimerRef.current)
      }
    },
    []
  )

  const syncActiveConversation = useCallback(
    (
      nextMessages: MessageType[],
      options: { promote?: boolean; conversationId?: string } = {}
    ) => {
      const conversationId =
        options.conversationId ?? activeConversationIdRef.current
      if (!conversationId) return

      const mode = activeModeRef.current
      const promote = options.promote ?? true

      const syncConversations = (prev: PlaygroundConversation[]) => {
        const existingIndex = prev.findIndex(
          (conversation) => conversation.id === conversationId
        )
        const nextMode =
          conversationId === activeConversationIdRef.current
            ? activeModeRef.current
            : prev[existingIndex]?.mode || mode
        const updatedConversation: PlaygroundConversation = {
          ...(existingIndex >= 0
            ? prev[existingIndex]
            : createConversation([], mode, t('New chat'))),
          id: conversationId,
          title: getConversationTitle(nextMessages, t('New chat')),
          preview: getConversationPreview(nextMessages),
          mode: nextMode,
          messages: nextMessages,
          updatedAt: Date.now(),
        }

        if (existingIndex < 0) {
          return [updatedConversation, ...prev]
        }

        const next = [...prev]
        next[existingIndex] = updatedConversation
        if (!promote) {
          return next
        }

        return [
          updatedConversation,
          ...next.slice(0, existingIndex),
          ...next.slice(existingIndex + 1),
        ]
      }

      const persisted = saveConversations(syncConversations(loadConversations()))
      setConversations(persisted)
    },
    [t]
  )

  const updatePlaygroundMessages = useCallback(
    (
      updater: MessageUpdater,
      options: {
        promote?: boolean
        conversationId?: string
        persist?: boolean
      } = {}
    ) => {
      const nextMessages =
        typeof updater === 'function'
          ? updater(
              (options.conversationId &&
              options.conversationId !== activeConversationIdRef.current
                ? loadConversations().find(
                    (conversation) => conversation.id === options.conversationId
                  )?.messages
                : messagesRef.current) || []
            )
          : updater
      const targetConversationId =
        options.conversationId ?? activeConversationIdRef.current
      const isActiveConversation =
        !targetConversationId ||
        targetConversationId === activeConversationIdRef.current

      if (isActiveConversation) {
        messagesRef.current = nextMessages
      }
      if (options.persist ?? true) {
        if (deferredPersistTimerRef.current !== null) {
          window.clearTimeout(deferredPersistTimerRef.current)
          deferredPersistTimerRef.current = null
        }
        if (isActiveConversation) {
          saveMessages(nextMessages)
        }
        syncActiveConversation(nextMessages, {
          ...options,
          conversationId: targetConversationId,
        })
      } else {
        syncActiveConversation(nextMessages, {
          ...options,
          conversationId: targetConversationId,
          promote: false,
        })
      }
      if (isActiveConversation) {
        skipNextConversationPersist.current = true
        updateMessages(nextMessages, { persist: false })
      }
    },
    [syncActiveConversation, updateMessages]
  )

  const { sendChat, stopGeneration, isGenerating } = useChatHandler({
    config,
    parameterEnabled,
    onMessageUpdate: updatePlaygroundMessages,
  })
  const isBusy = isGenerating || isImageGenerating

  useEffect(() => {
    if (hasHydratedConversation.current) return
    hasHydratedConversation.current = true

    const current = conversations.find(
      (conversation) => conversation.id === activeConversationId
    )
    if (current) {
      skipNextConversationPersist.current = true
      messagesRef.current = current.messages || []
      activeModeRef.current = current.mode || PLAYGROUND_MODES.CHAT
      updateMessages(current.messages || [])
      setActiveMode(current.mode || PLAYGROUND_MODES.CHAT)
      return
    }

    if (messages.length === 0) return

    const initialConversation = createConversation(
      messages,
      activeMode,
      t('New chat')
    )
    setActiveConversationId(initialConversation.id)
    saveActiveConversationId(initialConversation.id)
    setConversations((prev) =>
      saveConversations([initialConversation, ...prev])
    )
  }, [
    activeConversationId,
    activeMode,
    conversations,
    messages,
    t,
    updateMessages,
  ])

  useEffect(() => {
    if (!hasHydratedConversation.current || !activeConversationId) return
    if (skipNextConversationPersist.current) {
      skipNextConversationPersist.current = false
      return
    }

    setConversations((prev) => {
      const existingIndex = prev.findIndex(
        (conversation) => conversation.id === activeConversationId
      )
      const updatedConversation: PlaygroundConversation = {
        ...(existingIndex >= 0
          ? prev[existingIndex]
          : createConversation([], activeMode, t('New chat'))),
        id: activeConversationId,
        title: getConversationTitle(messages, t('New chat')),
        preview: getConversationPreview(messages),
        mode: activeMode,
        messages,
        updatedAt: Date.now(),
      }

      if (existingIndex < 0) {
        return saveConversations([updatedConversation, ...prev])
      }

      const next = [...prev]
      next[existingIndex] = updatedConversation
      return saveConversations(next)
    })
  }, [activeConversationId, activeMode, messages, t])

  // Load models
  const { data: modelsData, isLoading: isLoadingModels } = useQuery({
    queryKey: ['playground-models'],
    queryFn: async () => {
      try {
        return await getUserModels()
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : t('Failed to load playground models')
        )
        return []
      }
    },
  })

  // Load groups
  const { data: groupsData } = useQuery({
    queryKey: ['playground-groups'],
    queryFn: async () => {
      try {
        return await getUserGroups()
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : t('Failed to load playground groups')
        )
        return []
      }
    },
  })

  // Update models when data changes
  useEffect(() => {
    if (!modelsData) return

    setModels(modelsData)

    // Set default model if current model is not available
    const isCurrentModelValid = modelsData.some((m) => m.value === config.model)
    if (modelsData.length > 0 && !isCurrentModelValid) {
      updateConfig('model', modelsData[0].value)
    }
  }, [modelsData, config.model, setModels, updateConfig])

  // Update groups when data changes
  useEffect(() => {
    if (!groupsData) return

    setGroups(groupsData)

    const hasCurrentGroup = groupsData.some((g) => g.value === config.group)
    if (!hasCurrentGroup && groupsData.length > 0) {
      const fallback =
        groupsData.find((g) => g.value === 'default')?.value ??
        groupsData[0].value
      updateConfig('group', fallback)
    }
  }, [groupsData, setGroups, config.group, updateConfig])

  const replaceLoadingMessage = useCallback(
    (
      loadingKey: string,
      nextMessage: MessageType,
      conversationId?: string
    ) => {
      updatePlaygroundMessages(
        (prev) =>
          prev.map((message) =>
            message.key === loadingKey ? nextMessage : message
          ),
        { conversationId }
      )
    },
    [updatePlaygroundMessages]
  )

  const handleModeChange = useCallback((mode: PlaygroundMode) => {
    setActiveMode(mode)
  }, [])

  const handleAddReferences = useCallback(
    (urls: string[]) => {
      const nextUrls = [...validImageUrls, ...urls].filter(Boolean)
      updateConfig('imageUrls', nextUrls)
      if (nextUrls.length > 0) {
        setActiveMode(PLAYGROUND_MODES.IMAGE_EDIT)
      }
    },
    [updateConfig, validImageUrls]
  )

  const handleRemoveReference = useCallback(
    (index: number) => {
      const nextUrls = validImageUrls.filter((_, itemIndex) => itemIndex !== index)
      updateConfig('imageUrls', nextUrls)
    },
    [updateConfig, validImageUrls]
  )

  const handleClearReferences = useCallback(() => {
    updateConfig('imageUrls', [])
  }, [updateConfig])

  const handleUseImageAsReference = useCallback(
    (url: string) => {
      const nextUrls = validImageUrls.includes(url)
        ? validImageUrls
        : [url, ...validImageUrls]
      updateConfig('imageUrls', nextUrls)
      setActiveMode(PLAYGROUND_MODES.IMAGE_EDIT)
      toast.success(t('Added to image-to-image references'))
    },
    [t, updateConfig, validImageUrls]
  )

  const handleDeleteImageAsset = useCallback((assetId: string) => {
    setImageLibrary((prev) =>
      saveImageLibrary(prev.filter((asset) => asset.id !== assetId))
    )
  }, [])

  const handleClearImageLibrary = useCallback(() => {
    setConfirmAction({
      title: t('Clear local image library?'),
      description: t('This action cannot be undone.'),
      actionLabel: t('Clear'),
      onConfirm: () => setImageLibrary(saveImageLibrary([])),
    })
  }, [t])

  const ensureConversation = useCallback(
    (mode: PlaygroundMode, nextMessages: MessageType[] = []) => {
      if (activeConversationId) return activeConversationId

      const nextConversation = createConversation(
        nextMessages,
        mode,
        t('New chat')
      )
      activeConversationIdRef.current = nextConversation.id
      activeModeRef.current = mode
      saveActiveConversationId(nextConversation.id)
      setActiveConversationId(nextConversation.id)
      setConversations((prev) => saveConversations([nextConversation, ...prev]))
      return nextConversation.id
    },
    [activeConversationId, t]
  )

  const sendImageRequest = useCallback(
    async (text: string) => {
      const prompt = text.trim()
      const requestMode =
        validImageUrls.length > 0
          ? PLAYGROUND_MODES.IMAGE_EDIT
          : activeMode === PLAYGROUND_MODES.IMAGE_EDIT
            ? PLAYGROUND_MODES.IMAGE_EDIT
            : PLAYGROUND_MODES.IMAGE
      if (!prompt) {
        toast.warning(t('Please enter a prompt first'))
        return
      }
      if (
        requestMode === PLAYGROUND_MODES.IMAGE_EDIT &&
        validImageUrls.length === 0
      ) {
        toast.warning(t('Please upload a reference image first'))
        return
      }

      const requestedImageSize = normalizeImageSizeInput(config.imageSize)
      const sizeValidation = validateImageSize(requestedImageSize)
      if (!sizeValidation.valid) {
        toast.warning(
          `${t('Image size')}: ${t(sizeValidation.reason || 'Invalid image size.')}`
        )
        return
      }

      const userMessage = createUserMessageWithImages(
        prompt,
        requestMode === PLAYGROUND_MODES.IMAGE_EDIT ? validImageUrls : []
      )
      const loadingMessage = createLoadingAssistantMessage()
      const nextMessages = [...messages, userMessage, loadingMessage]
      const conversationId = ensureConversation(requestMode, nextMessages)
      const payload = {
        model: config.model,
        group: config.group,
        prompt,
        n: Math.max(1, Math.min(Number(config.imageCount) || 1, 10)),
        size: sizeValidation.normalized,
        quality: config.imageQuality || 'auto',
        response_format: 'url' as const,
        ...(requestMode === PLAYGROUND_MODES.IMAGE_EDIT
          ? {
              image: validImageUrls[0],
              images: validImageUrls,
            }
          : {}),
      }

      updatePlaygroundMessages(nextMessages, { conversationId })
      setIsImageGenerating(true)

      try {
        const response = await sendImageGeneration(payload, requestMode)
        const generatedImages = extractGeneratedImageUrls(response)
        if (generatedImages.length === 0) {
          throw new Error(t('No images returned'))
        }

        const generatedAssets = createImageAssets({
          urls: generatedImages,
          prompt,
          mode: requestMode,
          model: config.model,
          group: config.group,
          size: payload.size,
          quality: payload.quality,
          conversationId,
        })
        setImageLibrary((prev) =>
          saveImageLibrary([...generatedAssets, ...prev])
        )

        replaceLoadingMessage(
          loadingMessage.key,
          createAssistantMessage('', {
            status: 'complete',
            generatedImages: generatedAssets,
          }),
          conversationId
        )
      } catch (error: unknown) {
        const err = error as {
          response?: {
            data?: { error?: { message?: string }; message?: string }
          }
          message?: string
        }
        const message =
          err.response?.data?.error?.message ||
          err.response?.data?.message ||
          err.message ||
          t('Image generation failed')
        replaceLoadingMessage(
          loadingMessage.key,
          createAssistantMessage(`${t('Image generation failed')}: ${message}`, {
            status: 'error',
            errorCode: null,
          }),
          conversationId
        )
      } finally {
        setIsImageGenerating(false)
      }
    },
    [
      activeMode,
      config.group,
      config.imageCount,
      config.imageQuality,
      config.imageSize,
      config.model,
      ensureConversation,
      messages,
      replaceLoadingMessage,
      t,
      updatePlaygroundMessages,
      validImageUrls,
    ]
  )

  const handleSendMessage = (text: string) => {
    if (
      activeMode === PLAYGROUND_MODES.IMAGE ||
      activeMode === PLAYGROUND_MODES.IMAGE_EDIT ||
      validImageUrls.length > 0
    ) {
      void sendImageRequest(text)
      return
    }

    const userMessage = createUserMessageWithImages(text, validImageUrls)
    const assistantMessage = createLoadingAssistantMessage()

    const newMessages = [...messages, userMessage, assistantMessage]
    const conversationId = ensureConversation(activeMode, newMessages)
    updatePlaygroundMessages(newMessages, { conversationId })

    // Send chat request
    sendChat(newMessages, { conversationId })
  }

  const handleNewChat = useCallback(() => {
    const nextConversation = createConversation(
      [],
      PLAYGROUND_MODES.CHAT,
      t('New chat')
    )
    setConversations((prev) => saveConversations([nextConversation, ...prev]))
    activeConversationIdRef.current = nextConversation.id
    activeModeRef.current = PLAYGROUND_MODES.CHAT
    messagesRef.current = []
    saveActiveConversationId(nextConversation.id)
    setActiveConversationId(nextConversation.id)
    setActiveMode(PLAYGROUND_MODES.CHAT)
    updateMessages([])
    updateConfig('imageUrls', [])
  }, [t, updateConfig, updateMessages])

  const handleSelectConversation = useCallback(
    (conversation: PlaygroundConversation) => {
      skipNextConversationPersist.current = true
      activeConversationIdRef.current = conversation.id
      activeModeRef.current = conversation.mode || PLAYGROUND_MODES.CHAT
      messagesRef.current = conversation.messages || []
      saveActiveConversationId(conversation.id)
      setActiveConversationId(conversation.id)
      setActiveMode(conversation.mode || PLAYGROUND_MODES.CHAT)
      updateMessages(conversation.messages || [])
      setEditingMessageKey(null)
    },
    [updateMessages]
  )

  const handleDeleteConversation = useCallback(
    (conversationId: string) => {
      setConfirmAction({
        title: t('Delete this conversation?'),
        description: t('This action cannot be undone.'),
        actionLabel: t('Delete'),
        onConfirm: () => {
          setConversations((prev) => {
            const next = prev.filter(
              (conversation) => conversation.id !== conversationId
            )
            const persisted = saveConversations(next)

            if (persisted.length === 0) {
              setActiveConversationId('')
              activeConversationIdRef.current = ''
              activeModeRef.current = PLAYGROUND_MODES.CHAT
              messagesRef.current = []
              saveActiveConversationId('')
              setActiveMode(PLAYGROUND_MODES.CHAT)
              updateMessages([])
              updateConfig('imageUrls', [])
              return persisted
            }

            if (conversationId === activeConversationId) {
              const fallback = persisted[0]
              skipNextConversationPersist.current = true
              activeConversationIdRef.current = fallback.id
              activeModeRef.current = fallback.mode || PLAYGROUND_MODES.CHAT
              messagesRef.current = fallback.messages || []
              saveActiveConversationId(fallback.id)
              setActiveConversationId(fallback.id)
              setActiveMode(fallback.mode || PLAYGROUND_MODES.CHAT)
              updateMessages(fallback.messages || [])
            }
            return persisted
          })
        },
      })
    },
    [activeConversationId, t, updateConfig, updateMessages]
  )

  const handleClearAllConversations = useCallback(() => {
    setConfirmAction({
      title: t('Clear all Playground conversations?'),
      description: t('This action cannot be undone.'),
      actionLabel: t('Clear'),
      onConfirm: () => {
        if (deferredPersistTimerRef.current !== null) {
          window.clearTimeout(deferredPersistTimerRef.current)
          deferredPersistTimerRef.current = null
        }
        messagesRef.current = []
        activeConversationIdRef.current = ''
        activeModeRef.current = PLAYGROUND_MODES.CHAT
        saveActiveConversationId('')
        saveMessages([])
        saveConversations([])
        setConversations([])
        setActiveConversationId('')
        setActiveMode(PLAYGROUND_MODES.CHAT)
        updateMessages([], { persist: false })
        updateConfig('imageUrls', [])
      },
    })
  }, [t, updateConfig, updateMessages])

  const handleCopyMessage = (message: MessageType) => {
    // Copy is handled in MessageActions component
    // eslint-disable-next-line no-console
    console.log('Message copied:', message.key)
  }

  const handleRegenerateMessage = (message: MessageType) => {
    // Find the message index and regenerate from there
    const messageIndex = messages.findIndex((m) => m.key === message.key)
    if (messageIndex === -1) return

    // Remove messages after this one and regenerate
    const messagesUpToHere = messages.slice(0, messageIndex)
    const loadingMessage = createLoadingAssistantMessage()
    const newMessages = [...messagesUpToHere, loadingMessage]
    const conversationId = activeConversationIdRef.current

    updatePlaygroundMessages(newMessages, { conversationId })
    sendChat(newMessages, { conversationId })
  }

  const handleEditMessage = useCallback((message: MessageType) => {
    setEditingMessageKey(message.key)
  }, [])

  const handleEditOpenChange = useCallback((open: boolean) => {
    if (!open) setEditingMessageKey(null)
  }, [])

  // Apply edit and optionally re-submit from the edited user message
  const applyEdit = useCallback(
    (newContent: string, submit: boolean) => {
      if (!editingMessageKey) return
      const index = messages.findIndex((m) => m.key === editingMessageKey)
      if (index === -1) return

      const updated = messages.map((m) =>
        m.key === editingMessageKey
          ? { ...m, versions: [{ ...m.versions[0], content: newContent }] }
          : m
      )

      setEditingMessageKey(null)

      if (!submit || updated[index].from !== 'user') {
        updatePlaygroundMessages(updated)
        return
      }

      const toSubmit = [
        ...updated.slice(0, index + 1),
        createLoadingAssistantMessage(),
      ]
      const conversationId = activeConversationIdRef.current
      updatePlaygroundMessages(toSubmit, { conversationId })
      sendChat(toSubmit, { conversationId })
    },
    [editingMessageKey, messages, updatePlaygroundMessages, sendChat]
  )

  const handleDeleteMessage = (message: MessageType) => {
    const newMessages = messages.filter((m) => m.key !== message.key)
    updatePlaygroundMessages(newMessages)
  }

  return (
    <div className='bg-background relative flex size-full overflow-hidden'>
      <aside className='hidden w-[280px] shrink-0 flex-col border-r lg:flex'>
        <div className='flex items-center justify-between gap-3 border-b px-4 py-3'>
          <div className='min-w-0'>
            <p className='truncate text-sm font-medium'>
              {t('Conversation history')}
            </p>
            <p className='text-muted-foreground truncate text-xs'>
              {t('Saved locally')}
            </p>
          </div>
          <Button
            aria-label={t('New chat')}
            title={t('New chat')}
            size='icon-sm'
            variant='ghost'
            onClick={handleNewChat}
          >
            <Plus />
          </Button>
        </div>

        <div className='p-3'>
          <Button className='w-full justify-start' onClick={handleNewChat}>
            <Plus data-icon='inline-start' />
            {t('New chat')}
          </Button>
        </div>

        <div className='min-h-0 flex-1 overflow-y-auto px-2 pb-3'>
          {conversations.map((conversation) => {
            const selected = conversation.id === activeConversationId
            const ModeIcon =
              modeMeta[conversation.mode || PLAYGROUND_MODES.CHAT]?.icon ||
              MessageSquareIcon

            return (
              <div
                key={conversation.id}
                className={cn(
                  'group flex items-start gap-2 rounded-lg px-2 py-2',
                  selected ? 'bg-muted' : 'hover:bg-muted/60'
                )}
              >
                <button
                  type='button'
                  className='flex min-w-0 flex-1 items-start gap-2 text-left'
                  onClick={() => handleSelectConversation(conversation)}
                >
                  <ModeIcon className='text-muted-foreground mt-0.5 shrink-0' />
                  <span className='min-w-0 flex-1'>
                    <span className='block truncate text-sm font-medium'>
                      {conversation.title || t('New chat')}
                    </span>
                    <span className='text-muted-foreground block truncate text-xs'>
                      {conversation.preview || t('No messages yet')}
                    </span>
                  </span>
                </button>
                <Button
                  aria-label={t('Delete conversation')}
                  title={t('Delete conversation')}
                  size='icon-sm'
                  variant='ghost'
                  className='opacity-0 group-hover:opacity-100'
                  onClick={() => handleDeleteConversation(conversation.id)}
                >
                  <Trash2 />
                </Button>
              </div>
            )
          })}
        </div>

        <div className='border-t p-3'>
          <Button
            size='sm'
            variant='ghost'
            className='w-full justify-start'
            onClick={handleClearAllConversations}
          >
            <Trash2 data-icon='inline-start' />
            {t('Clear all conversations')}
          </Button>
        </div>
      </aside>

      <main className='flex min-w-0 flex-1 flex-col overflow-hidden'>
        <header className='flex min-h-12 items-center justify-between gap-3 border-b px-3 lg:hidden'>
          <div className='min-w-0'>
            <p className='truncate text-sm font-medium'>
              {conversations.find(
                (conversation) => conversation.id === activeConversationId
              )?.title || t('New chat')}
            </p>
            <p className='text-muted-foreground text-xs'>
              {t(modeMeta[activeMode].label)}
            </p>
          </div>
          <Button
            aria-label={t('New chat')}
            title={t('New chat')}
            size='icon-sm'
            variant='ghost'
            onClick={handleNewChat}
          >
            <Plus />
          </Button>
        </header>

        <div className='flex flex-1 flex-col overflow-hidden'>
          {/* Full-width scroll container: scrolling works even over side whitespace */}
          <div className='flex flex-1 flex-col overflow-hidden'>
            <PlaygroundChat
              messages={messages}
              onCopyMessage={handleCopyMessage}
              onRegenerateMessage={handleRegenerateMessage}
              onEditMessage={handleEditMessage}
              onDeleteMessage={handleDeleteMessage}
              isGenerating={isBusy}
              editingKey={editingMessageKey}
              onCancelEdit={handleEditOpenChange}
              onSaveEdit={(newContent) => applyEdit(newContent, false)}
              onSaveEditAndSubmit={(newContent) => applyEdit(newContent, true)}
            />
          </div>

          {/* Input area: center content and constrain to the same container width */}
          <div className='mx-auto w-full max-w-4xl'>
            <PlaygroundInput
              disabled={isBusy}
              groups={groups}
              groupValue={config.group}
              isGenerating={isGenerating}
              isModelLoading={isLoadingModels}
              modelValue={config.model}
              models={models}
              activeMode={activeMode}
              onGroupChange={(value) => updateConfig('group', value)}
              onModelChange={(value) => updateConfig('model', value)}
              onModeChange={handleModeChange}
              onAddReferences={handleAddReferences}
              referenceCount={validImageUrls.length}
              onClearReferences={handleClearReferences}
              imageSize={config.imageSize}
              onImageSizeChange={(value) => updateConfig('imageSize', value)}
              stream={config.stream}
              onStreamChange={(value) => updateConfig('stream', value)}
              onStop={stopGeneration}
              onSubmit={handleSendMessage}
            />
          </div>
        </div>
      </main>

      <div className='hidden min-h-0 shrink-0 xl:flex'>
        <ImageStudioPanel
          activeMode={activeMode}
          config={config}
          models={models}
          groups={groups}
          references={validImageUrls}
          latestImages={latestImages}
          imageLibrary={imageLibrary}
          isGenerating={isBusy}
          isModelLoading={isLoadingModels}
          onModeChange={handleModeChange}
          onConfigChange={updateConfig}
          onAddReferences={handleAddReferences}
          onRemoveReference={handleRemoveReference}
          onClearReferences={handleClearReferences}
          onUseImageAsReference={handleUseImageAsReference}
          onDeleteImageAsset={handleDeleteImageAsset}
          onClearImageLibrary={handleClearImageLibrary}
        />
      </div>

      <AlertDialog
        open={!!confirmAction}
        onOpenChange={(open) => {
          if (!open) setConfirmAction(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <Trash2 />
            </AlertDialogMedia>
            <AlertDialogTitle>{confirmAction?.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('Cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant='destructive'
              onClick={() => {
                confirmAction?.onConfirm()
                setConfirmAction(null)
              }}
            >
              {confirmAction?.actionLabel || t('Confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
