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
import { useTokenKeys } from '../../hooks/chat/useTokenKeys';
import { Spin } from '@douyinfe/semi-ui';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { encodeToBase64 } from '../../helpers';
import { parseChatPresets, resolveChatUrl } from '../../helpers/chat';
import { useActualTheme } from '../../context/Theme';

const ChatPage = () => {
  const { t } = useTranslation();
  const { id } = useParams();
  const { keys, activeKeys, purposeDefinitions, serverAddress, isLoading } =
    useTokenKeys(id);
  const actualTheme = useActualTheme();

  const comLink = (key) => {
    // console.log('chatLink:', chatLink);
    if (!serverAddress || !key) return '';
    let link = '';
    if (id) {
      let chats = localStorage.getItem('chats');
      if (chats) {
        chats = parseChatPresets(chats);
        const preset = chats.find((item) => String(item.id) === String(id));
        if (preset) {
          link = resolveChatUrl({
            template: preset.url,
            apiKey: key,
            apiKeys: activeKeys,
            purposeDefinitions,
            serverAddress,
            encodeToBase64,
            theme: actualTheme,
          });
        }
      }
    }
    return link;
  };

  const iframeSrc = keys.length > 0 ? comLink(keys[0]) : '';

  return !isLoading && iframeSrc ? (
    <iframe
      key={iframeSrc}
      src={iframeSrc}
      style={{
        width: '100%',
        height: 'calc(100vh - 64px)',
        border: 'none',
        marginTop: '64px',
      }}
      title='Token Frame'
      allow='camera;microphone'
    />
  ) : (
    <div className='fixed inset-0 w-screen h-screen flex items-center justify-center bg-white/80 z-[1000] mt-[60px]'>
      <div className='flex flex-col items-center'>
        <Spin size='large' spinning={true} tip={null} />
        <span
          className='whitespace-nowrap mt-2 text-center'
          style={{ color: 'var(--semi-color-primary)' }}
        >
          {t('正在跳转...')}
        </span>
      </div>
    </div>
  );
};

export default ChatPage;
