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
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import {
  createPerSecondCondition,
  createPerSecondRule,
  perSecondOperators,
  type PerSecondConditionDraft,
  type PerSecondRuleDraft,
} from './per-second-pricing'

type PerSecondPricingRulesEditorProps = {
  rules: PerSecondRuleDraft[]
  error?: string | null
  onChange: (rules: PerSecondRuleDraft[]) => void
}

export function PerSecondPricingRulesEditor(
  props: PerSecondPricingRulesEditorProps
) {
  const { t } = useTranslation()
  const operatorItems = perSecondOperators.map((operator) => ({
    value: operator.value,
    label: t(operator.labelKey),
  }))

  const updateRule = (index: number, patch: Partial<PerSecondRuleDraft>) => {
    props.onChange(
      props.rules.map((rule, ruleIndex) =>
        ruleIndex === index ? { ...rule, ...patch } : rule
      )
    )
  }

  const updateCondition = (
    ruleIndex: number,
    conditionIndex: number,
    patch: Partial<PerSecondConditionDraft>
  ) => {
    const rule = props.rules[ruleIndex]
    updateRule(ruleIndex, {
      conditions: rule.conditions.map((condition, index) =>
        index === conditionIndex ? { ...condition, ...patch } : condition
      ),
    })
  }

  const moveRule = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= props.rules.length) return
    const next = [...props.rules]
    const currentRule = next[index]
    next[index] = next[target]
    next[target] = currentRule
    props.onChange(next)
  }

  return (
    <FieldGroup className='gap-4'>
      <Alert>
        <AlertTitle>{t('Conditional price rules')}</AlertTitle>
        <AlertDescription>
          {t(
            'Rules are checked from top to bottom. The first matching rule sets the final price per second; otherwise the default price above is used.'
          )}
        </AlertDescription>
      </Alert>

      {props.error ? (
        <Alert variant='destructive'>
          <AlertTitle>{t('Rule configuration is incomplete')}</AlertTitle>
          <AlertDescription>{t(props.error)}</AlertDescription>
        </Alert>
      ) : null}

      {props.rules.map((rule, ruleIndex) => (
        <Card key={rule.id}>
          <CardHeader className='flex-row items-start justify-between gap-3'>
            <div className='grid gap-1'>
              <CardTitle className='text-sm'>
                {t('Rule {{number}}', { number: ruleIndex + 1 })}
              </CardTitle>
              <CardDescription>
                {t('All conditions in this rule must match.')}
              </CardDescription>
            </div>
            <div className='flex items-center gap-1'>
              <Button
                type='button'
                size='icon-sm'
                variant='ghost'
                disabled={ruleIndex === 0}
                aria-label={t('Move rule up')}
                onClick={() => moveRule(ruleIndex, -1)}
              >
                <ArrowUp aria-hidden='true' />
              </Button>
              <Button
                type='button'
                size='icon-sm'
                variant='ghost'
                disabled={ruleIndex === props.rules.length - 1}
                aria-label={t('Move rule down')}
                onClick={() => moveRule(ruleIndex, 1)}
              >
                <ArrowDown aria-hidden='true' />
              </Button>
              <Button
                type='button'
                size='icon-sm'
                variant='ghost'
                aria-label={t('Delete rule')}
                onClick={() =>
                  props.onChange(
                    props.rules.filter((_, index) => index !== ruleIndex)
                  )
                }
              >
                <Trash2 aria-hidden='true' />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <FieldGroup className='gap-4'>
              <div className='grid gap-4 md:grid-cols-2'>
                <Field>
                  <FieldLabel htmlFor={`per-second-rule-name-${ruleIndex}`}>
                    {t('Rule name')}
                  </FieldLabel>
                  <Input
                    id={`per-second-rule-name-${ruleIndex}`}
                    value={rule.name}
                    placeholder={t('720P price')}
                    onChange={(event) =>
                      updateRule(ruleIndex, { name: event.target.value })
                    }
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`per-second-rule-price-${ruleIndex}`}>
                    {t('Matched price per second')}
                  </FieldLabel>
                  <InputGroup>
                    <InputGroupAddon>$</InputGroupAddon>
                    <InputGroupInput
                      id={`per-second-rule-price-${ruleIndex}`}
                      inputMode='decimal'
                      value={rule.price}
                      placeholder='0.04'
                      onChange={(event) => {
                        const value = event.target.value
                        if (/^(\d+(\.\d*)?|\.\d*)?$/.test(value)) {
                          updateRule(ruleIndex, { price: value })
                        }
                      }}
                    />
                    <InputGroupAddon align='inline-end'>
                      {t('per second')}
                    </InputGroupAddon>
                  </InputGroup>
                </Field>
              </div>

              {rule.conditions.map((condition, conditionIndex) => {
                const needsValue =
                  condition.operator !== 'exists' &&
                  condition.operator !== 'not_exists'
                return (
                  <div
                    key={condition.id}
                    className='bg-muted/20 grid gap-3 rounded-lg p-3 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]'
                  >
                    <Field>
                      <FieldLabel
                        htmlFor={`per-second-condition-path-${ruleIndex}-${conditionIndex}`}
                      >
                        {t('Request field')}
                      </FieldLabel>
                      <Input
                        id={`per-second-condition-path-${ruleIndex}-${conditionIndex}`}
                        value={condition.path}
                        placeholder='resolution'
                        onChange={(event) =>
                          updateCondition(ruleIndex, conditionIndex, {
                            path: event.target.value,
                          })
                        }
                      />
                    </Field>
                    <Field>
                      <FieldLabel>{t('Operator')}</FieldLabel>
                      <Select
                        items={operatorItems}
                        value={condition.operator}
                        onValueChange={(value) => {
                          if (typeof value !== 'string') return
                          updateCondition(ruleIndex, conditionIndex, {
                            operator:
                              value as PerSecondConditionDraft['operator'],
                          })
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent alignItemWithTrigger={false}>
                          <SelectGroup>
                            {operatorItems.map((operator) => (
                              <SelectItem
                                key={operator.value}
                                value={operator.value}
                              >
                                {operator.label}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field data-disabled={!needsValue}>
                      <FieldLabel
                        htmlFor={`per-second-condition-value-${ruleIndex}-${conditionIndex}`}
                      >
                        {t('Value')}
                      </FieldLabel>
                      <Input
                        id={`per-second-condition-value-${ruleIndex}-${conditionIndex}`}
                        value={condition.value}
                        placeholder='720p'
                        disabled={!needsValue}
                        onChange={(event) =>
                          updateCondition(ruleIndex, conditionIndex, {
                            value: event.target.value,
                          })
                        }
                      />
                    </Field>
                    <div className='flex items-end'>
                      <Button
                        type='button'
                        size='icon'
                        variant='ghost'
                        aria-label={t('Delete condition')}
                        onClick={() =>
                          updateRule(ruleIndex, {
                            conditions: rule.conditions.filter(
                              (_, index) => index !== conditionIndex
                            ),
                          })
                        }
                      >
                        <Trash2 aria-hidden='true' />
                      </Button>
                    </div>
                  </div>
                )
              })}

              <div className='flex flex-wrap items-center justify-between gap-3'>
                <FieldDescription>
                  {t(
                    'Common fields: resolution, size, quality, mode, metadata.resolution. Custom JSON paths are also supported.'
                  )}
                </FieldDescription>
                <Button
                  type='button'
                  size='sm'
                  variant='outline'
                  onClick={() =>
                    updateRule(ruleIndex, {
                      conditions: [
                        ...rule.conditions,
                        createPerSecondCondition(),
                      ],
                    })
                  }
                >
                  <Plus aria-hidden='true' data-icon='inline-start' />
                  {t('Add condition')}
                </Button>
              </div>
            </FieldGroup>
          </CardContent>
        </Card>
      ))}

      <Button
        type='button'
        variant='outline'
        onClick={() =>
          props.onChange([
            ...props.rules,
            createPerSecondRule(props.rules.length),
          ])
        }
      >
        <Plus aria-hidden='true' data-icon='inline-start' />
        {t('Add conditional price rule')}
      </Button>
    </FieldGroup>
  )
}
