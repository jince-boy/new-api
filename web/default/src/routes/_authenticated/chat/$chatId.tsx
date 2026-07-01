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
import { Link, createFileRoute, redirect } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Loader2, MessageCircleWarning } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
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

export const Route = createFileRoute('/_authenticated/chat/$chatId')({
  loader: async ({ params }) => {
    if (!Number.isInteger(Number(params.chatId))) {
      throw redirect({ to: '/dashboard' })
    }
  },
  component: ChatRouteComponent,
})

function ChatRouteComponent() {
  const { t } = useTranslation()
  const { resolvedTheme } = useTheme()
  const { chatId } = Route.useParams()
  const userId = useAuthStore((state) => state.auth.user?.id)
  const { chatPresets, serverAddress } = useChatPresets()
  const preset = useMemo(() => {
    return chatPresets.find((item) => item.id === chatId)
  }, [chatId, chatPresets])
  const { data: purposeResponse } = useQuery({
    queryKey: ['default-api-key-purposes'],
    queryFn: fetchDefaultApiKeyPurposes,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  })
  const defaultApiKeyPurposes = purposeResponse?.success
    ? purposeResponse.data || FALLBACK_DEFAULT_API_KEY_PURPOSES
    : FALLBACK_DEFAULT_API_KEY_PURPOSES

  const isWebLink = preset?.type === 'web'

  const requiredPurposes = useMemo(() => {
    if (!preset || !isWebLink) return []
    return chatLinkRequiredApiKeyPurposes(
      preset.url ?? '',
      defaultApiKeyPurposes
    )
  }, [defaultApiKeyPurposes, isWebLink, preset])
  const requiresActiveKey = requiredPurposes.length > 0

  const {
    data: activeKeys,
    isPending,
    isError,
    error,
  } = useQuery({
    queryKey: ['chat-preset-active-api-keys', chatId, requiredPurposes, userId],
    queryFn: async () => {
      const entries = await Promise.all(
        requiredPurposes.map(
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
    enabled: Boolean(preset && requiresActiveKey && userId),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  })

  const iframeSrc = useMemo(() => {
    if (!preset || !isWebLink) return ''
    if (requiresActiveKey && !activeKeys) return ''
    return resolveChatUrl({
      template: preset.url,
      apiKeys: requiresActiveKey ? activeKeys : undefined,
      purposeDefinitions: defaultApiKeyPurposes,
      serverAddress,
      theme: resolvedTheme,
    })
  }, [
    activeKeys,
    isWebLink,
    preset,
    defaultApiKeyPurposes,
    requiresActiveKey,
    serverAddress,
    resolvedTheme,
  ])

  if (!preset) {
    return (
      <div className='flex h-full flex-col items-center justify-center gap-4 p-6 text-center'>
        <MessageCircleWarning className='text-muted-foreground h-12 w-12' />
        <div className='space-y-1'>
          <h2 className='text-lg font-semibold'>
            {t('Chat preset not found')}
          </h2>
          <p className='text-muted-foreground'>
            {t('The requested chat preset does not exist or has been removed.')}
          </p>
        </div>
        <Button variant='outline' render={<Link to='/dashboard' />}>
          {t('Return to dashboard')}
        </Button>
      </div>
    )
  }

  if (!isWebLink) {
    return (
      <div className='flex h-full flex-col items-center justify-center gap-4 p-6 text-center'>
        <MessageCircleWarning className='text-muted-foreground h-12 w-12' />
        <div className='space-y-1'>
          <h2 className='text-lg font-semibold'>{t('Use sidebar shortcut')}</h2>
          <p className='text-muted-foreground'>
            {preset.name}{' '}
            {t(
              'opens in an external client. Trigger it from the sidebar or API key actions to launch the configured application.'
            )}
          </p>
        </div>
        <Button variant='outline' render={<Link to='/dashboard' />}>
          {t('Return to dashboard')}
        </Button>
      </div>
    )
  }

  if (requiresActiveKey && isPending) {
    return (
      <div className='flex h-full flex-col items-center justify-center gap-4'>
        <Loader2 className='text-muted-foreground h-8 w-8 animate-spin' />
        <p className='text-muted-foreground text-sm'>
          {t('Preparing your chat link…')}
        </p>
      </div>
    )
  }

  if (requiresActiveKey && (isError || !activeKeys || !iframeSrc)) {
    const message =
      error instanceof Error
        ? error.message
        : 'Unable to generate chat link. Please check your API keys.'
    return (
      <div className='flex h-full flex-col items-center justify-center p-6'>
        <Alert variant='destructive' className='max-w-xl'>
          <AlertTitle>{t('Unable to open chat')}</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      </div>
    )
  }

  if (!requiresActiveKey && !iframeSrc) {
    return (
      <div className='flex h-full flex-col items-center justify-center p-6'>
        <Alert variant='destructive' className='max-w-xl'>
          <AlertTitle>{t('Unable to open chat')}</AlertTitle>
          <AlertDescription>
            {t(
              'Unable to generate chat link. Please contact your administrator.'
            )}
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <iframe
      src={iframeSrc}
      key={iframeSrc}
      className='h-full w-full border-0'
      allow='camera; microphone'
      title={`Chat preset: ${preset.name}`}
    />
  )
}
