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
import type { SystemStatus } from '@/features/auth/types'

export function resolveApiDocsBaseUrl(
  status: SystemStatus | null,
  browserOrigin: string
): string {
  const configuredAddresses = [
    status?.server_address,
    status?.serverAddress,
    status?.data?.server_address,
    status?.data?.serverAddress,
  ]

  for (const address of configuredAddresses) {
    if (typeof address === 'string' && address.trim()) {
      return address.trim().replace(/\/+$/, '')
    }
  }

  return browserOrigin || 'https://api.example.com'
}
