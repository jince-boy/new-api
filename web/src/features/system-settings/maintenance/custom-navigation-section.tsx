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
import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Edit, Plus, Save, Trash2 } from 'lucide-react'
import * as z from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { StaticDataTable } from '@/components/data-table'
import { Dialog } from '@/components/dialog'
import { SettingsSection } from '../components/settings-section'
import { useUpdateOption } from '../hooks/use-update-option'

type CustomNavLink = {
  id: number
  name: string
  url: string
  openInNewTab: boolean
}

type CustomNavigationSectionProps = {
  data: string
}

const CUSTOM_NAV_FORM_ID = 'custom-navigation-form'

const createCustomNavSchema = (t: (key: string) => string) =>
  z.object({
    name: z
      .string()
      .trim()
      .min(1, { error: t('Please enter navigation name') })
      .max(64, { error: t('Navigation name must be 64 characters or fewer') }),
    url: z
      .string()
      .trim()
      .min(1, { error: t('Please enter navigation URL') })
      .refine(
        (value) => value.startsWith('http://') || value.startsWith('https://'),
        { error: t('URL must start with http:// or https://') }
      )
      .refine((value) => {
        try {
          const parsed = new URL(value)
          return Boolean(parsed.hostname)
        } catch {
          return false
        }
      }, t('Must be a valid URL')),
    openInNewTab: z.boolean(),
  })

type CustomNavFormValues = z.infer<ReturnType<typeof createCustomNavSchema>>

const parseCustomNavLinks = (data: string): CustomNavLink[] => {
  try {
    const parsed = JSON.parse(data || '[]')
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed
      .map((item, index) => ({
        id: index + 1,
        name: typeof item?.name === 'string' ? item.name : '',
        url: typeof item?.url === 'string' ? item.url : '',
        openInNewTab: Boolean(item?.openInNewTab),
      }))
      .filter((item) => item.name.trim() && item.url.trim())
  } catch {
    return []
  }
}

const serializeCustomNavLinks = (links: CustomNavLink[]) =>
  JSON.stringify(
    links.map(({ name, url, openInNewTab }) => ({
      name: name.trim(),
      url: url.trim(),
      openInNewTab,
    }))
  )

export function CustomNavigationSection({
  data,
}: CustomNavigationSectionProps) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption({ silent: true })
  const queryClient = useQueryClient()
  const customNavSchema = createCustomNavSchema(t)
  const [links, setLinks] = useState<CustomNavLink[]>([])
  const [hasChanges, setHasChanges] = useState(false)
  const [showDialog, setShowDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [editingLink, setEditingLink] = useState<CustomNavLink | null>(null)

  const form = useForm<CustomNavFormValues>({
    resolver: zodResolver(customNavSchema),
    defaultValues: {
      name: '',
      url: '',
      openInNewTab: false,
    },
  })

  useEffect(() => {
    setLinks(parseCustomNavLinks(data))
    setHasChanges(false)
  }, [data])

  const handleAdd = () => {
    setEditingLink(null)
    form.reset({
      name: '',
      url: '',
      openInNewTab: false,
    })
    setShowDialog(true)
  }

  const handleEdit = (link: CustomNavLink) => {
    setEditingLink(link)
    form.reset({
      name: link.name,
      url: link.url,
      openInNewTab: link.openInNewTab,
    })
    setShowDialog(true)
  }

  const handleDelete = (link: CustomNavLink) => {
    setEditingLink(link)
    setShowDeleteDialog(true)
  }

  const confirmDelete = () => {
    if (!editingLink) {
      return
    }
    setLinks((prev) => prev.filter((item) => item.id !== editingLink.id))
    setHasChanges(true)
    setShowDeleteDialog(false)
    setEditingLink(null)
    toast.success(t('Navigation deleted. Click "Save Settings" to apply.'))
  }

  const handleSubmitForm = (values: CustomNavFormValues) => {
    const nextValues = {
      name: values.name.trim(),
      url: values.url.trim(),
      openInNewTab: values.openInNewTab,
    }

    if (editingLink) {
      setLinks((prev) =>
        prev.map((item) =>
          item.id === editingLink.id ? { ...item, ...nextValues } : item
        )
      )
      toast.success(t('Navigation updated. Click "Save Settings" to apply.'))
    } else {
      const nextId = Math.max(...links.map((item) => item.id), 0) + 1
      setLinks((prev) => [...prev, { id: nextId, ...nextValues }])
      toast.success(t('Navigation added. Click "Save Settings" to apply.'))
    }
    setHasChanges(true)
    setShowDialog(false)
  }

  const handleSaveAll = async () => {
    try {
      const serialized = serializeCustomNavLinks(links)
      const result = await updateOption.mutateAsync({
        key: 'CustomNavLinks',
        value: serialized,
      })
      if (!result.success) return
      queryClient.setQueryData<Record<string, unknown> | null>(
        ['status'],
        (current) => {
          const next = {
            ...(current ?? {}),
            CustomNavLinks: serialized,
          }
          try {
            window.localStorage.setItem('custom_nav_links', serialized)
            window.localStorage.setItem('status', JSON.stringify(next))
          } catch {
            /* empty */
          }
          return next
        }
      )
      setHasChanges(false)
      toast.success(t('Navigation links saved successfully'))
    } catch {
      toast.error(t('Failed to save navigation links'))
    }
  }

  return (
    <SettingsSection title={t('Navigation management')}>
      <div className='space-y-4'>
        <div className='flex flex-wrap items-center gap-2'>
          <Button onClick={handleAdd} size='sm'>
            <Plus className='mr-2 h-4 w-4' />
            {t('Add navigation')}
          </Button>
          <Button
            onClick={handleSaveAll}
            size='sm'
            variant='secondary'
            disabled={!hasChanges || updateOption.isPending}
          >
            <Save className='mr-2 h-4 w-4' />
            {updateOption.isPending ? t('Saving...') : t('Save Settings')}
          </Button>
        </div>

        <StaticDataTable
          data={links}
          getRowKey={(link) => link.id}
          emptyContent={t(
            'No navigation links yet. Click "Add navigation" to create one.'
          )}
          columns={[
            {
              id: 'name',
              header: t('Navigation name'),
              cellClassName: 'font-medium',
              cell: (link) => link.name,
            },
            {
              id: 'url',
              header: t('Navigation URL'),
              cellClassName: 'text-primary max-w-xs truncate font-mono text-sm',
              cell: (link) => link.url,
            },
            {
              id: 'openInNewTab',
              header: t('Open in new tab'),
              className: 'w-36',
              cell: (link) => (link.openInNewTab ? t('Enabled') : t('Disabled')),
            },
            {
              id: 'actions',
              header: t('Actions'),
              className: 'w-32',
              cell: (link) => (
                <div className='flex gap-2'>
                  <Button
                    onClick={() => handleEdit(link)}
                    size='sm'
                    variant='ghost'
                  >
                    <Edit className='h-4 w-4' />
                  </Button>
                  <Button
                    onClick={() => handleDelete(link)}
                    size='sm'
                    variant='ghost'
                  >
                    <Trash2 className='h-4 w-4' />
                  </Button>
                </div>
              ),
            },
          ]}
        />
      </div>

      <Dialog
        open={showDialog}
        onOpenChange={setShowDialog}
        title={editingLink ? t('Edit navigation') : t('Add navigation')}
        contentHeight='auto'
        bodyClassName='space-y-4'
        footer={
          <>
            <Button
              type='button'
              variant='outline'
              onClick={() => setShowDialog(false)}
            >
              {t('Cancel')}
            </Button>
            <Button type='submit' form={CUSTOM_NAV_FORM_ID}>
              {editingLink ? t('Update') : t('Add')}
            </Button>
          </>
        }
      >
        <Form {...form}>
          <form
            id={CUSTOM_NAV_FORM_ID}
            onSubmit={form.handleSubmit(handleSubmitForm)}
            className='space-y-4'
          >
            <FormField
              control={form.control}
              name='name'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Navigation name')}</FormLabel>
                  <FormControl>
                    <Input placeholder={t('Service status')} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='url'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Navigation URL')}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t('https://status.example.com')}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='openInNewTab'
              render={({ field }) => (
                <FormItem className='flex items-center justify-between rounded-lg border p-3'>
                  <FormLabel>{t('Open in new tab')}</FormLabel>
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

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Are you sure?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('This navigation link will be removed from the list.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('Cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>
              {t('Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsSection>
  )
}
