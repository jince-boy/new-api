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

import {
  CHANNEL_FORM_DEFAULT_VALUES,
  channelFormSchema,
  transformFormDataToCreatePayload,
} from '../channel-form'

const validBaseForm = {
  ...CHANNEL_FORM_DEFAULT_VALUES,
  name: 'rate-limited-channel',
  key: 'test-key',
  models: 'gpt-test',
}

test('channel request rate limit stays optional when both fields are empty', () => {
  const result = channelFormSchema.safeParse(validBaseForm)

  assert.equal(result.success, true)
  if (!result.success) return
  const payload = transformFormDataToCreatePayload(result.data)
  const settings = JSON.parse(String(payload.channel.settings))
  assert.equal(settings.request_rate_limit, undefined)
})

test('channel request rate limit serializes an exact rolling-window rule', () => {
  const result = channelFormSchema.safeParse({
    ...validBaseForm,
    request_rate_limit_max: 30,
    request_rate_limit_window_seconds: 60,
  })

  assert.equal(result.success, true)
  if (!result.success) return
  const payload = transformFormDataToCreatePayload(result.data)
  const settings = JSON.parse(String(payload.channel.settings))
  assert.deepEqual(settings.request_rate_limit, {
    max_requests: 30,
    window_seconds: 60,
  })
})

test('channel request rate limit rejects a partially configured rule', () => {
  const missingWindow = channelFormSchema.safeParse({
    ...validBaseForm,
    request_rate_limit_max: 30,
  })
  const missingMaximum = channelFormSchema.safeParse({
    ...validBaseForm,
    request_rate_limit_window_seconds: 60,
  })

  assert.equal(missingWindow.success, false)
  assert.equal(missingMaximum.success, false)
})

test('clearing both fields removes an existing rate limit without changing other settings', () => {
  const result = channelFormSchema.safeParse({
    ...validBaseForm,
    settings: JSON.stringify({
      request_rate_limit: { max_requests: 30, window_seconds: 60 },
      custom_setting: 'keep',
    }),
  })

  assert.equal(result.success, true)
  if (!result.success) return
  const payload = transformFormDataToCreatePayload(result.data)
  const settings = JSON.parse(String(payload.channel.settings))
  assert.equal(settings.request_rate_limit, undefined)
  assert.equal(settings.custom_setting, 'keep')
})
