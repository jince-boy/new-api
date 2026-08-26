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
import {
  getTourCardPosition,
  getTourSpotlightBounds,
  getTourTarget,
  getTourTargetRect,
  keepTourTargetVisible,
  type TourPosition,
} from '@/features/onboarding/lib/tour-position'
import {
  hasCompletedApiKeyTour,
  markApiKeyTourCompleted,
} from '@/features/onboarding/lib/tour-storage'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

import { useApiKeys } from './api-keys-provider'

type ApiKeyTourStep = {
  id: string
  title: string
  description: string
}

type ApiKeysTourProps = {
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function ApiKeysTour(props: ApiKeysTourProps) {
  const { t } = useTranslation()
  const user = useAuthStore((state) => state.auth.user)
  const { setOpen, mutateDrawerOpenComplete, setMutateDrawerOpenComplete } =
    useApiKeys()
  const userId = user?.id
  const isEligible = user?.role === ROLE.USER
  const onOpenChange = props.onOpenChange
  const [isOpen, setIsOpen] = useState(false)
  const [stepIndex, setStepIndex] = useState(0)
  const [pendingStepIndex, setPendingStepIndex] = useState<number | null>(null)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [position, setPosition] = useState<TourPosition | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const steps = useMemo<ApiKeyTourStep[]>(
    () => [
      {
        id: 'api-key-create',
        title: t('Create API Key'),
        description: t('Open the form to create a key for an application.'),
      },
      {
        id: 'api-key-name',
        title: t('Name'),
        description: t('Use a clear name so you can identify this key later.'),
      },
      {
        id: 'api-key-group',
        title: t('Group'),
        description: t(
          'Choose the group that will route requests made with this key.'
        ),
      },
      {
        id: 'api-key-quota',
        title: t('Quota Settings'),
        description: t(
          'Set a quota or enable unlimited quota, then save the key.'
        ),
      },
    ],
    [t]
  )

  const close = () => {
    if (userId != null) markApiKeyTourCompleted(userId)
    setPendingStepIndex(null)
    setIsOpen(false)
    onOpenChange?.(false)
  }

  useEffect(() => {
    if (!isEligible || props.open === undefined) return
    if (props.open) {
      setStepIndex(0)
      setPendingStepIndex(null)
    }
    setIsOpen(props.open)
  }, [isEligible, props.open])

  useEffect(() => {
    if (!isEligible || userId == null || hasCompletedApiKeyTour(userId)) return
    const timer = window.setTimeout(() => {
      setStepIndex(0)
      setPendingStepIndex(null)
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
      setRect(getTourTargetRect(steps[stepIndex]?.id ?? ''))
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
    if (!isOpen || pendingStepIndex == null || !mutateDrawerOpenComplete) return
    const targetId = steps[pendingStepIndex]?.id
    if (!targetId) return

    const advanceWhenTargetExists = () => {
      const target = getTourTarget(targetId)
      const targetRect = target?.getBoundingClientRect()
      if (
        !target ||
        !targetRect ||
        targetRect.width <= 0 ||
        targetRect.height <= 0
      ) {
        return false
      }
      setStepIndex(pendingStepIndex)
      setPendingStepIndex(null)
      return true
    }

    if (advanceWhenTargetExists()) return
    const observer = new MutationObserver(advanceWhenTargetExists)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [isOpen, mutateDrawerOpenComplete, pendingStepIndex, steps])

  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  })

  if (!isEligible || !isOpen || typeof document === 'undefined') return null

  const step = steps[stepIndex]
  const hasTarget = rect != null && rect.width > 0 && rect.height > 0
  const cardStyle =
    hasTarget && position
      ? position
      : { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
  const spotlight = hasTarget ? getTourSpotlightBounds(rect) : null

  const next = () => {
    if (stepIndex === steps.length - 1) {
      close()
      return
    }
    if (stepIndex === 0) {
      setRect(null)
      setPosition(null)
      setMutateDrawerOpenComplete(false)
      setOpen('create')
      setPendingStepIndex(1)
      return
    }
    setStepIndex((index) => index + 1)
  }

  const previous = () => {
    if (stepIndex === 1) setOpen(null)
    setPendingStepIndex(null)
    setStepIndex((index) => index - 1)
  }

  return createPortal(
    <div
      className='text-foreground fixed inset-0 z-[100]'
      role='dialog'
      aria-modal='true'
      aria-labelledby='api-key-tour-title'
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
              {t('API key guide')}
            </p>
            <h2 id='api-key-tour-title' className='text-base font-semibold'>
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
              onClick={previous}
              disabled={stepIndex === 0}
            >
              <ArrowLeft data-icon='inline-start' />
              {t('Previous')}
            </Button>
            <Button size='sm' onClick={next}>
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
