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
import { AxiosError } from 'axios'
import i18next from 'i18next'
import { toast } from 'sonner'

import { getServerErrorMessageKey } from '@/lib/server-error-message'

type ErrorResponseData = {
  message?: string
  title?: string
  error?: string
}

export function handleServerError(error: unknown) {
  // eslint-disable-next-line no-console
  console.log(error)

  if (
    error &&
    typeof error === 'object' &&
    (error as { toastHandled?: boolean }).toastHandled
  ) {
    return
  }

  let errMsg = i18next.t('Something went wrong!')

  const messageKey = getServerErrorMessageKey(error)
  if (messageKey) {
    toast.error(i18next.t(messageKey))
    return
  }

  if (
    error &&
    typeof error === 'object' &&
    'status' in error &&
    Number(error.status) === 204
  ) {
    errMsg = i18next.t('Content not found.')
  }

  if (error instanceof AxiosError) {
    if (error.config?.skipErrorHandler) {
      return
    }

    const data = error.response?.data
    if (typeof data === 'string') {
      errMsg = data
    } else if (data && typeof data === 'object') {
      const responseData = data as ErrorResponseData
      errMsg =
        responseData.message ||
        responseData.title ||
        responseData.error ||
        error.message ||
        errMsg
    } else {
      errMsg = error.message || errMsg
    }
  }

  toast.error(errMsg)
}
