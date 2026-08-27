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
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Ban, RotateCcw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

import {
  disableChannelModelRecovery,
  disableChannelRecovery,
  restoreChannel,
  restoreChannelModel,
} from '../api'
import type { ChannelFault, ChannelModelFault } from '../types'

interface ManualRecoveryPanelProps {
  faults: ChannelModelFault[]
  channelFaults: ChannelFault[]
}

export function ManualRecoveryPanel(props: ManualRecoveryPanelProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const restoreMutation = useMutation({
    mutationFn: (fault: ChannelModelFault) =>
      restoreChannelModel(fault.channel_id, fault.model),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['channel-scheduling-overview'],
      })
      toast.success(t('Model capability restored'))
    },
    onError: () => toast.error(t('Failed to restore model capability')),
  })
  const restoreChannelMutation = useMutation({
    mutationFn: (fault: ChannelFault) => restoreChannel(fault.channel_id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['channel-scheduling-overview'],
      })
      toast.success(t('Channel restored'))
    },
    onError: () => toast.error(t('Failed to restore channel')),
  })
  const disableModelMutation = useMutation({
    mutationFn: (fault: ChannelModelFault) =>
      disableChannelModelRecovery(fault.channel_id, fault.model),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['channel-scheduling-overview'],
      })
      toast.success(t('Automatic recovery stopped'))
    },
    onError: () => toast.error(t('Failed to stop automatic recovery')),
  })
  const disableChannelMutation = useMutation({
    mutationFn: (fault: ChannelFault) => disableChannelRecovery(fault.channel_id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['channel-scheduling-overview'],
      })
      toast.success(t('Automatic recovery stopped'))
    },
    onError: () => toast.error(t('Failed to stop automatic recovery')),
  })

  if (props.faults.length === 0 && props.channelFaults.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('System-wide manual recovery')}</CardTitle>
        <CardDescription>
          {t(
            'Disabled channel capabilities can affect more than one service group, so they are shown separately from the selected group.'
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-4'>
        {props.faults.length > 0 && (
          <div className='flex flex-col gap-2'>
            <h3 className='text-sm font-semibold'>
              {t('Disabled model capabilities')}
            </h3>
            {props.faults.map((fault) => (
              <div
                key={`${fault.channel_id}-${fault.model}`}
                className='flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between'
              >
                <div className='min-w-0'>
                  <div className='font-medium'>
                    #{fault.channel_id} · {fault.model}
                    {fault.manual_disabled && (
                      <Badge variant='secondary' className='ml-2'>
                        {t('Manual disable')}
                      </Badge>
                    )}
                  </div>
                  <div
                    className='text-muted-foreground truncate text-sm'
                    title={fault.reason}
                  >
                    {fault.reason}
                  </div>
                </div>
                <div className='flex flex-wrap gap-2'>
                  <Button
                    size='sm'
                    variant='outline'
                    disabled={restoreMutation.isPending || disableModelMutation.isPending}
                    onClick={() => restoreMutation.mutate(fault)}
                  >
                    <RotateCcw className='size-4' aria-hidden='true' />
                    {t('Restore manually')}
                  </Button>
                  {!fault.manual_disabled && (
                    <Button
                      size='sm'
                      variant='destructive'
                      disabled={restoreMutation.isPending || disableModelMutation.isPending}
                      onClick={() => {
                        if (window.confirm(t('Keep this model capability disabled?'))) {
                          disableModelMutation.mutate(fault)
                        }
                      }}
                    >
                      <Ban className='size-4' aria-hidden='true' />
                      {t('Keep disabled')}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {props.channelFaults.length > 0 && (
          <div className='flex flex-col gap-2'>
            <h3 className='text-sm font-semibold'>{t('Disabled channels')}</h3>
            {props.channelFaults.map((fault) => (
              <div
                key={fault.channel_id}
                className='flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between'
              >
                <div className='min-w-0'>
                  <div className='font-medium'>
                    {fault.channel_name} #{fault.channel_id}
                  </div>
                  <div
                    className='text-muted-foreground truncate text-sm'
                    title={fault.reason}
                  >
                    {fault.reason}
                  </div>
                </div>
                <div className='flex flex-wrap gap-2'>
                  <Button
                    size='sm'
                    variant='outline'
                    disabled={restoreChannelMutation.isPending || disableChannelMutation.isPending}
                    onClick={() => restoreChannelMutation.mutate(fault)}
                  >
                    <RotateCcw className='size-4' aria-hidden='true' />
                    {t('Restore manually')}
                  </Button>
                  <Button
                    size='sm'
                    variant='destructive'
                    disabled={restoreChannelMutation.isPending || disableChannelMutation.isPending}
                    onClick={() => {
                      if (window.confirm(t('Keep this channel disabled?'))) {
                        disableChannelMutation.mutate(fault)
                      }
                    }}
                  >
                    <Ban className='size-4' aria-hidden='true' />
                    {t('Keep disabled')}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
