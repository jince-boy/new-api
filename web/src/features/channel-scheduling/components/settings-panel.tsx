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
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CircleAlert, Save, ShieldCheck } from 'lucide-react'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

import {
  getChannelSchedulingGroups,
  getChannelSchedulingSetting,
  updateChannelSchedulingSetting,
} from '../api'
import {
  createDefaultSchedulingSettingsForm,
  schedulingSettingsSchema,
  toChannelSchedulingSetting,
  toSchedulingSettingsForm,
  type SchedulingSettingsForm,
} from '../lib/scheduling-settings'
import { AdvancedTuningFields } from './advanced-tuning-fields'
import { StrategyFields } from './strategy-fields'

export function SettingsPanel() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const settingQuery = useQuery({
    queryKey: ['channel-scheduling-settings'],
    queryFn: getChannelSchedulingSetting,
  })
  const groupsQuery = useQuery({
    queryKey: ['channel-scheduling-groups'],
    queryFn: getChannelSchedulingGroups,
  })
  const form = useForm<SchedulingSettingsForm>({
    resolver: zodResolver(schedulingSettingsSchema),
    defaultValues: createDefaultSchedulingSettingsForm(),
  })

  useEffect(() => {
    if (settingQuery.data) {
      form.reset(toSchedulingSettingsForm(settingQuery.data))
    }
  }, [form, settingQuery.data])

  const mutation = useMutation({
    mutationFn: updateChannelSchedulingSetting,
    onSuccess: async (setting) => {
      form.reset(toSchedulingSettingsForm(setting))
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['channel-scheduling-settings'],
        }),
        queryClient.invalidateQueries({
          queryKey: ['channel-scheduling-overview'],
        }),
      ])
      toast.success(t('Scheduling settings saved'))
    },
    onError: () => toast.error(t('Failed to save scheduling settings')),
  })

  const onSubmit = form.handleSubmit(
    (values) => mutation.mutate(toChannelSchedulingSetting(values)),
    () => toast.error(t('Please check the scheduling parameters.'))
  )

  if (settingQuery.isError) {
    return (
      <Alert variant='destructive'>
        <CircleAlert aria-hidden='true' />
        <AlertTitle>{t('Failed to load scheduling settings')}</AlertTitle>
        <AlertAction>
          <Button
            type='button'
            size='sm'
            variant='outline'
            onClick={() => settingQuery.refetch()}
          >
            {t('Retry')}
          </Button>
        </AlertAction>
      </Alert>
    )
  }

  return (
    <form noValidate onSubmit={onSubmit}>
      <Card>
        <CardHeader>
          <CardTitle>{t('Routing strategy')}</CardTitle>
          <CardDescription>
            {t(
              'Configure only two decisions: the default strategy and which groups should be exceptions. Advanced tuning can stay at its recommended values.'
            )}
          </CardDescription>
        </CardHeader>

        <CardContent className='flex flex-col gap-6'>
          <Alert>
            <ShieldCheck aria-hidden='true' />
            <AlertTitle>{t('Recommended safe setup')}</AlertTitle>
            <AlertDescription>
              {t(
                'Keep legacy routing as the global default, then enable intelligent round robin only for selected groups. This leaves every other group unchanged.'
              )}
            </AlertDescription>
          </Alert>

          {groupsQuery.isError && (
            <Alert variant='destructive'>
              <CircleAlert aria-hidden='true' />
              <AlertTitle>{t('Failed to load service groups')}</AlertTitle>
              <AlertAction>
                <Button
                  type='button'
                  size='sm'
                  variant='outline'
                  onClick={() => groupsQuery.refetch()}
                >
                  {t('Retry')}
                </Button>
              </AlertAction>
            </Alert>
          )}

          <StrategyFields
            form={form}
            groupNames={groupsQuery.data ?? []}
            groupsLoading={groupsQuery.isLoading}
          />
          <AdvancedTuningFields form={form} />
        </CardContent>

        <CardFooter>
          <Button
            type='submit'
            disabled={mutation.isPending || settingQuery.isLoading}
          >
            <Save className='size-4' aria-hidden='true' /> {t('Save settings')}
          </Button>
        </CardFooter>
      </Card>
    </form>
  )
}
