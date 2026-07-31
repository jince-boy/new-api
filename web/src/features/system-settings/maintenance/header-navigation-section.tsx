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
import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import * as z from 'zod'

import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'

import {
  SettingsControlChildren,
  SettingsForm,
  SettingsSwitchContent,
  SettingsControlGroup,
  SettingsSwitchItem,
} from '../components/settings-form-layout'
import { SettingsPageFormActions } from '../components/settings-page-context'
import { SettingsSection } from '../components/settings-section'
import { useUpdateOption } from '../hooks/use-update-option'
import {
  HEADER_NAV_DEFAULT,
  type HeaderNavModulesConfig,
  serializeHeaderNavModules,
} from './config'

const createHeaderNavSchema = (t: (key: string) => string) =>
  z
    .object({
      home: z.boolean(),
      console: z.boolean(),
      pricingEnabled: z.boolean(),
      pricingRequireAuth: z.boolean(),
      rankingsEnabled: z.boolean(),
      rankingsRequireAuth: z.boolean(),
      docsEnabled: z.boolean(),
      docsLink: z.string(),
      docsOpenInNewTab: z.boolean(),
      canvasEnabled: z.boolean(),
      canvasLink: z
        .string()
        .trim()
        .refine(
          (value) =>
            value === '' ||
            value.startsWith('http://') ||
            value.startsWith('https://'),
          { error: t('URL must start with http:// or https://') }
        )
        .refine((value) => {
          if (!value) return true
          try {
            const parsed = new URL(value)
            return Boolean(parsed.hostname)
          } catch {
            return false
          }
        }, t('Must be a valid URL')),
      canvasOpenInNewTab: z.boolean(),
      about: z.boolean(),
    })
    .superRefine((values, context) => {
      if (values.canvasEnabled && !values.canvasLink) {
        context.addIssue({
          code: 'custom',
          path: ['canvasLink'],
          message: t('Please enter canvas URL'),
        })
      }
    })

type HeaderNavFormValues = z.infer<ReturnType<typeof createHeaderNavSchema>>

type HeaderNavigationSectionProps = {
  config: HeaderNavModulesConfig
  initialDocsLink: string
  initialSerialized: string
}

const toFormValues = (
  config: HeaderNavModulesConfig,
  docsLink: string
): HeaderNavFormValues => ({
  home:
    config.home === undefined ? HEADER_NAV_DEFAULT.home : Boolean(config.home),
  console:
    config.console === undefined
      ? HEADER_NAV_DEFAULT.console
      : Boolean(config.console),
  pricingEnabled:
    config.pricing?.enabled === undefined
      ? HEADER_NAV_DEFAULT.pricing.enabled
      : Boolean(config.pricing.enabled),
  pricingRequireAuth:
    config.pricing?.requireAuth === undefined
      ? HEADER_NAV_DEFAULT.pricing.requireAuth
      : Boolean(config.pricing.requireAuth),
  rankingsEnabled:
    config.rankings?.enabled === undefined
      ? HEADER_NAV_DEFAULT.rankings.enabled
      : Boolean(config.rankings.enabled),
  rankingsRequireAuth:
    config.rankings?.requireAuth === undefined
      ? HEADER_NAV_DEFAULT.rankings.requireAuth
      : Boolean(config.rankings.requireAuth),
  docsEnabled:
    config.docs?.enabled === undefined
      ? HEADER_NAV_DEFAULT.docs.enabled
      : Boolean(config.docs.enabled),
  docsLink,
  docsOpenInNewTab:
    config.docs?.openInNewTab === undefined
      ? HEADER_NAV_DEFAULT.docs.openInNewTab
      : Boolean(config.docs.openInNewTab),
  canvasEnabled:
    config.canvas?.enabled === undefined
      ? HEADER_NAV_DEFAULT.canvas.enabled
      : Boolean(config.canvas.enabled),
  canvasLink: config.canvas?.url ?? HEADER_NAV_DEFAULT.canvas.url,
  canvasOpenInNewTab:
    config.canvas?.openInNewTab === undefined
      ? HEADER_NAV_DEFAULT.canvas.openInNewTab
      : Boolean(config.canvas.openInNewTab),
  about:
    config.about === undefined
      ? HEADER_NAV_DEFAULT.about
      : Boolean(config.about),
})

export function HeaderNavigationSection(props: HeaderNavigationSectionProps) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()
  const headerNavSchema = createHeaderNavSchema(t)
  const formDefaults = useMemo(
    () => toFormValues(props.config, props.initialDocsLink),
    [props.config, props.initialDocsLink]
  )

  const form = useForm<HeaderNavFormValues>({
    resolver: zodResolver(headerNavSchema),
    defaultValues: formDefaults,
  })

  useEffect(() => {
    form.reset(formDefaults)
  }, [formDefaults, form])

  const onSubmit = async (values: HeaderNavFormValues) => {
    const payload: HeaderNavModulesConfig = {
      ...props.config,
      home: values.home,
      console: values.console,
      docs: {
        enabled: values.docsEnabled,
        openInNewTab: values.docsOpenInNewTab,
      },
      canvas: {
        enabled: values.canvasEnabled,
        url: values.canvasLink.trim(),
        openInNewTab: values.canvasOpenInNewTab,
      },
      about: values.about,
      pricing: {
        ...(props.config.pricing ?? HEADER_NAV_DEFAULT.pricing),
        enabled: values.pricingEnabled,
        requireAuth: values.pricingRequireAuth,
      },
      rankings: {
        ...(props.config.rankings ?? HEADER_NAV_DEFAULT.rankings),
        enabled: values.rankingsEnabled,
        requireAuth: values.rankingsRequireAuth,
      },
    }

    const serialized = serializeHeaderNavModules(payload)
    const docsLink = values.docsLink.trim()
    if (serialized !== props.initialSerialized) {
      await updateOption.mutateAsync({
        key: 'HeaderNavModules',
        value: serialized,
      })
    }

    if (docsLink !== props.initialDocsLink.trim()) {
      await updateOption.mutateAsync({
        key: 'general_setting.docs_link',
        value: docsLink,
      })
    }
  }

  const resetToDefault = () => {
    form.reset(toFormValues(HEADER_NAV_DEFAULT, props.initialDocsLink))
  }

  const simpleModules: Array<{
    key: 'home' | 'console' | 'about'
    title: string
    description: string
  }> = [
    {
      key: 'home',
      title: t('Home'),
      description: t('Landing page with system overview.'),
    },
    {
      key: 'console',
      title: t('Console'),
      description: t('User dashboard and quota controls.'),
    },
    {
      key: 'about',
      title: t('About'),
      description: t('Static page describing the platform.'),
    },
  ]

  const accessModules: Array<{
    enabledKey: 'pricingEnabled' | 'rankingsEnabled'
    requireAuthKey: 'pricingRequireAuth' | 'rankingsRequireAuth'
    requireAuthDependsOn: 'pricingEnabled' | 'rankingsEnabled'
    title: string
    description: string
    requireAuthTitle: string
    requireAuthDescription: string
  }> = [
    {
      enabledKey: 'pricingEnabled',
      requireAuthKey: 'pricingRequireAuth',
      requireAuthDependsOn: 'pricingEnabled',
      title: t('Model Square'),
      description: t('Public model catalog and pricing page.'),
      requireAuthTitle: t('Require login to view models'),
      requireAuthDescription: t(
        'Visitors must authenticate before accessing the pricing directory.'
      ),
    },
    {
      enabledKey: 'rankingsEnabled',
      requireAuthKey: 'rankingsRequireAuth',
      requireAuthDependsOn: 'rankingsEnabled',
      title: t('Rankings'),
      description: t('Public rankings page based on live usage data.'),
      requireAuthTitle: t('Require login to view rankings'),
      requireAuthDescription: t(
        'Visitors must authenticate before accessing the rankings page.'
      ),
    },
  ]

  return (
    <SettingsSection title={t('Header navigation')}>
      <Form {...form}>
        <SettingsForm onSubmit={form.handleSubmit(onSubmit)}>
          <SettingsPageFormActions
            onSave={form.handleSubmit(onSubmit)}
            onReset={resetToDefault}
            isSaving={updateOption.isPending}
            resetLabel='Reset to default'
            saveLabel='Save navigation'
          />
          <div className='grid gap-4 md:grid-cols-2'>
            {simpleModules.map((module) => (
              <FormField
                key={module.key}
                control={form.control}
                name={module.key}
                render={({ field }) => (
                  <SettingsSwitchItem>
                    <SettingsSwitchContent>
                      <FormLabel>{module.title}</FormLabel>
                      <FormDescription>{module.description}</FormDescription>
                    </SettingsSwitchContent>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <FormMessage />
                  </SettingsSwitchItem>
                )}
              />
            ))}
          </div>

          <SettingsControlGroup>
            <FormField
              control={form.control}
              name='docsEnabled'
              render={({ field }) => (
                <SettingsSwitchItem>
                  <SettingsSwitchContent>
                    <FormLabel>{t('User Guide')}</FormLabel>
                    <FormDescription>
                      {t('Show an external user guide in the top navigation.')}
                    </FormDescription>
                  </SettingsSwitchContent>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <FormMessage />
                </SettingsSwitchItem>
              )}
            />

            <SettingsControlChildren className='grid gap-4 py-2 md:grid-cols-2'>
              <FormField
                control={form.control}
                name='docsLink'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('User guide URL')}</FormLabel>
                    <FormControl>
                      <Input
                        type='url'
                        autoComplete='url'
                        placeholder={t('https://docs.example.com')}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      {t('Link to your user guide or knowledge base.')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='docsOpenInNewTab'
                render={({ field }) => (
                  <SettingsSwitchItem className='py-2'>
                    <SettingsSwitchContent>
                      <FormLabel>{t('Open in new tab')}</FormLabel>
                      <FormDescription>
                        {t(
                          'Turn this off to open the user guide in the current page.'
                        )}
                      </FormDescription>
                    </SettingsSwitchContent>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <FormMessage />
                  </SettingsSwitchItem>
                )}
              />
            </SettingsControlChildren>
          </SettingsControlGroup>

          <SettingsControlGroup>
            <FormField
              control={form.control}
              name='canvasEnabled'
              render={({ field }) => (
                <SettingsSwitchItem>
                  <SettingsSwitchContent>
                    <FormLabel>{t('Canvas')}</FormLabel>
                    <FormDescription>
                      {t('Show an external canvas in the top navigation.')}
                    </FormDescription>
                  </SettingsSwitchContent>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <FormMessage />
                </SettingsSwitchItem>
              )}
            />

            <SettingsControlChildren className='grid gap-4 py-2 md:grid-cols-2'>
              <FormField
                control={form.control}
                name='canvasLink'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Canvas URL')}</FormLabel>
                    <FormControl>
                      <Input
                        type='url'
                        autoComplete='url'
                        placeholder={t('https://canvas.example.com')}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      {t('Link to your canvas workspace or application.')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='canvasOpenInNewTab'
                render={({ field }) => (
                  <SettingsSwitchItem className='py-2'>
                    <SettingsSwitchContent>
                      <FormLabel>{t('Open in new tab')}</FormLabel>
                      <FormDescription>
                        {t(
                          'Turn this off to open the canvas in the current page.'
                        )}
                      </FormDescription>
                    </SettingsSwitchContent>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <FormMessage />
                  </SettingsSwitchItem>
                )}
              />
            </SettingsControlChildren>
          </SettingsControlGroup>

          <div className='grid gap-4 lg:grid-cols-2'>
            {accessModules.map((module) => (
              <SettingsControlGroup key={module.enabledKey}>
                <FormField
                  control={form.control}
                  name={module.enabledKey}
                  render={({ field }) => (
                    <SettingsSwitchItem>
                      <SettingsSwitchContent>
                        <FormLabel>{module.title}</FormLabel>
                        <FormDescription>{module.description}</FormDescription>
                      </SettingsSwitchContent>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <FormMessage />
                    </SettingsSwitchItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name={module.requireAuthKey}
                  render={({ field }) => (
                    <SettingsControlChildren>
                      <SettingsSwitchItem className='py-2'>
                        <SettingsSwitchContent>
                          <FormLabel>{module.requireAuthTitle}</FormLabel>
                          <FormDescription>
                            {module.requireAuthDescription}
                          </FormDescription>
                        </SettingsSwitchContent>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            disabled={!form.watch(module.requireAuthDependsOn)}
                          />
                        </FormControl>
                        <FormMessage />
                      </SettingsSwitchItem>
                    </SettingsControlChildren>
                  )}
                />
              </SettingsControlGroup>
            ))}
          </div>
        </SettingsForm>
      </Form>
    </SettingsSection>
  )
}
