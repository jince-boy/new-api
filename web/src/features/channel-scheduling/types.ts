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
export type SchedulingStrategy = 'legacy' | 'intelligent'

export interface ChannelSchedulingSetting {
  default_strategy: SchedulingStrategy
  group_strategies: Record<string, SchedulingStrategy>
  minimum_factor: number
  maximum_factor: number
  performance_exponent: number
  inflight_penalty: number
  warmup_samples: number
  sample_window_size: number
  sample_max_age_minutes: number
  severe_ttft_ms: number
  failure_threshold: number
  failure_window_seconds: number
  max_attempts: number
  realtime_retention_minutes: number
}

export interface SchedulingBucket {
  ts: number
  request_count: number
  success_count: number
  error_count: number
  avg_ttft_ms: number
  effective_weight: number
  inflight: number
}

export interface SchedulingChannel {
  channel_id: number
  channel_name: string
  group: string
  model: string
  priority: number
  base_weight: number
  effective_weight: number
  performance_factor: number
  estimated_ttft_ms: number
  last_ttft_ms: number
  inflight: number
  request_count: number
  success_count: number
  error_count: number
  affinity_hits: number
  samples: number
  actual_share: number
  state: 'normal' | 'degraded'
  last_error: string
  last_selected_at: number
  last_completed_at: number
  series: SchedulingBucket[]
}

export interface ChannelModelFault {
  channel_id: number
  model: string
  disabled: boolean
  reason: string
  error_code: string
  status_code: number
  disabled_at: number
  updated_at: number
}

export interface ChannelFault {
  channel_id: number
  channel_name: string
  reason: string
  disabled_at: number
}

export interface SchedulingEvent {
  ts: number
  type: string
  channel_id: number
  channel_name: string
  group: string
  model: string
  priority: number
  message: string
}

export interface ChannelSchedulingOverview {
  strategy: ChannelSchedulingSetting
  generated_at: number
  active_pools: number
  normal_channels: number
  degraded_channels: number
  disabled_models: number
  disabled_channels: number
  inflight: number
  requests: number
  rps: number
  errors: number
  avg_ttft_ms: number
  channels: SchedulingChannel[]
  faults: ChannelModelFault[]
  channel_faults: ChannelFault[]
  events: SchedulingEvent[]
}

export interface SchedulingFilters {
  group: string
  model: string
  priority: string
}
