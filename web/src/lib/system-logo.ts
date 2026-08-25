/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/

import { DEFAULT_LOGO } from '@/lib/constants'

export type SystemLogoConfig = {
  logo: string
  logoLight: string
  logoDark: string
}

export function resolveSystemLogo(
  config: SystemLogoConfig,
  resolvedTheme: 'light' | 'dark'
): string {
  const themeLogo =
    resolvedTheme === 'dark' ? config.logoDark : config.logoLight
  return (
    themeLogo ||
    config.logoLight ||
    config.logoDark ||
    config.logo ||
    DEFAULT_LOGO
  )
}
