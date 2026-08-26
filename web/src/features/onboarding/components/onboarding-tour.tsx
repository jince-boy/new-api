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
import { ArrowLeft, ArrowRight, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

import {
  getTourCardPosition,
  getTourSpotlightBounds,
  getTourTarget,
  getTourTargetRect,
  keepTourTargetVisible,
  type TourPosition,
} from '../lib/tour-position'
import {
  hasCompletedOnboardingTour,
  markOnboardingTourCompleted,
} from '../lib/tour-storage'

type TourStep = {
  id: string
  title: string
  description: string
}

type OnboardingTourProps = {
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function OnboardingTour(props: OnboardingTourProps) {
  const { t } = useTranslation()
  const user = useAuthStore((state) => state.auth.user)
  const userId = user?.id
  const isEligible = user?.role === ROLE.USER
  const onOpenChange = props.onOpenChange
  const [isOpen, setIsOpen] = useState(false)
  const [stepIndex, setStepIndex] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [position, setPosition] = useState<TourPosition | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)

  const steps = useMemo<TourStep[]>(() => {
    const items: TourStep[] = [
      {
        id: 'wallet',
        title: t('Wallet'),
        description: t('Add credits and review your balance here.'),
      },
      {
        id: 'api-keys',
        title: t('Create API Key'),
        description: t('Create an API key and choose its group for routing.'),
      },
      {
        id: 'dashboard',
        title: t('Dashboard'),
        description: t('Review usage trends and account metrics here.'),
      },
      {
        id: 'playground',
        title: t('Preview'),
        description: t(
          'Try a model in the preview playground before integrating it.'
        ),
      },
    ]
    return items
  }, [t])

  const close = () => {
    if (userId != null) markOnboardingTourCompleted(userId)
    setIsOpen(false)
    props.onOpenChange?.(false)
  }

  useEffect(() => {
    if (!isEligible || props.open === undefined) return
    if (props.open) setStepIndex(0)
    setIsOpen(props.open)
  }, [isEligible, props.open])

  useEffect(() => {
    if (!isEligible || userId == null || hasCompletedOnboardingTour(userId)) {
      return
    }
    const timer = window.setTimeout(() => {
      setStepIndex(0)
      setIsOpen(true)
      onOpenChange?.(true)
    }, 250)
    return () => window.clearTimeout(timer)
  }, [isEligible, onOpenChange, userId])

  useEffect(() => {
    if (!isOpen) return
    const update = () => {
      const target = getTourTarget(steps[stepIndex]?.id ?? '')
      if (target) keepTourTargetVisible(target)
      const nextRect = getTourTargetRect(steps[stepIndex]?.id ?? '')
      setRect(nextRect)
      setPosition(target ? getTourCardPosition(target, cardRef.current) : null)
    }
    update()
    const observer = new MutationObserver(update)
    observer.observe(document.body, { childList: true, subtree: true })
    const resizeObserver = new ResizeObserver(update)
    const target = getTourTarget(steps[stepIndex]?.id ?? '')
    if (target) resizeObserver.observe(target)
    if (cardRef.current) resizeObserver.observe(cardRef.current)
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    let frame = 0
    const refreshAfterLayout = () => {
      update()
      frame += 1
      if (frame < 6) requestAnimationFrame(refreshAfterLayout)
    }
    requestAnimationFrame(refreshAfterLayout)
    return () => {
      observer.disconnect()
      resizeObserver.disconnect()
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [isOpen, stepIndex, steps])

  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  })

  if (
    !isEligible ||
    !isOpen ||
    typeof document === 'undefined' ||
    steps.length === 0
  ) {
    return null
  }

  const step = steps[stepIndex]
  const hasTarget = rect != null && rect.width > 0 && rect.height > 0
  const cardStyle =
    hasTarget && position
      ? position
      : { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
  const spotlight = hasTarget ? getTourSpotlightBounds(rect) : null

  return createPortal(
    <div
      className='text-foreground fixed inset-0 z-[100]'
      role='dialog'
      aria-modal='true'
      aria-labelledby='onboarding-tour-title'
    >
      {!hasTarget && <div className='absolute inset-0 bg-black/60' />}
      {hasTarget && spotlight != null && (
        <>
          <div
            className='pointer-events-auto absolute inset-x-0 top-0 bg-black/60'
            style={{ height: spotlight.top }}
          />
          <div
            className='pointer-events-auto absolute inset-x-0 bottom-0 bg-black/60'
            style={{ top: spotlight.bottom }}
          />
          <div
            className='pointer-events-auto absolute left-0 bg-black/60'
            style={{
              top: spotlight.top,
              bottom: window.innerHeight - spotlight.bottom,
              width: spotlight.left,
            }}
          />
          <div
            className='pointer-events-auto absolute right-0 bg-black/60'
            style={{
              top: spotlight.top,
              bottom: window.innerHeight - spotlight.bottom,
              width: window.innerWidth - spotlight.right,
            }}
          />
          <div
            className='ring-primary pointer-events-none absolute rounded-md ring-2 ring-offset-2 ring-offset-transparent transition-all duration-200'
            style={{
              top: spotlight.top,
              left: spotlight.left,
              width: spotlight.right - spotlight.left,
              height: spotlight.bottom - spotlight.top,
            }}
          />
        </>
      )}
      <div
        ref={cardRef}
        className='bg-popover absolute z-10 w-[min(22rem,calc(100vw-2rem))] rounded-xl border p-5 shadow-2xl'
        style={cardStyle}
      >
        <div className='flex items-start justify-between gap-4'>
          <div>
            <p className='text-muted-foreground mb-1 text-xs font-medium tracking-wider uppercase'>
              {t('Product tour')}
            </p>
            <h2 id='onboarding-tour-title' className='text-base font-semibold'>
              {step.title}
            </h2>
          </div>
          <Button
            variant='ghost'
            size='icon-sm'
            onClick={close}
            aria-label={t('Close')}
            autoFocus
          >
            <X />
          </Button>
        </div>
        <p className='text-muted-foreground mt-3 text-sm leading-relaxed'>
          {step.description}
        </p>
        <p className='text-muted-foreground mt-4 text-xs'>
          {t('Step {{current}} of {{total}}', {
            current: stepIndex + 1,
            total: steps.length,
          })}
        </p>
        <div className='mt-4 flex items-center justify-between gap-2'>
          <Button variant='ghost' size='sm' onClick={close}>
            {t('Skip tour')}
          </Button>
          <div className='flex items-center gap-2'>
            <Button
              variant='outline'
              size='sm'
              onClick={() => setStepIndex((index) => index - 1)}
              disabled={stepIndex === 0}
            >
              <ArrowLeft data-icon='inline-start' />
              {t('Previous')}
            </Button>
            <Button
              size='sm'
              onClick={() =>
                stepIndex === steps.length - 1
                  ? close()
                  : setStepIndex((index) => index + 1)
              }
            >
              {stepIndex === steps.length - 1 ? t('Finish') : t('Next')}
              <ArrowRight data-icon='inline-end' />
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
