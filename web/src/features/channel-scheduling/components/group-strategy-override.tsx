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
import { Trash2 } from 'lucide-react'
import { Controller, type UseFormReturn } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import type { SchedulingSettingsForm } from '../lib/scheduling-settings'

interface GroupStrategyOverrideProps {
  form: UseFormReturn<SchedulingSettingsForm>
  index: number
  overrideId: string
  currentGroup: string
  groupNames: string[]
  selectedGroupNames: Set<string>
  onRemove: () => void
}

export function GroupStrategyOverride(props: GroupStrategyOverrideProps) {
  const { t } = useTranslation()
  const groupError =
    props.form.formState.errors.group_strategies?.[props.index]?.group
  const options = props.groupNames
    .filter(
      (group) =>
        group === props.currentGroup || !props.selectedGroupNames.has(group)
    )
    .map((group) => ({ value: group, label: group }))

  return (
    <div className='grid gap-2 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_minmax(14rem,0.65fr)_auto]'>
      <Field data-invalid={!!groupError}>
        <FieldLabel htmlFor={`group-override-${props.overrideId}`}>
          {t('Service group')}
        </FieldLabel>
        <Controller
          control={props.form.control}
          name={`group_strategies.${props.index}.group`}
          render={({ field }) => (
            <Combobox
              id={`group-override-${props.overrideId}`}
              options={options}
              value={field.value}
              onValueChange={(value) => field.onChange(value ?? '')}
              placeholder={t('Select a service group')}
              searchPlaceholder={t('Search groups...')}
              emptyText={t('No service groups found')}
              allowCustomValue={false}
              className='w-full'
            />
          )}
        />
        <FieldError>
          {groupError
            ? t('Select a group that has not already been added.')
            : null}
        </FieldError>
      </Field>

      <Field>
        <FieldLabel htmlFor={`group-override-strategy-${props.overrideId}`}>
          {t('Strategy for this group')}
        </FieldLabel>
        <Controller
          control={props.form.control}
          name={`group_strategies.${props.index}.strategy`}
          render={({ field }) => (
            <Select
              items={[
                { value: 'legacy', label: t('Legacy priority and weight') },
                { value: 'intelligent', label: t('Intelligent round robin') },
              ]}
              value={field.value}
              onValueChange={(value) => field.onChange(value)}
            >
              <SelectTrigger
                id={`group-override-strategy-${props.overrideId}`}
                className='w-full'
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                <SelectGroup>
                  <SelectItem value='legacy'>
                    {t('Legacy priority and weight')}
                  </SelectItem>
                  <SelectItem value='intelligent'>
                    {t('Intelligent round robin')}
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          )}
        />
      </Field>

      <Button
        type='button'
        size='icon'
        variant='ghost'
        className='self-end'
        aria-label={t('Remove group override')}
        onClick={props.onRemove}
      >
        <Trash2 className='size-4' aria-hidden='true' />
      </Button>
    </div>
  )
}
