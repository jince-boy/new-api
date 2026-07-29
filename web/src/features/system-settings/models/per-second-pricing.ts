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
export type PerSecondOperator =
  | 'eq'
  | 'not_eq'
  | 'contains'
  | 'not_contains'
  | 'exists'
  | 'not_exists'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'

export type PerSecondConditionDraft = {
  id: string
  path: string
  operator: PerSecondOperator
  value: string
}

export type PerSecondRuleDraft = {
  id: string
  name: string
  price: string
  conditions: PerSecondConditionDraft[]
}

export type PerSecondRuleConfig = {
  name: string
  price: number
  conditions: Array<{
    path: string
    operator: PerSecondOperator
    value?: string
  }>
}

export const perSecondOperators: Array<{
  value: PerSecondOperator
  labelKey: string
}> = [
  { value: 'eq', labelKey: 'Equals' },
  { value: 'not_eq', labelKey: 'Does not equal' },
  { value: 'contains', labelKey: 'Contains' },
  { value: 'not_contains', labelKey: 'Does not contain' },
  { value: 'exists', labelKey: 'Exists' },
  { value: 'not_exists', labelKey: 'Does not exist' },
  { value: 'gt', labelKey: 'Greater than' },
  { value: 'gte', labelKey: 'Greater than or equal to' },
  { value: 'lt', labelKey: 'Less than' },
  { value: 'lte', labelKey: 'Less than or equal to' },
]

let perSecondDraftId = 0

function createPerSecondDraftId(type: 'rule' | 'condition'): string {
  perSecondDraftId += 1
  return `per-second-${type}-${perSecondDraftId}`
}

export function createPerSecondCondition(): PerSecondConditionDraft {
  return {
    id: createPerSecondDraftId('condition'),
    path: '',
    operator: 'eq',
    value: '',
  }
}

export function createPerSecondRule(index: number): PerSecondRuleDraft {
  return {
    id: createPerSecondDraftId('rule'),
    name: `Rule ${index + 1}`,
    price: '',
    conditions: [{ ...createPerSecondCondition(), path: 'resolution' }],
  }
}

export function normalizePerSecondRules(value: unknown): PerSecondRuleDraft[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((candidate) => {
    if (!candidate || typeof candidate !== 'object') return []
    const rule = candidate as Partial<PerSecondRuleConfig>
    const conditions = Array.isArray(rule.conditions)
      ? rule.conditions.flatMap((condition) => {
          if (!condition || typeof condition !== 'object') return []
          const item = condition as Partial<
            PerSecondRuleConfig['conditions'][number]
          >
          const operator = perSecondOperators.some(
            (option) => option.value === item.operator
          )
            ? item.operator
            : 'eq'
          return [
            {
              id: createPerSecondDraftId('condition'),
              path: typeof item.path === 'string' ? item.path : '',
              operator: operator as PerSecondOperator,
              value: typeof item.value === 'string' ? item.value : '',
            },
          ]
        })
      : []
    return [
      {
        id: createPerSecondDraftId('rule'),
        name: typeof rule.name === 'string' ? rule.name : '',
        price:
          typeof rule.price === 'number' && Number.isFinite(rule.price)
            ? String(rule.price)
            : '',
        conditions,
      },
    ]
  })
}

export function validatePerSecondRules(
  rules: PerSecondRuleDraft[]
): string | null {
  for (const rule of rules) {
    if (!rule.name.trim()) return 'Each conditional price rule needs a name.'
    const price = Number(rule.price)
    if (rule.price === '' || !Number.isFinite(price) || price < 0) {
      return 'Each conditional price rule needs a valid non-negative price.'
    }
    if (rule.conditions.length === 0) {
      return 'Each conditional price rule needs at least one condition.'
    }
    for (const condition of rule.conditions) {
      if (!condition.path.trim()) {
        return 'Each condition needs a request field.'
      }
      if (
        condition.operator !== 'exists' &&
        condition.operator !== 'not_exists' &&
        !condition.value.trim()
      ) {
        return 'Each condition needs a comparison value.'
      }
    }
  }
  return null
}

export function serializePerSecondRules(
  rules: PerSecondRuleDraft[]
): PerSecondRuleConfig[] {
  return rules.map((rule) => ({
    name: rule.name.trim(),
    price: Number(rule.price),
    conditions: rule.conditions.map((condition) => ({
      path: condition.path.trim(),
      operator: condition.operator,
      ...(condition.operator === 'exists' || condition.operator === 'not_exists'
        ? {}
        : { value: condition.value.trim() }),
    })),
  }))
}
