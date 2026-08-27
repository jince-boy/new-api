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
import { z } from 'zod'

import type { ChannelSchedulingSetting, SchedulingStrategy } from '../types'
import { recommendedTuning } from './scheduling-tuning'

export const schedulingSettingsSchema = z
  .object({
    default_strategy: z.enum(['legacy', 'intelligent']),
    group_strategies: z.array(
      z.object({
        group: z.string().trim().min(1),
        strategy: z.enum(['legacy', 'intelligent']),
      })
    ),
    minimum_factor: z.number().gt(0).max(1),
    maximum_factor: z.number().min(1).max(10),
    performance_exponent: z.number().gt(0).max(4),
    inflight_penalty: z.number().min(0).max(10),
    warmup_samples: z.number().int().min(1).max(10000),
    sample_window_size: z.number().int().min(1).max(1000),
    sample_max_age_minutes: z.number().int().min(1).max(1440),
    severe_ttft_ms: z.number().int().min(1).max(86400000),
    failure_threshold: z.number().int().min(1).max(100),
    failure_window_seconds: z.number().int().min(1).max(3600),
    auto_recovery_interval_seconds: z.number().int().min(5).max(86400),
    max_attempts: z.number().int().min(1).max(64),
    realtime_retention_minutes: z.number().int().min(1).max(1440),
  })
  .superRefine((value, context) => {
    if (value.maximum_factor < value.minimum_factor) {
      context.addIssue({
        code: 'custom',
        path: ['maximum_factor'],
        message: 'maximum factor must not be lower than minimum factor',
      })
    }
    if (value.warmup_samples > value.sample_window_size) {
      context.addIssue({
        code: 'custom',
        path: ['warmup_samples'],
        message: 'minimum evidence samples must not exceed samples per channel',
      })
    }
    const groups = new Set<string>()
    value.group_strategies.forEach((item, index) => {
      const group = item.group.trim()
      if (groups.has(group)) {
        context.addIssue({
          code: 'custom',
          path: ['group_strategies', index, 'group'],
          message: 'group strategy must be unique',
        })
      }
      groups.add(group)
    })
  })

export type SchedulingSettingsForm = z.infer<typeof schedulingSettingsSchema>

export function createDefaultSchedulingSettingsForm(): SchedulingSettingsForm {
  return {
    default_strategy: 'legacy',
    group_strategies: [],
    ...recommendedTuning,
  }
}

export function toSchedulingSettingsForm(
  setting: ChannelSchedulingSetting
): SchedulingSettingsForm {
  return {
    ...setting,
    group_strategies: Object.entries(setting.group_strategies).map(
      ([group, strategy]) => ({ group, strategy })
    ),
  }
}

export function toChannelSchedulingSetting(
  values: SchedulingSettingsForm
): ChannelSchedulingSetting {
  const groupStrategies = Object.fromEntries(
    values.group_strategies.map((item) => [item.group.trim(), item.strategy])
  ) as Record<string, SchedulingStrategy>
  return { ...values, group_strategies: groupStrategies }
}
