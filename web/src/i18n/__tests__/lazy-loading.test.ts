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
import { createInstance } from 'i18next'
import { beforeAll, describe, expect, it } from 'vitest'

import { localeBackend } from '../config'

const locales = [
  ['en', () => import('../locales/en.json')],
  ['zhCN', () => import('../locales/zh.json')],
  ['zhTW', () => import('../locales/zh-TW.json')],
  ['fr', () => import('../locales/fr.json')],
  ['ja', () => import('../locales/ja.json')],
  ['ru', () => import('../locales/ru.json')],
  ['vi', () => import('../locales/vi.json')],
] as const

describe('lazy-loaded translations', () => {
  const testI18n = createInstance().use(localeBackend)

  beforeAll(async () => {
    await testI18n.init({
      fallbackLng: false,
      supportedLngs: locales.map(([language]) => language),
      load: 'currentOnly',
    })
  })

  it.each(locales)(
    'loads the translation namespace for %s',
    async (language, loadLocale) => {
      const locale = await loadLocale()

      await testI18n.changeLanguage(language)

      expect(testI18n.getResource(language, 'translation', 'Settings')).toBe(
        locale.default.translation.Settings
      )
    }
  )
})
