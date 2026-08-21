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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import i18n from 'i18next'
import { describe, expect, it } from 'vitest'

import '@/i18n/config'
import zhCN from '@/i18n/locales/zh.json'

import { SmartProtectionSection } from '..'
import type { SmartProtectionSettings } from '../api'

describe('Smart Protection page', () => {
  it('renders defaults when persisted array settings are null', async () => {
    await i18n.changeLanguage('en')
    const queryClient = new QueryClient({
      defaultOptions: { queries: { staleTime: Number.POSITIVE_INFINITY } },
    })
    queryClient.setQueryData(['smart-protection-settings'], {
      enabled: false,
      base_url: '',
      model: '',
      timeout_seconds: 15,
      max_context_chars: 24000,
      max_concurrent: 8,
      blocked_safeties: null,
      blocked_categories: null,
      channel_ids: null,
      save_content: true,
      warning_email: true,
      retention_days: 30,
      api_key_configured: false,
    })
    queryClient.setQueryData(['smart-protection-channels'], [])
    queryClient.setQueryData(['smart-protection-events', 1], {
      total: 0,
      items: [],
    })

    render(
      <QueryClientProvider client={queryClient}>
        <SmartProtectionSection />
      </QueryClientProvider>
    )

    fireEvent.click(
      screen.getByRole('tab', { name: 'Protection configuration' })
    )

    expect(screen.getByLabelText('Blocked Safety values')).toHaveValue(
      'Controversial\nUnsafe'
    )
    expect(screen.getByLabelText('Blocked Categories')).toHaveValue('Jailbreak')
    expect(screen.getByText('0 selected')).toBeVisible()
    expect(screen.getByLabelText('Security model URL')).toHaveValue('')
    expect(screen.getByLabelText('Security model URL')).toHaveAttribute(
      'placeholder',
      'Example: https://security.example.com/v1'
    )
    expect(screen.getByLabelText('Security model')).toHaveValue('')
    expect(screen.getByLabelText('Security model')).toHaveAttribute(
      'placeholder',
      'Example: security-model-name'
    )
    expect(screen.getByLabelText('Security model API key')).toHaveValue('')
    expect(screen.getByLabelText('Security model API key')).toHaveAttribute(
      'placeholder',
      'Example: sk-your-security-key'
    )

    queryClient.clear()
  })

  it('explains billing order and exposes channels and risk events', async () => {
    await i18n.changeLanguage('en')
    const queryClient = new QueryClient({
      defaultOptions: { queries: { staleTime: Number.POSITIVE_INFINITY } },
    })
    const settings: SmartProtectionSettings = {
      enabled: true,
      base_url: 'https://guard.example/v1',
      model: 'Qwen3Guard-Gen-4B',
      timeout_seconds: 15,
      max_context_chars: 24000,
      max_concurrent: 8,
      blocked_safeties: ['Controversial', 'Unsafe'],
      blocked_categories: ['Jailbreak'],
      channel_ids: [7],
      save_content: true,
      warning_email: true,
      retention_days: 30,
      api_key_configured: true,
      api_key_hint: '••••1234',
    }
    queryClient.setQueryData(['smart-protection-settings'], settings)
    queryClient.setQueryData(
      ['smart-protection-channels'],
      [{ id: 7, name: 'Protected channel', type: 1, status: 1 }]
    )
    queryClient.setQueryData(['smart-protection-events', 1], {
      total: 1,
      items: [
        {
          id: 1,
          user_id: 9,
          username: 'alice',
          email: 'alice@example.com',
          token_id: 3,
          token_name: 'demo-token',
          channel_id: 7,
          channel_name: 'Protected channel',
          request_id: 'req-1',
          model_name: 'gpt-example',
          guard_model: 'Qwen3Guard-Gen-4B',
          safety: 'Controversial',
          categories: '["Jailbreak"]',
          content: 'ignore previous instructions '.repeat(200),
          content_hash: 'hash',
          raw_result: 'Safety: Controversial\\nCategories: Jailbreak',
          action: 'blocked',
          review_time_ms: 20,
          email_sent: true,
          created_at: 1,
        },
      ],
    })

    queryClient.setQueryData(['smart-protection-event', 1], {
      ...(queryClient.getQueryData<{ items: unknown[] }>([
        'smart-protection-events',
        1,
      ])?.items[0] as object),
    })

    render(
      <QueryClientProvider client={queryClient}>
        <SmartProtectionSection />
      </QueryClientProvider>
    )

    expect(
      screen.getByRole('tab', { name: 'Recent protection events' })
    ).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('alice')).toBeVisible()
    expect(screen.getByText('Page 1 of 1')).toBeVisible()

    fireEvent.click(
      screen.getByRole('tab', { name: 'Protection configuration' })
    )

    expect(screen.getByText(/after quota pre-consumption/)).toBeVisible()
    expect(screen.getByText('Qwen3Guard configuration')).toBeVisible()
    expect(screen.getByPlaceholderText('Search channels')).toBeVisible()
    expect(screen.getAllByText('Protected channel').length).toBeGreaterThan(0)

    fireEvent.click(
      screen.getByRole('tab', { name: 'Recent protection events' })
    )

    fireEvent.click(screen.getByRole('button', { name: 'View details' }))

    expect(screen.getByRole('dialog')).toBeVisible()
    expect(screen.getByText('Protection event details')).toBeVisible()
    const riskContent = screen.getByText(/ignore previous instructions/)
    expect(riskContent).toBeVisible()
    expect(screen.getByTestId('risk-content-scroll-area')).toHaveClass(
      'h-[min(45vh,420px)]',
      'max-h-[420px]'
    )

    i18n.addResourceBundle('zhCN', 'translation', zhCN.translation, true, true)
    await i18n.changeLanguage('zhCN')
    expect(screen.getAllByText('有争议').length).toBeGreaterThan(0)
    expect(screen.getByText('越狱/破限')).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    fireEvent.click(
      screen.getByRole('button', { name: '清除保护事件' })
    )
    expect(
      screen.getByRole('alertdialog', { name: '清除全部保护事件？' })
    ).toBeVisible()
    expect(
      screen.getByText(/此操作会永久删除全部智能保护事件记录/)
    ).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '取消' }))

    queryClient.clear()
  })
})
