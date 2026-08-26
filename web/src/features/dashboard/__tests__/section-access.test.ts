import { describe, expect, it } from 'vitest'

import { ROLE } from '@/lib/roles'

import { isDashboardSectionAccessible } from '../section-access'

describe('isDashboardSectionAccessible', () => {
  it('denies the flow section to regular users', () => {
    expect(isDashboardSectionAccessible('flow', ROLE.USER)).toBe(false)
  })

  it('allows the flow section to administrators', () => {
    expect(isDashboardSectionAccessible('flow', ROLE.ADMIN)).toBe(true)
  })
})
