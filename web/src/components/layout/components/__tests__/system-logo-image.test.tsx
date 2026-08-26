/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { SystemLogoImage } from '../system-logo-image'

describe('SystemLogoImage', () => {
  it('renders raster logos as images without changing their colors', () => {
    render(<SystemLogoImage src='/logo.png' alt='Brand logo' />)

    const logo = screen.getByRole('img', { name: 'Brand logo' })
    expect(logo.tagName).toBe('IMG')
    expect(logo).toHaveAttribute('src', '/logo.png')
  })

  it('renders uploaded SVG logos with the theme logo color variable', () => {
    render(<SystemLogoImage src='/api/logo?v=1&format=svg' alt='Brand logo' />)

    const logo = screen.getByRole('img', { name: 'Brand logo' })
    expect(logo.tagName).toBe('SPAN')
    expect(logo).toHaveStyle({
      backgroundColor: 'var(--logo-color, var(--foreground))',
      maskImage: 'url("/api/logo?v=1&format=svg")',
    })
  })
})
