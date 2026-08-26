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
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useAuthStore } from '@/stores/auth-store'

import { OnboardingTour } from '../components/onboarding-tour'
import { getOnboardingTourStorageKey } from '../lib/tour-storage'

const storageData = new Map<string, string>()
const localStorageMock: Storage = {
  get length() {
    return storageData.size
  },
  clear: () => storageData.clear(),
  getItem: (key) => storageData.get(key) ?? null,
  key: (index) => [...storageData.keys()][index] ?? null,
  removeItem: (key) => storageData.delete(key),
  setItem: (key, value) => storageData.set(key, value),
}

Object.defineProperty(window, 'localStorage', {
  configurable: true,
  value: localStorageMock,
})

function addTargets(ids: string[]) {
  for (const id of ids) {
    const element = document.createElement('button')
    element.dataset.tour = id
    element.textContent = id
    document.body.append(element)
  }
}

describe('OnboardingTour', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    window.localStorage.clear()
    useAuthStore.setState((state) => ({
      ...state,
      auth: {
        ...state.auth,
        user: { id: 42, username: 'test', role: 1 },
      },
    }))
  })

  afterEach(() => {
    vi.useRealTimers()
    cleanup()
    for (const target of document.querySelectorAll('[data-tour]')) {
      target.remove()
    }
  })

  it('opens automatically for a new user and advances through steps', async () => {
    addTargets(['wallet', 'api-keys', 'dashboard', 'playground'])
    render(<OnboardingTour />)

    await act(async () => vi.advanceTimersByTimeAsync(250))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Wallet' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(
      screen.getByRole('heading', { name: 'Create API Key' })
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }))
    expect(screen.getByRole('heading', { name: 'Wallet' })).toBeInTheDocument()
  })

  it('does not open automatically after the version is completed', async () => {
    window.localStorage.setItem(getOnboardingTourStorageKey(42), 'completed')
    render(<OnboardingTour />)

    await act(async () => vi.advanceTimersByTimeAsync(250))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('does not open for administrators', async () => {
    useAuthStore.setState((state) => ({
      ...state,
      auth: {
        ...state.auth,
        user: { id: 42, username: 'admin', role: 10 },
      },
    }))
    render(<OnboardingTour open />)

    await act(async () => vi.advanceTimersByTimeAsync(250))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('records skip and can be reopened through the controlled prop', async () => {
    const { rerender } = render(<OnboardingTour open />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Skip tour' }))
    expect(window.localStorage.getItem(getOnboardingTourStorageKey(42))).toBe(
      'completed'
    )

    rerender(<OnboardingTour open={false} />)
    rerender(<OnboardingTour open />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('closes with Escape and falls back to a centered card when a target is missing', async () => {
    render(<OnboardingTour open />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(window.localStorage.getItem(getOnboardingTourStorageKey(42))).toBe(
      'completed'
    )
  })
})
