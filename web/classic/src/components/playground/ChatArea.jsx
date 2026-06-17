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
import { Chat } from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';
import CustomInputRender from './CustomInputRender';

const ChatArea = ({
  chatRef,
  message,
  roleInfo,
  onMessageSend,
  onMessageCopy,
  onMessageReset,
  onMessageDelete,
  onStopGenerator,
  onClearMessages,
  renderCustomChatContent,
  renderChatBoxAction,
}) => {
  const { t } = useTranslation();

  const renderInputArea = React.useCallback(
    (props) => {
      return <CustomInputRender {...props} onSubmit={onMessageSend} />;
    },
    [onMessageSend],
  );

  return (
    <div className='flex h-full min-h-0 flex-col bg-[var(--semi-color-bg-0)]'>
      <Chat
        ref={chatRef}
        chatBoxRenderConfig={{
          renderChatBoxContent: renderCustomChatContent,
          renderChatBoxAction,
          renderChatBoxTitle: () => null,
        }}
        renderInputArea={renderInputArea}
        roleConfig={roleInfo}
        chats={message}
        onMessageSend={onMessageSend}
        onMessageCopy={onMessageCopy}
        onMessageReset={onMessageReset}
        onMessageDelete={onMessageDelete}
        showClearContext
        showStopGenerate
        onStopGenerator={onStopGenerator}
        onClear={onClearMessages}
        className='playground-chat h-full'
        placeholder={t('输入消息或描述你想创作的图片...')}
        style={{
          height: '100%',
          maxWidth: '100%',
          overflow: 'hidden',
        }}
      />
    </div>
  );
};

export default ChatArea;
