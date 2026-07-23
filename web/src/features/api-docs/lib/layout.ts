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

const pageContainer = 'mx-auto w-full max-w-7xl px-5 sm:px-7 lg:px-8'

export const apiDocsLayoutClasses = {
  pageContainer,
  contentGrid: `${pageContainer} grid gap-x-10 gap-y-14 py-10 sm:py-14 lg:grid-cols-[240px_minmax(0,1fr)] xl:gap-x-14`,
  desktopSidebar: 'hidden min-h-0 lg:block',
  desktopSidebarContent: 'sticky top-36 h-[calc(100svh-10rem)]',
  readingColumn: 'min-w-0 lg:col-start-2',
} as const
