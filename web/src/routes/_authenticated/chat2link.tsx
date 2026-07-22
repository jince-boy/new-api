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
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { useTheme } from '@/context/theme-provider'
import { fetchActiveApiKey } from '@/features/chat/hooks/use-active-chat-key'
import { useChatPresets } from '@/features/chat/hooks/use-chat-presets'
import {
  chatLinkRequiredApiKeyPurposes,
  resolveChatUrl,
} from '@/features/chat/lib/chat-links'
import {
  FALLBACK_DEFAULT_API_KEY_PURPOSES,
  fetchDefaultApiKeyPurposes,
  type DefaultApiKeyPurpose,
} from '@/features/keys/api'
import { useAuthStore } from '@/stores/auth-store'

export const Route = createFileRoute('/_authenticated/chat2link')({
  component: Chat2LinkPage,
})

function Chat2LinkPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { resolvedTheme } = useTheme()
  const userId = useAuthStore((state) => state.auth.user?.id)
  const { chatPresets, serverAddress } = useChatPresets()

  const firstWebPreset = useMemo(
    () => chatPresets.find((p) => p.type === 'web'),
    [chatPresets]
  )
  const { data: purposeResponse } = useQuery({
    queryKey: ['default-api-key-purposes'],
    queryFn: fetchDefaultApiKeyPurposes,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  })
  const defaultApiKeyPurposes = purposeResponse?.success
    ? purposeResponse.data || FALLBACK_DEFAULT_API_KEY_PURPOSES
    : FALLBACK_DEFAULT_API_KEY_PURPOSES

  const requiredPurposes = useMemo(() => {
    if (!firstWebPreset) return []
    return chatLinkRequiredApiKeyPurposes(
      firstWebPreset.url,
      defaultApiKeyPurposes
    )
  }, [defaultApiKeyPurposes, firstWebPreset])

  const {
    data: activeKeys,
    error: keyError,
    isPending,
  } = useQuery({
    queryKey: [
      'chat2link-active-api-keys',
      firstWebPreset?.id,
      requiredPurposes,
      userId,
    ],
    queryFn: async () => {
      const purposes: DefaultApiKeyPurpose[] =
        requiredPurposes.length > 0 ? requiredPurposes : ['chat']
      const entries = await Promise.all(
        purposes.map(
          async (purpose): Promise<[DefaultApiKeyPurpose, string]> => [
            purpose,
            await fetchActiveApiKey(purpose),
          ]
        )
      )
      return Object.fromEntries(entries) as Partial<
        Record<DefaultApiKeyPurpose, string>
      >
    },
    enabled: Boolean(firstWebPreset && userId),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  })

  useEffect(() => {
    if (!firstWebPreset) {
      if (chatPresets.length > 0) {
        toast.error(t('No available Web chat links'))
      }
      return
    }

    if (isPending && !keyError) return

    if (keyError || !activeKeys) {
      const message =
        keyError instanceof Error
          ? keyError.message
          : t('No enabled tokens available')
      toast.error(message)
      navigate({ to: '/keys' })
      return
    }

    const url = resolveChatUrl({
      template: firstWebPreset.url,
      apiKeys: activeKeys,
      purposeDefinitions: defaultApiKeyPurposes,
      serverAddress,
      theme: resolvedTheme,
    })

    if (url) {
      window.location.href = url
    }
  }, [
    firstWebPreset,
    defaultApiKeyPurposes,
    activeKeys,
    isPending,
    keyError,
    serverAddress,
    resolvedTheme,
    chatPresets.length,
    navigate,
    t,
  ])

  return (
    <div className='flex h-full flex-col items-center justify-center gap-3'>
      <Loader2 className='text-muted-foreground h-8 w-8 animate-spin' />
      <p className='text-muted-foreground text-sm'>
        {t('Redirecting to chat page...')}
      </p>
    </div>
  )
}
