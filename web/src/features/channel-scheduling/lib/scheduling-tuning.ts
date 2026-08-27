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
export const recommendedTuning = {
  minimum_factor: 0.2,
  maximum_factor: 1.5,
  performance_exponent: 0.5,
  inflight_penalty: 0.25,
  warmup_samples: 5,
  sample_window_size: 20,
  sample_max_age_minutes: 15,
  severe_ttft_ms: 60000,
  failure_threshold: 5,
  failure_window_seconds: 60,
  auto_recovery_interval_seconds: 60,
  max_attempts: 8,
  realtime_retention_minutes: 60,
} as const

export const tuningSections = [
  {
    title: 'Traffic distribution',
    description:
      'These values control how recent speed and current concurrency change traffic inside the active priority tier.',
    fields: [
      {
        name: 'minimum_factor',
        label: 'Minimum traffic factor',
        description:
          'A slow but successful channel keeps at least 20% of baseline traffic and is not disabled for slowness.',
        step: 0.01,
        min: 0.01,
        max: 1,
      },
      {
        name: 'maximum_factor',
        label: 'Maximum traffic factor',
        description:
          'The fastest channel can receive at most 1.5 times the equal baseline traffic.',
        step: 0.1,
        min: 1,
        max: 10,
      },
      {
        name: 'performance_exponent',
        label: 'Speed sensitivity',
        description:
          'Controls how strongly TTFT differences affect traffic. 0.5 is balanced; higher values amplify the difference.',
        step: 0.01,
        min: 0.01,
        max: 4,
      },
      {
        name: 'inflight_penalty',
        label: 'Concurrent request penalty',
        description:
          'Temporarily reduces traffic to channels with more active requests. The reduction disappears when requests finish.',
        step: 0.01,
        min: 0,
        max: 10,
      },
    ],
  },
  {
    title: 'Recent sample window',
    description:
      'Only successful upstream TTFT samples are used. Client download speed after the gateway receives the first content is not included.',
    fields: [
      {
        name: 'warmup_samples',
        label: 'Minimum evidence samples',
        description:
          'The first 5 samples adjust traffic gradually so one ordinary outlier cannot dominate. A 60-second severe sample is still applied immediately.',
        step: 1,
        min: 1,
        max: 10000,
      },
      {
        name: 'sample_window_size',
        label: 'Samples per channel',
        description:
          'Uses the median of at most the latest 20 successful TTFT samples for each group, model, priority, and channel.',
        step: 1,
        min: 1,
        max: 1000,
      },
      {
        name: 'sample_max_age_minutes',
        label: 'Sample lifetime (minutes)',
        description:
          'Samples older than 15 minutes expire automatically. A channel with no recent samples returns to neutral traffic.',
        step: 1,
        min: 1,
        max: 1440,
      },
      {
        name: 'severe_ttft_ms',
        label: 'Severe TTFT threshold (ms)',
        description:
          'One successful TTFT at or above 60 seconds immediately drops the channel to minimum traffic, but does not disable it. A later normal result begins recovery.',
        step: 1000,
        min: 1000,
        max: 86400000,
      },
    ],
  },
  {
    title: 'Failure protection',
    description:
      'A channel is isolated only after repeated consecutive upstream failures. Any successful request resets the failure count.',
    fields: [
      {
        name: 'failure_threshold',
        label: 'Consecutive failures before isolation',
        description:
          'Wait for 5 consecutive upstream failures before automatically disabling a channel. The last available channel is always kept online.',
        step: 1,
        min: 1,
        max: 100,
      },
      {
        name: 'failure_window_seconds',
        label: 'Failure window (seconds)',
        description:
          'Only consecutive failures no more than 60 seconds apart belong to the same streak. A longer gap starts counting again.',
        step: 1,
        min: 1,
        max: 3600,
      },
      {
        name: 'auto_recovery_interval_seconds',
        label: 'Recovery interval (seconds)',
        description:
          'How frequently the system checks auto-disabled channels for recovery',
        step: 1,
        min: 5,
        max: 86400,
      },
    ],
  },
  {
    title: 'Retries and monitoring',
    description:
      'These values affect retry breadth and dashboard history, not the TTFT median itself.',
    fields: [
      {
        name: 'max_attempts',
        label: 'Maximum channels attempted per request',
        description:
          'When an upstream attempt fails, one user request can try at most 8 different channels. It stops as soon as one succeeds.',
        step: 1,
        min: 1,
        max: 64,
      },
      {
        name: 'realtime_retention_minutes',
        label: 'Dashboard history (minutes)',
        description:
          'Keeps 60 minutes of real-time chart data and inactive pools. It does not change the number of TTFT samples.',
        step: 1,
        min: 1,
        max: 1440,
      },
    ],
  },
] as const
