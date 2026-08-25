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
import type { ReactNode } from 'react'

export interface OverviewSectionLayoutProps {
  summary: ReactNode
  community: ReactNode
  informationPanels?: ReactNode
  setup: ReactNode
}

export function OverviewSectionLayout(props: OverviewSectionLayoutProps) {
  return (
    <div className='flex flex-col gap-4'>
      {props.setup}

      <div
        data-testid='overview-primary-row'
        className='grid items-stretch gap-4 xl:grid-cols-[minmax(0,1.8fr)_minmax(18rem,0.75fr)] [&>*:only-child]:xl:col-span-2'
      >
        {props.summary}
        {props.community}
      </div>

      {props.informationPanels != null && (
        <div
          data-testid='overview-information-row'
          className='grid grid-flow-col gap-4 overflow-x-auto md:grid-flow-row md:grid-cols-2 2xl:grid-cols-3 [&>*]:col-start-1 md:[&>*]:col-start-auto'
        >
          {props.informationPanels}
        </div>
      )}
    </div>
  )
}
