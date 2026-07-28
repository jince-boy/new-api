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
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import * as z from 'zod'

import { JsonCodeEditor } from '@/components/json-code-editor'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import {
  normalizeChatConfigForStorage,
  parseChatPresetValue,
} from '@/features/chat/lib/chat-links'

import { SettingsForm } from '../components/settings-form-layout'
import { SettingsPageFormActions } from '../components/settings-page-context'
import { SettingsSection } from '../components/settings-section'
import { useUpdateOption } from '../hooks/use-update-option'
import { ChatSettingsVisualEditor } from './chat-settings-visual-editor'
import { formatJsonForEditor } from './utils'

const createChatSchema = (t: (key: string) => string) =>
  z.object({
    Chats: z.string().superRefine((value, ctx) => {
      try {
        const parsed = JSON.parse(value || '[]')
        if (!Array.isArray(parsed)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: t('Expected a JSON array.'),
          })
          return
        }
        for (const item of parsed) {
          if (
            item === null ||
            typeof item !== 'object' ||
            Array.isArray(item)
          ) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: t(
                'Each item must be an object with a single key-value pair.'
              ),
            })
            return
          }
          const entries = Object.entries(item)
          if (entries.length !== 1) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: t('Each item must have exactly one key-value pair.'),
            })
            return
          }
          const parsedValue = parseChatPresetValue(entries[0][1])
          if (!parsedValue) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: t(
                'Each chat preset value must be a URL string or an object with url and enabled fields.'
              ),
            })
            return
          }
        }
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: t('Invalid JSON string.'),
        })
      }
    }),
    TokenDefaultKeyPurposes: z.string().superRefine((value, ctx) => {
      try {
        const parsed = JSON.parse(value || '[]')
        if (!Array.isArray(parsed)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: t('Expected a JSON array.'),
          })
          return
        }
        let hasChat = false
        for (const item of parsed) {
          if (!item || typeof item !== 'object' || Array.isArray(item)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: t(
                'Each item must be an object with a single key-value pair.'
              ),
            })
            return
          }
          const record = item as Record<string, unknown>
          if (
            typeof record.purpose !== 'string' ||
            typeof record.label !== 'string' ||
            typeof record.token !== 'string' ||
            !record.purpose.trim() ||
            !record.label.trim() ||
            !record.token.trim()
          ) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: t('Invalid JSON string.'),
            })
            return
          }
          if (record.purpose.trim().toLowerCase() === 'chat') {
            hasChat = true
          }
        }
        if (!hasChat) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: t('Invalid JSON string.'),
          })
        }
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: t('Invalid JSON string.'),
        })
      }
    }),
  })

type ChatSettingsFormValues = z.infer<ReturnType<typeof createChatSchema>>

type ChatSettingsSectionProps = {
  defaultValue: string
  defaultKeyPurposes: string
}

export function ChatSettingsSection({
  defaultValue,
  defaultKeyPurposes,
}: ChatSettingsSectionProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const updateOption = useUpdateOption()
  const [editMode, setEditMode] = useState<'visual' | 'json'>('visual')

  const chatSchema = createChatSchema(t)
  const formatted = formatJsonForEditor(defaultValue, '[]')
  const formattedKeyPurposes = formatJsonForEditor(
    defaultKeyPurposes,
    '[]'
  )
  const form = useForm<ChatSettingsFormValues>({
    resolver: zodResolver(chatSchema),
    mode: 'onChange', // Enable real-time validation
    defaultValues: {
      Chats: formatted,
      TokenDefaultKeyPurposes: formattedKeyPurposes,
    },
  })

  const initialNormalizedRef = useRef(
    normalizeChatConfigForStorage(defaultValue, '[]')
  )
  const initialKeyPurposesRef = useRef(formattedKeyPurposes)

  useEffect(() => {
    const nextKeyPurposes = formatJsonForEditor(defaultKeyPurposes, '[]')
    form.reset({
      Chats: formatJsonForEditor(defaultValue, '[]'),
      TokenDefaultKeyPurposes: nextKeyPurposes,
    })
    initialNormalizedRef.current = normalizeChatConfigForStorage(
      defaultValue,
      '[]'
    )
    initialKeyPurposesRef.current = nextKeyPurposes
  }, [defaultKeyPurposes, defaultValue, form])

  const onSubmit = async (values: ChatSettingsFormValues) => {
    const normalized = normalizeChatConfigForStorage(values.Chats, '[]')
    const normalizedKeyPurposes = formatJsonForEditor(
      values.TokenDefaultKeyPurposes,
      '[]'
    )
    if (
      normalized === initialNormalizedRef.current &&
      normalizedKeyPurposes === initialKeyPurposesRef.current
    ) {
      return
    }

    const updates = []
    if (normalized !== initialNormalizedRef.current) {
      updates.push(updateOption.mutateAsync({ key: 'Chats', value: normalized }))
    }
    if (normalizedKeyPurposes !== initialKeyPurposesRef.current) {
      updates.push(
        updateOption.mutateAsync({
          key: 'TokenDefaultKeyPurposes',
          value: normalizedKeyPurposes,
        })
      )
    }
    await Promise.all(updates)
    if (normalizedKeyPurposes !== initialKeyPurposesRef.current) {
      void queryClient.invalidateQueries({
        queryKey: ['default-api-key-purposes'],
      })
    }
  }

  return (
    <SettingsSection title={t('Chat Presets')}>
      <Form {...form}>
        {/* eslint-disable-next-line react-hooks/refs */}
        <SettingsForm onSubmit={form.handleSubmit(onSubmit)}>
          <SettingsPageFormActions
            onSave={form.handleSubmit(onSubmit)}
            isSaving={updateOption.isPending}
            saveLabel='Save chat settings'
          />
          <Tabs
            value={editMode}
            onValueChange={(value) => setEditMode(value as 'visual' | 'json')}
          >
            <TabsList className='grid w-full grid-cols-2'>
              <TabsTrigger value='visual'>{t('Visual')}</TabsTrigger>
              <TabsTrigger value='json'>{t('JSON')}</TabsTrigger>
            </TabsList>

            <TabsContent value='visual' className='mt-6'>
              <FormField
                control={form.control}
                name='Chats'
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <ChatSettingsVisualEditor
                        value={field.value}
                        onChange={field.onChange}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </TabsContent>

            <TabsContent value='json' className='mt-6'>
              <FormField
                control={form.control}
                name='Chats'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Chat configuration JSON')}</FormLabel>
                    <FormControl>
                      <JsonCodeEditor
                        value={field.value}
                        onChange={field.onChange}
                        name={field.name}
                        onBlur={field.onBlur}
                        textareaRef={field.ref}
                        placeholder={t(
                          '[{"ChatGPT":"https://chat.openai.com"},{"Lobe Chat":"https://chat-preview.lobehub.com/?settings={...}"}]'
                        )}
                        heightClassName='h-72 min-h-72 max-h-72'
                        aria-invalid={Boolean(form.formState.errors.Chats)}
                      />
                    </FormControl>
                    <FormDescription>
                      {t(
                        'Array of chat client presets. Each item is an object with one key-value pair: client name and its URL.'
                      )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </TabsContent>
          </Tabs>
          <FormField
            control={form.control}
            name='TokenDefaultKeyPurposes'
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {t('Default')} {t('API Key')} {t('Type')}
                </FormLabel>
                <FormControl>
                  <Textarea
                    rows={8}
                    placeholder='[{"purpose":"chat","label":"Chat","token":"chatKey"},{"purpose":"image","label":"Image","token":"imageKey"}]'
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  {t('Edit JSON text directly. Format will be validated on save.')}{' '}
                  <code>purpose</code> / <code>label</code> /{' '}
                  <code>token</code>; <code>chat</code> -&gt;{' '}
                  <code>{'{key}'}</code>
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </SettingsForm>
      </Form>
    </SettingsSection>
  )
}
