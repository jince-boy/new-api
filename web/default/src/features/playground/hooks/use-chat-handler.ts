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
import { useCallback, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { sendChatCompletion } from '../api'
import { MESSAGE_STATUS, ERROR_MESSAGES } from '../constants'
import {
  buildChatCompletionPayload,
  updateAssistantMessageWithError,
  updateLastAssistantMessage,
  processStreamingContent,
  finalizeMessage,
} from '../lib'
import type { Message, PlaygroundConfig, ParameterEnabled } from '../types'
import { useStreamRequest } from './use-stream-request'

interface UseChatHandlerOptions {
  config: PlaygroundConfig
  parameterEnabled: ParameterEnabled
  onMessageUpdate: (
    updater: (prev: Message[]) => Message[],
    options?: { persist?: boolean; promote?: boolean; conversationId?: string }
  ) => void
}

const STREAM_RENDER_INTERVAL_MS = 32

/**
 * Hook for handling chat message sending and receiving
 */
export function useChatHandler({
  config,
  parameterEnabled,
  onMessageUpdate,
}: UseChatHandlerOptions) {
  const { sendStreamRequest, stopStream, isStreaming } = useStreamRequest()
  const queuedReasoningRef = useRef('')
  const queuedContentRef = useRef('')
  const frameRef = useRef<number | null>(null)
  const flushTimerRef = useRef<number | null>(null)
  const lastFlushTimeRef = useRef(0)
  const activeConversationIdRef = useRef('')

  const applyStreamChunks = useCallback(
    (reasoningChunk: string, contentChunk: string) => {
      if (!reasoningChunk && !contentChunk) return

      onMessageUpdate(
        (prev) =>
          updateLastAssistantMessage(prev, (message) => {
            if (message.status === MESSAGE_STATUS.ERROR) return message

            let nextMessage = message

            if (reasoningChunk) {
              nextMessage = {
                ...nextMessage,
                reasoning: {
                  content:
                    (nextMessage.reasoning?.content || '') + reasoningChunk,
                  duration: 0,
                },
                isReasoningStreaming: true,
                status: MESSAGE_STATUS.STREAMING,
              }
            }

            if (contentChunk) {
              nextMessage = {
                ...processStreamingContent(nextMessage, contentChunk),
                status: MESSAGE_STATUS.STREAMING,
              }
            } else {
              nextMessage = {
                ...nextMessage,
                status: MESSAGE_STATUS.STREAMING,
              }
            }

            return nextMessage
          }),
        {
          persist: false,
          promote: false,
          conversationId: activeConversationIdRef.current,
        }
      )
    },
    [onMessageUpdate]
  )

  const flushQueuedStreamChunks = useCallback(() => {
    const reasoningChunk = queuedReasoningRef.current
    const contentChunk = queuedContentRef.current
    queuedReasoningRef.current = ''
    queuedContentRef.current = ''
    if (reasoningChunk || contentChunk) {
      lastFlushTimeRef.current = performance.now()
    }
    applyStreamChunks(reasoningChunk, contentChunk)
  }, [applyStreamChunks])

  const flushStreamChunks = useCallback(() => {
    if (flushTimerRef.current !== null) {
      window.clearTimeout(flushTimerRef.current)
      flushTimerRef.current = null
    }

    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }

    flushQueuedStreamChunks()
  }, [flushQueuedStreamChunks])

  const scheduleStreamFlush = useCallback(() => {
    if (frameRef.current !== null || flushTimerRef.current !== null) return

    const scheduleFrame = () => {
      flushTimerRef.current = null
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null
        flushQueuedStreamChunks()
      })
    }

    const elapsed = performance.now() - lastFlushTimeRef.current
    const delay = Math.max(0, STREAM_RENDER_INTERVAL_MS - elapsed)

    if (delay === 0) {
      scheduleFrame()
      return
    }

    flushTimerRef.current = window.setTimeout(scheduleFrame, delay)
  }, [flushQueuedStreamChunks])

  useEffect(
    () => () => {
      if (flushTimerRef.current !== null) {
        window.clearTimeout(flushTimerRef.current)
      }
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current)
      }
    },
    []
  )

  // Handle stream update
  const handleStreamUpdate = useCallback(
    (type: 'reasoning' | 'content', chunk: string) => {
      if (type === 'reasoning') {
        queuedReasoningRef.current += chunk
      } else {
        queuedContentRef.current += chunk
      }
      scheduleStreamFlush()
    },
    [scheduleStreamFlush]
  )

  // Handle stream complete
  const handleStreamComplete = useCallback(() => {
    flushStreamChunks()
    onMessageUpdate(
      (prev) =>
        updateLastAssistantMessage(prev, (message) =>
          message.status === MESSAGE_STATUS.COMPLETE ||
          message.status === MESSAGE_STATUS.ERROR
            ? message
            : { ...finalizeMessage(message), status: MESSAGE_STATUS.COMPLETE }
        ),
      { conversationId: activeConversationIdRef.current }
    )
  }, [flushStreamChunks, onMessageUpdate])

  // Handle stream error
  const handleStreamError = useCallback(
    (error: string, errorCode?: string) => {
      flushStreamChunks()
      toast.error(error)
      onMessageUpdate(
        (prev) => updateAssistantMessageWithError(prev, error, errorCode),
        { conversationId: activeConversationIdRef.current }
      )
    },
    [flushStreamChunks, onMessageUpdate]
  )

  // Send streaming chat request
  const sendStreamingChat = useCallback(
    (messages: Message[]) => {
      const payload = buildChatCompletionPayload(
        messages,
        config,
        parameterEnabled
      )
      sendStreamRequest(
        payload,
        handleStreamUpdate,
        handleStreamComplete,
        handleStreamError
      )
    },
    [
      config,
      parameterEnabled,
      sendStreamRequest,
      handleStreamUpdate,
      handleStreamComplete,
      handleStreamError,
    ]
  )

  // Send non-streaming chat request
  const sendNonStreamingChat = useCallback(
    async (messages: Message[]) => {
      const payload = buildChatCompletionPayload(
        messages,
        config,
        parameterEnabled
      )

      try {
        const response = await sendChatCompletion(payload)
        const choice = response.choices?.[0]
        if (!choice) return

        onMessageUpdate(
          (prev) =>
            updateLastAssistantMessage(prev, (message) => ({
              ...finalizeMessage(
                {
                  ...message,
                  versions: [
                    {
                      ...message.versions[0],
                      content: choice.message?.content || '',
                    },
                  ],
                },
                choice.message?.reasoning_content
              ),
              status: MESSAGE_STATUS.COMPLETE,
            })),
          { conversationId: activeConversationIdRef.current }
        )
      } catch (error: unknown) {
        const err = error as {
          response?: {
            data?: { message?: string; error?: { code?: string } }
          }
          message?: string
        }
        handleStreamError(
          err?.response?.data?.message ||
            err?.message ||
            ERROR_MESSAGES.API_REQUEST_ERROR,
          err?.response?.data?.error?.code || undefined
        )
      }
    },
    [config, parameterEnabled, onMessageUpdate, handleStreamError]
  )

  // Send chat request (stream or non-stream based on config)
  const sendChat = useCallback(
    (messages: Message[], options: { conversationId?: string } = {}) => {
      activeConversationIdRef.current = options.conversationId || ''
      if (config.stream) {
        sendStreamingChat(messages)
      } else {
        sendNonStreamingChat(messages)
      }
    },
    [config.stream, sendStreamingChat, sendNonStreamingChat]
  )

  // Stop generation
  const stopGeneration = useCallback(() => {
    stopStream()
    flushStreamChunks()
    onMessageUpdate(
      (prev) =>
        updateLastAssistantMessage(prev, (message) =>
          message.status === MESSAGE_STATUS.LOADING ||
          message.status === MESSAGE_STATUS.STREAMING
            ? { ...finalizeMessage(message), status: MESSAGE_STATUS.COMPLETE }
            : message
        ),
      { conversationId: activeConversationIdRef.current }
    )
  }, [stopStream, flushStreamChunks, onMessageUpdate])

  return {
    sendChat,
    stopGeneration,
    isGenerating: isStreaming,
  }
}
