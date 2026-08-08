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
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from 'i18next'
import { renderToStaticMarkup } from 'react-dom/server'
import { useForm } from 'react-hook-form'

import '@/i18n/config'

import { SettingsPanel } from '../components/settings-panel'
import { StrategyFields } from '../components/strategy-fields'
import {
  createDefaultSchedulingSettingsForm,
  type SchedulingSettingsForm,
} from '../lib/scheduling-settings'
import { recommendedTuning, tuningSections } from '../lib/scheduling-tuning'
import type { ChannelSchedulingSetting } from '../types'

test('settings lead with the safe two-step rollout and hide tuning complexity', async () => {
  await i18n.changeLanguage('en')
  const queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: Number.POSITIVE_INFINITY } },
  })
  const setting: ChannelSchedulingSetting = {
    default_strategy: 'legacy',
    group_strategies: {},
    minimum_factor: 0.2,
    maximum_factor: 1.5,
    performance_exponent: 0.5,
    inflight_penalty: 0.25,
    warmup_samples: 5,
    sample_window_size: 20,
    sample_max_age_minutes: 15,
    severe_ttft_ms: 60000,
    max_attempts: 8,
    realtime_retention_minutes: 60,
  }
  queryClient.setQueryData(['channel-scheduling-settings'], setting)

  const html = renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <SettingsPanel />
    </QueryClientProvider>
  )
  queryClient.clear()

  assert.match(html, /Configure only two decisions/)
  assert.match(html, /Recommended safe setup/)
  assert.match(html, /No group exceptions/)
  assert.match(html, /Advanced tuning/)
  assert.match(html, /<form noValidate=""/)
})

test('all recommended numbers satisfy their HTML input step constraints', () => {
  for (const section of tuningSections) {
    for (const field of section.fields) {
      const value = recommendedTuning[field.name]
      const stepsFromMinimum = (value - field.min) / field.step
      assert.ok(
        Math.abs(stepsFromMinimum - Math.round(stepsFromMinimum)) < 1e-9,
        `${field.name} default ${value} is invalid for min=${field.min}, step=${field.step}`
      )
    }
  }
})

test('group overrides use a service-group combobox instead of free text', async () => {
  await i18n.changeLanguage('en')

  function StrategyHarness() {
    const form = useForm<SchedulingSettingsForm>({
      defaultValues: {
        ...createDefaultSchedulingSettingsForm(),
        group_strategies: [{ group: 'vip', strategy: 'intelligent' }],
      },
    })
    return (
      <StrategyFields
        form={form}
        groupNames={['default', 'vip']}
        groupsLoading={false}
      />
    )
  }

  const html = renderToStaticMarkup(<StrategyHarness />)

  assert.match(html, /role="combobox"/)
  assert.match(html, /value="vip"/)
  assert.doesNotMatch(html, /placeholder="Group name"/)
})
