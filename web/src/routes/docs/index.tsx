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
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import z from 'zod'

import { ApiDocsPage } from '@/features/api-docs'

const docsSearchSchema = z.object({
  endpoint: z.string().optional().catch(undefined),
})

function ApiDocsRoute() {
  const search = Route.useSearch()
  const navigate = useNavigate()

  return (
    <ApiDocsPage
      selectedId={search.endpoint}
      onSelectedIdChange={(endpoint) => {
        void navigate({
          to: '/docs',
          search: { endpoint },
          replace: true,
        })
      }}
    />
  )
}

export const Route = createFileRoute('/docs/')({
  validateSearch: docsSearchSchema,
  component: ApiDocsRoute,
})
