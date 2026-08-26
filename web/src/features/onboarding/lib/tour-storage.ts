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
export const ONBOARDING_TOUR_VERSION = 2
export const API_KEY_TOUR_VERSION = 1

export function getOnboardingTourStorageKey(userId: number): string {
  return `onboarding-tour:${ONBOARDING_TOUR_VERSION}:${userId}`
}

export function hasCompletedOnboardingTour(userId: number): boolean {
  if (typeof window === 'undefined') return false
  try {
    return (
      window.localStorage.getItem(getOnboardingTourStorageKey(userId)) ===
      'completed'
    )
  } catch {
    return false
  }
}

export function markOnboardingTourCompleted(userId: number): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(
      getOnboardingTourStorageKey(userId),
      'completed'
    )
  } catch {
    // Storage is optional; the tour remains usable for this session.
  }
}

export function getApiKeyTourStorageKey(userId: number): string {
  return `api-key-tour:${API_KEY_TOUR_VERSION}:${userId}`
}

export function hasCompletedApiKeyTour(userId: number): boolean {
  if (typeof window === 'undefined') return false
  try {
    return (
      window.localStorage.getItem(getApiKeyTourStorageKey(userId)) ===
      'completed'
    )
  } catch {
    return false
  }
}

export function markApiKeyTourCompleted(userId: number): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(getApiKeyTourStorageKey(userId), 'completed')
  } catch {
    // Storage is optional; the tour remains usable for this session.
  }
}
