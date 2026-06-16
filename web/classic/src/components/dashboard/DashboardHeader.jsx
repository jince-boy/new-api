/*
Copyright (C) 2025 QuantumNous

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

import React from 'react';
import { Button } from '@douyinfe/semi-ui';
import { RefreshCw, Search } from 'lucide-react';

const DashboardHeader = ({
  getGreeting,
  greetingVisible,
  quickRangePresets,
  activeQuickRangePreset,
  onQuickRangeSelect,
  showSearchModal,
  refresh,
  loading,
}) => {
  const ICON_BUTTON_CLASS = 'text-white hover:bg-opacity-80 !rounded-full';

  return (
    <div className='mb-4 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between'>
      <h2
        className='text-2xl font-semibold text-gray-800 transition-opacity duration-1000 ease-in-out'
        style={{ opacity: greetingVisible ? 1 : 0 }}
      >
        {getGreeting}
      </h2>
      <div className='flex flex-wrap items-center justify-start gap-2 lg:justify-end'>
        <div className='max-w-full overflow-x-auto rounded-full bg-slate-100/80 p-0.5'>
          <div className='inline-flex min-w-max items-center gap-0.5'>
            {(quickRangePresets || []).map((preset) => {
              const isActive = activeQuickRangePreset === preset.key;
              return (
                <button
                  key={preset.key}
                  type='button'
                  onClick={() => onQuickRangeSelect?.(preset.key)}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
                    isActive
                      ? 'bg-blue-500 text-white shadow-md shadow-blue-200'
                      : 'text-slate-500 hover:bg-white/70 hover:text-slate-700'
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className='flex gap-2'>
          <Button
            type='tertiary'
            size='small'
            icon={<Search size={14} />}
            onClick={showSearchModal}
            className={`bg-emerald-500 hover:bg-emerald-600 ${ICON_BUTTON_CLASS}`}
          />
          <Button
            type='tertiary'
            size='small'
            icon={<RefreshCw size={14} />}
            onClick={refresh}
            loading={loading}
            className={`bg-blue-500 hover:bg-blue-600 ${ICON_BUTTON_CLASS}`}
          />
        </div>
      </div>
    </div>
  );
};

export default DashboardHeader;
