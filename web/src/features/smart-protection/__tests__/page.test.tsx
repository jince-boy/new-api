/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from 'i18next'
import { describe, expect, it, vi } from 'vitest'

import '@/i18n/config'

import { SmartProtectionSection } from '..'
import * as smartProtectionApi from '../api'
import type { SmartProtectionSettings } from '../api'

function renderPage(
  settings: SmartProtectionSettings & { api_key?: string },
  withEvent = false
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: Number.POSITIVE_INFINITY } },
  })
  queryClient.setQueryData(['smart-protection-settings'], settings)
  queryClient.setQueryData(
    ['smart-protection-channels'],
    [{ id: 7, name: 'Protected channel', type: 1, status: 1 }]
  )
  const event = {
    id: 1,
    user_id: 9,
    username: 'alice',
    email: 'alice@example.com',
    user_status: 1,
    token_id: 3,
    token_name: 'demo-token',
    channel_id: 7,
    channel_name: 'Protected channel',
    request_id: 'req-1',
    model_name: 'gpt-example',
    guard_model: 'guard',
    safety: 'Controversial',
    categories: '["Jailbreak"]',
    content: 'risk content',
    content_hash: 'hash',
    raw_result: 'result',
    action: 'blocked',
    review_time_ms: 20,
    email_sent: true,
    email_status: 'sent',
    created_at: 1,
  }
  queryClient.setQueryData(['smart-protection-events', 1, 10, '', '', ''], {
    total: withEvent ? 25 : 0,
    items: withEvent ? [event] : [],
    page: 1,
    page_size: 10,
  })
  queryClient.setQueryData(['smart-protection-events', 2, 10, '', '', ''], {
    total: withEvent ? 25 : 0,
    items: withEvent ? [{ ...event, id: 2, username: 'page-two' }] : [],
    page: 2,
    page_size: 10,
  })
  queryClient.setQueryData(['smart-protection-event', 1], event)
  render(
    <QueryClientProvider client={queryClient}>
      <SmartProtectionSection />
    </QueryClientProvider>
  )
  return queryClient
}

const settings: SmartProtectionSettings = {
  enabled: true,
  base_url: 'https://guard.example/v1',
  model: 'guard',
  timeout_seconds: 15,
  max_context_chars: 24000,
  max_concurrent: 8,
  blocked_rules: [
    {
      id: 'rule-1',
      name: 'Notify only',
      safety: 'Controversial',
      categories: ['Jailbreak'],
      match_mode: 'all',
      send_email: true,
      record: true,
      block: false,
      email_template_id: 'template-1',
      actions_configured: true,
    },
  ],
  channel_ids: [7],
  save_content: true,
  warning_email: true,
  email_cooldown_minutes: 30,
  email_rules: [
    {
      id: 'template-1',
      name: 'Warning',
      subject: 'Security warning',
      body: '<p>{{request_id}}</p>',
      enabled: true,
    },
  ],
  retention_days: 30,
  api_key_configured: true,
  api_key_hint: '••••1234',
}

describe('Smart Protection page', () => {
  it('mounts only the active tab and keeps provider configuration usable', async () => {
    await i18n.changeLanguage('en')
    const queryClient = renderPage(settings)

    expect(
      screen.queryByLabelText('Security model URL')
    ).not.toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('tab', { name: 'Protection configuration' })
    )
    expect(screen.getByLabelText('Security model URL')).toHaveValue(
      'https://guard.example/v1'
    )
    expect(screen.getByPlaceholderText('Search channels')).toBeVisible()
    expect(
      screen.getByLabelText('Warning email cooldown (minutes)')
    ).toHaveValue(30)
    expect(screen.getByText('Leave empty to keep existing key')).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Refresh' })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText('No protection events yet')
    ).not.toBeInTheDocument()

    queryClient.clear()
  })

  it('toggles a protected channel by clicking its text without navigation', async () => {
    await i18n.changeLanguage('en')
    const queryClient = renderPage(settings)

    fireEvent.click(
      screen.getByRole('tab', { name: 'Protection configuration' })
    )
    const checkbox = screen.getByRole('checkbox', {
      name: '#7 Protected channel',
    })
    expect(checkbox).toBeChecked()

    fireEvent.click(screen.getByText('#7 Protected channel'))
    expect(checkbox).not.toBeChecked()

    fireEvent.click(screen.getByText('#7 Protected channel'))
    expect(checkbox).toBeChecked()

    queryClient.clear()
  })

  it('does not send the masked empty API key on a later save', async () => {
    await i18n.changeLanguage('en')
    const saveSpy = vi
      .spyOn(smartProtectionApi, 'updateSmartProtectionSettings')
      .mockResolvedValue(settings)
    const queryClient = renderPage({ ...settings, api_key: '' })

    fireEvent.click(
      screen.getByRole('tab', { name: 'Protection configuration' })
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Save smart protection settings' })
    )

    await waitFor(() => expect(saveSpy).toHaveBeenCalledOnce())
    expect(saveSpy.mock.calls[0][0]).not.toHaveProperty('api_key', '')

    queryClient.clear()
  })

  it('separates templates from conditions and exposes independent rule actions', async () => {
    await i18n.changeLanguage('en')
    const queryClient = renderPage(settings, true)

    const eventRow = screen.getByText('alice').closest('tr')
    expect(eventRow).not.toBeNull()
    expect(
      within(eventRow as HTMLElement).getByText('Protected channel')
    ).toBeVisible()
    expect(
      within(eventRow as HTMLElement).getByText('gpt-example')
    ).toBeVisible()
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeVisible()

    fireEvent.click(
      screen.getByRole('tab', { name: 'Warning email templates' })
    )
    expect(screen.getByDisplayValue('Warning')).toBeVisible()
    expect(screen.getByDisplayValue('Security warning')).toBeVisible()
    expect(screen.queryByText('Any selected condition')).not.toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('tab', { name: 'Protection matching rules' })
    )
    expect(screen.getByDisplayValue('Notify only')).toBeVisible()
    expect(screen.getByText('Record event')).toBeVisible()
    expect(screen.getByText('Send email')).toBeVisible()
    expect(screen.getByText('Block request')).toBeVisible()
    expect(screen.getByText('Any selected condition')).toBeVisible()
    expect(screen.getByText('All selected conditions')).toBeVisible()
    expect(screen.getByRole('combobox')).toHaveTextContent('Warning')

    fireEvent.click(
      screen.getByRole('tab', { name: 'Recent protection events' })
    )
    expect(screen.getByRole('button', { name: 'Go to page 2' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Go to page 2' }))
    expect(await screen.findByText('page-two')).toBeVisible()

    queryClient.clear()
  })

  it('opens the selected protection event details', async () => {
    await i18n.changeLanguage('en')
    const queryClient = renderPage(settings, true)

    fireEvent.click(screen.getByRole('button', { name: 'View details' }))

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toBeVisible()
    expect(dialog).toHaveTextContent('req-1')
    expect(await screen.findByDisplayValue('risk content')).toBeVisible()

    queryClient.clear()
  })

  it('filters protection events by username safety and category', async () => {
    await i18n.changeLanguage('en')
    const searchSpy = vi
      .spyOn(smartProtectionApi, 'getSmartProtectionEvents')
      .mockResolvedValue({ total: 0, items: [], page: 1, page_size: 10 })
    const queryClient = renderPage(settings, true)
    const user = userEvent.setup()

    fireEvent.change(screen.getByPlaceholderText('Search by username'), {
      target: { value: 'alice' },
    })
    await user.click(screen.getAllByText('Any safety level')[0])
    await user.click(await screen.findByRole('option', { name: 'Unsafe' }))
    await user.click(screen.getAllByText('Any category')[0])
    await user.click(await screen.findByRole('option', { name: 'Jailbreak' }))
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))

    await waitFor(() =>
      expect(searchSpy).toHaveBeenCalledWith(
        1,
        10,
        '',
        'alice',
        'Unsafe',
        'Jailbreak'
      )
    )

    queryClient.clear()
  })

  it('clears protection events after confirmation', async () => {
    await i18n.changeLanguage('en')
    const clearSpy = vi
      .spyOn(smartProtectionApi, 'clearSmartProtectionEvents')
      .mockResolvedValue({ deleted: 25 })
    vi.spyOn(smartProtectionApi, 'getSmartProtectionEvents').mockResolvedValue({
      total: 0,
      items: null as never,
      page: 1,
      page_size: 10,
    })
    const queryClient = renderPage(settings, true)

    fireEvent.click(
      screen.getByRole('button', { name: 'Clear protection events' })
    )

    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toBeVisible()
    expect(dialog).toHaveTextContent('Clear all protection events?')
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Clear protection events' })
    )

    await waitFor(() => expect(clearSpy).toHaveBeenCalledOnce())
    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    )
    expect(await screen.findByText('No protection events yet')).toBeVisible()

    queryClient.clear()
  })
})
