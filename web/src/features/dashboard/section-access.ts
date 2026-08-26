import { ROLE } from '@/lib/roles'

const ADMIN_ONLY_SECTIONS = new Set<string>(['flow', 'users'])

export function isDashboardSectionAccessible(
  section: string,
  userRole?: number
): boolean {
  if (!ADMIN_ONLY_SECTIONS.has(section)) return true
  return (userRole ?? ROLE.GUEST) >= ROLE.ADMIN
}
