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
import { useEffect } from 'react'
import * as z from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
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
import { Dialog } from '@/components/dialog'

const createChatDialogSchema = (t: (key: string) => string) =>
  z.object({
    name: z.string().min(1, t('Chat client name is required')),
    url: z.string().min(1, t('URL is required')),
    enabled: z.boolean(),
  })

type ChatDialogFormValues = z.infer<ReturnType<typeof createChatDialogSchema>>

const CHAT_DIALOG_FORM_ID = 'chat-dialog-form'

export type ChatEntryData = {
  name: string
  url: string
  enabled: boolean
}

type ChatDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (data: ChatEntryData) => void
  editData?: ChatEntryData | null
}

export function ChatDialog({
  open,
  onOpenChange,
  onSave,
  editData,
}: ChatDialogProps) {
  const { t } = useTranslation()
  const isEditMode = !!editData
  const chatDialogSchema = createChatDialogSchema(t)

  const form = useForm<ChatDialogFormValues>({
    resolver: zodResolver(chatDialogSchema),
    defaultValues: {
      name: '',
      url: '',
      enabled: true,
    },
  })

  useEffect(() => {
    if (editData) {
      form.reset(editData)
    } else {
      form.reset({
        name: '',
        url: '',
        enabled: true,
      })
    }
  }, [editData, form, open])

  const handleSubmit = (values: ChatDialogFormValues) => {
    onSave(values)
    form.reset()
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEditMode ? t('Edit chat preset') : t('Add chat preset')}
      description={t('Configure a predefined chat link for end users.')}
      contentClassName='sm:max-w-[500px]'
      contentHeight='auto'
      bodyClassName='space-y-4'
      footer={
        <>
          <Button
            type='button'
            variant='outline'
            onClick={() => onOpenChange(false)}
          >
            {t('Cancel')}
          </Button>
          <Button type='submit' form={CHAT_DIALOG_FORM_ID}>
            {isEditMode ? t('Update') : t('Add')}
          </Button>
        </>
      }
    >
      <Form {...form}>
        <form
          id={CHAT_DIALOG_FORM_ID}
          onSubmit={form.handleSubmit(handleSubmit)}
          className='space-y-4'
        >
          <FormField
            control={form.control}
            name='name'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Chat Client Name')}</FormLabel>
                <FormControl>
                  <Input
                    placeholder={t('Please enter chat client name')}
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  {t('Display name for this chat client.')}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='url'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('URL')}</FormLabel>
                <FormControl>
                  <Input placeholder={t('Please enter the URL')} {...field} />
                </FormControl>
                <FormDescription>
                  <span>{t('The URL for this chat client.')}</span>
                  <span className='mt-1 block'>
                    {t('Available variables:')}{' '}
                    <code>{'{address}'}</code>, <code>{'{key}'}</code>,{' '}
                    <code>{'{theme}'}</code>.{' '}
                    {t('Double-brace syntax is also supported.')}{' '}
                    <code>{'{{theme}}'}</code>
                  </span>
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='enabled'
            render={({ field }) => (
              <FormItem className='flex flex-row items-center justify-between rounded-md border px-3 py-2'>
                <div className='space-y-0.5'>
                  <FormLabel>{t('Enabled')}</FormLabel>
                  <FormDescription>
                    {t('Show this chat preset to users.')}
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
              </FormItem>
            )}
          />
        </form>
      </Form>
    </Dialog>
  )
}
