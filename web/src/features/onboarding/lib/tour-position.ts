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
export type TourPosition = {
  top: number
  left: number
}

export type TourSpotlightBounds = {
  top: number
  left: number
  right: number
  bottom: number
}

const TOUR_GAP = 16
const TOUR_MARGIN = 16
const FALLBACK_CARD_WIDTH = 352
const FALLBACK_CARD_HEIGHT = 220

export function getTourTarget(id: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-tour="${id}"]`)
}

export function getTourTargetRect(id: string): DOMRect | null {
  return getTourTarget(id)?.getBoundingClientRect() ?? null
}

export function getTourSpotlightBounds(rect: DOMRect): TourSpotlightBounds {
  return {
    top: Math.max(0, rect.top - 4),
    left: Math.max(0, rect.left - 4),
    right: Math.min(window.innerWidth, rect.right + 4),
    bottom: Math.min(window.innerHeight, rect.bottom + 4),
  }
}

export function keepTourTargetVisible(target: HTMLElement): void {
  const rect = target.getBoundingClientRect()
  const isOutside =
    rect.top < TOUR_MARGIN || rect.bottom > window.innerHeight - TOUR_MARGIN
  if (isOutside) {
    target.scrollIntoView({
      block: 'center',
      inline: 'nearest',
      behavior: 'smooth',
    })
  }
}

export function getTourCardPosition(
  target: HTMLElement,
  card: HTMLElement | null
): TourPosition | null {
  const rect = target.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return null

  const cardWidth = card?.offsetWidth || FALLBACK_CARD_WIDTH
  const cardHeight = card?.offsetHeight || FALLBACK_CARD_HEIGHT
  const maxLeft = Math.max(
    TOUR_MARGIN,
    window.innerWidth - cardWidth - TOUR_MARGIN
  )
  const maxTop = Math.max(
    TOUR_MARGIN,
    window.innerHeight - cardHeight - TOUR_MARGIN
  )
  const candidates: TourPosition[] = [
    { top: rect.top, left: rect.right + TOUR_GAP },
    { top: rect.top, left: rect.left - cardWidth - TOUR_GAP },
    { top: rect.bottom + TOUR_GAP, left: rect.left },
    { top: rect.top - cardHeight - TOUR_GAP, left: rect.left },
  ]

  const fits = (position: TourPosition) =>
    position.left >= TOUR_MARGIN &&
    position.top >= TOUR_MARGIN &&
    position.left <= maxLeft &&
    position.top <= maxTop
  const preferred = candidates.find(fits) ?? candidates[0]

  return {
    top: Math.min(maxTop, Math.max(TOUR_MARGIN, preferred.top)),
    left: Math.min(maxLeft, Math.max(TOUR_MARGIN, preferred.left)),
  }
}
