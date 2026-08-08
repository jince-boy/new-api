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
import { Plus } from 'lucide-react'
import { useFieldArray, useWatch, type UseFormReturn } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty'
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'

import type { SchedulingSettingsForm } from '../lib/scheduling-settings'
import { GroupStrategyOverride } from './group-strategy-override'

interface StrategyFieldsProps {
  form: UseFormReturn<SchedulingSettingsForm>
  groupNames: string[]
  groupsLoading: boolean
}

export function StrategyFields(props: StrategyFieldsProps) {
  const { t } = useTranslation()
  const overrides = useFieldArray({
    control: props.form.control,
    name: 'group_strategies',
  })
  const currentOverrides =
    useWatch({
      control: props.form.control,
      name: 'group_strategies',
    }) ?? []
  const defaultStrategy = useWatch({
    control: props.form.control,
    name: 'default_strategy',
  })
  const selectedGroups = new Set(
    currentOverrides.map((item) => item.group).filter(Boolean)
  )
  const allGroupNames = [
    ...new Set([
      ...props.groupNames,
      ...currentOverrides.map((item) => item.group).filter(Boolean),
    ]),
  ].sort((left, right) => left.localeCompare(right))
  const unusedGroups = allGroupNames.filter(
    (group) => !selectedGroups.has(group)
  )

  return (
    <FieldGroup>
      <FieldSet>
        <FieldLegend>{t('1. Choose the default behavior')}</FieldLegend>
        <FieldDescription>
          {t(
            'The global default applies to every group that is not listed as an exception below.'
          )}
        </FieldDescription>
        <Field>
          <FieldLabel htmlFor='default-strategy'>
            {t('Global default strategy')}
          </FieldLabel>
          <NativeSelect
            id='default-strategy'
            className='w-full sm:w-96'
            {...props.form.register('default_strategy')}
          >
            <NativeSelectOption value='legacy'>
              {t('Legacy priority and weight')}
            </NativeSelectOption>
            <NativeSelectOption value='intelligent'>
              {t('Intelligent round robin')}
            </NativeSelectOption>
          </NativeSelect>
          <FieldDescription>
            {defaultStrategy === 'intelligent'
              ? t(
                  'All groups use adaptive round robin unless you add a legacy exception. This is not recommended for an initial rollout.'
                )
              : t(
                  'Recommended: existing routing stays unchanged unless you explicitly enable intelligent round robin for a group.'
                )}
          </FieldDescription>
        </Field>
      </FieldSet>

      <FieldSet>
        <FieldLegend>{t('2. Choose exceptions by group')}</FieldLegend>
        <div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
          <FieldDescription>
            {t(
              'Each row overrides the global default for one existing service group. Groups not listed here continue using the global strategy.'
            )}
          </FieldDescription>
          <Button
            type='button'
            size='sm'
            variant='outline'
            disabled={props.groupsLoading || unusedGroups.length === 0}
            onClick={() => {
              const nextGroup = unusedGroups[0]
              if (!nextGroup) return
              overrides.append({
                group: nextGroup,
                strategy:
                  defaultStrategy === 'intelligent' ? 'legacy' : 'intelligent',
              })
            }}
          >
            <Plus className='size-4' aria-hidden='true' /> {t('Add group')}
          </Button>
        </div>

        <FieldGroup className='gap-3'>
          {overrides.fields.map((override, index) => {
            const currentGroup = currentOverrides[index]?.group ?? ''
            return (
              <GroupStrategyOverride
                key={override.id}
                form={props.form}
                index={index}
                overrideId={override.id}
                currentGroup={currentGroup}
                groupNames={allGroupNames}
                selectedGroupNames={selectedGroups}
                onRemove={() => overrides.remove(index)}
              />
            )
          })}
        </FieldGroup>

        {overrides.fields.length === 0 && (
          <Empty className='border py-5'>
            <EmptyHeader>
              <EmptyTitle>{t('No group exceptions')}</EmptyTitle>
              <EmptyDescription>
                {t(
                  'Every group currently uses the global default strategy. Add a group only when it needs different routing.'
                )}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </FieldSet>
    </FieldGroup>
  )
}
