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

import { getApiKeyTourStorageKey } from '@/features/onboarding/lib/tour-storage'
import { useAuthStore } from '@/stores/auth-store'

import { ApiKeysProvider, useApiKeys } from '../api-keys-provider'
import { ApiKeysTour } from '../api-keys-tour'

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
    element.getBoundingClientRect = () =>
      ({
        x: 400,
        y: 120,
        top: 120,
        right: 800,
        bottom: 160,
        left: 400,
        width: 400,
        height: 40,
        toJSON: () => ({}),
      }) as DOMRect
    document.body.append(element)
  }
}

function renderTour(props: { open?: boolean } = {}) {
  return render(
    <ApiKeysProvider>
      <ApiKeysTour {...props} />
      <CompleteState />
    </ApiKeysProvider>
  )
}

function OpenState() {
  const { open } = useApiKeys()
  return <output data-testid='dialog-state'>{open ?? 'closed'}</output>
}

function CompleteState() {
  const { setMutateDrawerOpenComplete } = useApiKeys()
  return (
    <button
      type='button'
      data-testid='complete-drawer-open'
      onClick={() => setMutateDrawerOpenComplete(true)}
    >
      Mark drawer open complete
    </button>
  )
}

describe('ApiKeysTour', () => {
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

  it('opens for a new user and explains naming then group selection', async () => {
    addTargets(['api-key-create'])
    renderTour()

    await act(async () => vi.advanceTimersByTimeAsync(250))
    expect(
      screen.getByRole('heading', { name: 'Create API Key' })
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(
      screen.getByRole('heading', { name: 'Create API Key' })
    ).toBeInTheDocument()

    addTargets(['api-key-name', 'api-key-group', 'api-key-quota'])
    await act(async () => vi.advanceTimersByTimeAsync(500))
    expect(
      screen.getByRole('heading', { name: 'Create API Key' })
    ).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('complete-drawer-open'))
    expect(screen.getByRole('heading', { name: 'Name' })).toBeInTheDocument()
  })

  it('does not open automatically after completion', async () => {
    window.localStorage.setItem(getApiKeyTourStorageKey(42), 'completed')
    renderTour()

    await act(async () => vi.advanceTimersByTimeAsync(250))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens the create form when advancing from the first step', () => {
    addTargets(['api-key-create'])
    render(
      <ApiKeysProvider>
        <ApiKeysTour open />
        <OpenState />
        <CompleteState />
      </ApiKeysProvider>
    )

    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByTestId('dialog-state')).toHaveTextContent('create')
  })

  it('does not open for administrators', async () => {
    useAuthStore.setState((state) => ({
      ...state,
      auth: {
        ...state.auth,
        user: { id: 42, username: 'admin', role: 10 },
      },
    }))
    renderTour({ open: true })

    await act(async () => vi.advanceTimersByTimeAsync(250))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
