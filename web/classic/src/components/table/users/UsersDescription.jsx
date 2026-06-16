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
import { Button, Typography } from '@douyinfe/semi-ui';
import { IconRefresh, IconUserAdd } from '@douyinfe/semi-icons';
import CompactModeToggle from '../../common/ui/CompactModeToggle';
import { renderQuota } from '../../../helpers';

const { Text } = Typography;

const UsersDescription = ({
  compactMode,
  setCompactMode,
  totalQuota = 0,
  refresh,
  loading = false,
  t,
}) => {
  return (
    <div className='flex flex-col md:flex-row justify-between items-start md:items-center gap-2 w-full'>
      <div className='flex items-center text-blue-500'>
        <IconUserAdd className='mr-2' />
        <Text>{t('用户管理')}</Text>
      </div>
      <div className='flex flex-wrap items-center gap-2'>
        <div
          className='flex items-center gap-2 rounded-lg border px-3 py-1'
          style={{ borderColor: 'var(--semi-color-border)' }}
        >
          <Text type='tertiary' size='small'>
            {t('所有用户余额')}
          </Text>
          <Text strong>{renderQuota(totalQuota)}</Text>
        </div>
        <Button
          type='tertiary'
          theme='outline'
          size='small'
          icon={<IconRefresh />}
          onClick={() => refresh?.()}
          loading={loading}
          aria-label={t('刷新')}
        />
        <CompactModeToggle
          compactMode={compactMode}
          setCompactMode={setCompactMode}
          t={t}
        />
      </div>
    </div>
  );
};

export default UsersDescription;
