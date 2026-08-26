/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/

import { cn } from '@/lib/utils'

interface SystemLogoImageProps {
  src: string
  alt: string
  className?: string
}

function isSvgLogoSource(src: string): boolean {
  try {
    const url = new URL(src, window.location.origin)
    return (
      url.pathname.toLowerCase().endsWith('.svg') ||
      url.searchParams.get('format') === 'svg'
    )
  } catch {
    return src.toLowerCase().endsWith('.svg')
  }
}

/** Renders SVG logos as a theme-colored mask while preserving raster logos. */
export function SystemLogoImage(props: SystemLogoImageProps) {
  if (!isSvgLogoSource(props.src)) {
    return <img src={props.src} alt={props.alt} className={props.className} />
  }

  return (
    <span
      role='img'
      aria-label={props.alt}
      className={cn('bg-foreground inline-block', props.className)}
      style={{
        maskImage: `url("${props.src}")`,
        maskPosition: 'center',
        maskRepeat: 'no-repeat',
        maskSize: 'contain',
        WebkitMaskImage: `url("${props.src}")`,
        WebkitMaskPosition: 'center',
        WebkitMaskRepeat: 'no-repeat',
        WebkitMaskSize: 'contain',
        backgroundColor: 'var(--logo-color, var(--foreground))',
      }}
    />
  )
}
