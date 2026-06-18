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
import { Button, Divider, Select, Switch, Typography } from '@douyinfe/semi-ui';
import { Image, Settings, SlidersHorizontal, Users, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { renderGroupOption, selectFilter } from '../../helpers';
import ParameterControl from './ParameterControl';
import ConfigManager from './ConfigManager';
import CustomRequestEditor from './CustomRequestEditor';
import ImageSizeControl from './ImageSizeControl';

const imageQualityOptions = [
  { label: 'auto', value: 'auto' },
  { label: 'standard', value: 'standard' },
  { label: 'hd', value: 'hd' },
  { label: 'high', value: 'high' },
  { label: 'medium', value: 'medium' },
  { label: 'low', value: 'low' },
];

const SettingsPanel = ({
  inputs,
  parameterEnabled,
  models,
  groups,
  styleState,
  showDebugPanel,
  customRequestMode,
  customRequestBody,
  onInputChange,
  onParameterToggle,
  onCloseSettings,
  onConfigImport,
  onConfigReset,
  onCustomRequestModeChange,
  onCustomRequestBodyChange,
  previewPayload,
  messages,
}) => {
  const { t } = useTranslation();
  const imageSize =
    inputs.imageSize === undefined || inputs.imageSize === null
      ? '1024x1024'
      : inputs.imageSize;

  const currentConfig = {
    inputs,
    parameterEnabled,
    showDebugPanel,
    customRequestMode,
    customRequestBody,
  };

  return (
    <div className='flex h-full flex-col bg-[var(--semi-color-bg-0)]'>
      <div className='flex flex-shrink-0 items-center justify-between border-b border-[var(--semi-color-border)] px-4 py-3'>
        <div>
          <Typography.Title heading={5} className='!mb-0'>
            {t('Advanced Settings')}
          </Typography.Title>
          <Typography.Text className='text-xs text-[var(--semi-color-text-2)]'>
            {t('Adjust models, parameters, and debug requests only when needed.')}
          </Typography.Text>
        </div>
        {onCloseSettings && (
          <Button
            icon={<X size={16} />}
            onClick={onCloseSettings}
            theme='borderless'
            type='tertiary'
            className='!rounded-full'
          />
        )}
      </div>

      <div className='model-settings-scroll flex-1 space-y-5 overflow-y-auto px-4 py-4'>
        <section className='space-y-3'>
          <div className='flex items-center gap-2'>
            <Settings size={16} className='text-[var(--semi-color-text-2)]' />
            <Typography.Text strong>{t('Model')}</Typography.Text>
          </div>
          <Select
            placeholder={t('Select Model')}
            name='model'
            filter={selectFilter}
            autoClearSearchValue={false}
            onChange={(value) => onInputChange('model', value)}
            value={inputs.model}
            optionList={models}
            style={{ width: '100%' }}
            dropdownStyle={{ width: '100%', maxWidth: '100%' }}
            disabled={customRequestMode}
          />
        </section>

        <section className='space-y-3'>
          <div className='flex items-center gap-2'>
            <Users size={16} className='text-[var(--semi-color-text-2)]' />
            <Typography.Text strong>{t('Group')}</Typography.Text>
          </div>
          <Select
            placeholder={t('Choose Group')}
            name='group'
            filter={selectFilter}
            autoClearSearchValue={false}
            onChange={(value) => onInputChange('group', value)}
            value={inputs.group}
            optionList={groups}
            renderOptionItem={renderGroupOption}
            style={{ width: '100%' }}
            dropdownStyle={{ width: '100%', maxWidth: '100%' }}
            disabled={customRequestMode}
          />
        </section>

        <section className='space-y-3'>
          <div className='flex items-center gap-2'>
            <Image size={16} className='text-[var(--semi-color-text-2)]' />
            <Typography.Text strong>{t('Image creation')}</Typography.Text>
          </div>
          <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
            <ImageSizeControl
              value={imageSize}
              onChange={(value) => onInputChange('imageSize', value)}
              disabled={customRequestMode}
              className='playground-settings-size-control'
            />
            <Select
              placeholder={t('Image quality')}
              value={inputs.imageQuality || 'auto'}
              optionList={imageQualityOptions}
              onChange={(value) => onInputChange('imageQuality', value)}
              disabled={customRequestMode}
            />
          </div>
        </section>

        <section className='flex items-center justify-between rounded-lg border border-[var(--semi-color-border)] px-3 py-2'>
          <div>
            <Typography.Text strong>{t('Streaming')}</Typography.Text>
            <Typography.Paragraph className='!mb-0 !text-xs !text-[var(--semi-color-text-2)]'>
              {t('Chat replies stream as they are generated.')}
            </Typography.Paragraph>
          </div>
          <Switch
            checked={inputs.stream}
            onChange={(checked) => onInputChange('stream', checked)}
            checkedText={t('On')}
            uncheckedText={t('Off')}
            size='small'
            disabled={customRequestMode}
          />
        </section>

        <Divider margin='12px' />

        <details className='rounded-lg border border-[var(--semi-color-border)] px-3 py-2'>
          <summary className='flex cursor-pointer list-none items-center gap-2 text-sm font-medium'>
            <SlidersHorizontal size={15} />
            {t('Advanced parameters')}
          </summary>
          <div className='pt-4'>
            <ParameterControl
              inputs={inputs}
              parameterEnabled={parameterEnabled}
              onInputChange={onInputChange}
              onParameterToggle={onParameterToggle}
              disabled={customRequestMode}
            />
          </div>
        </details>

        <details className='rounded-lg border border-[var(--semi-color-border)] px-3 py-2'>
          <summary className='flex cursor-pointer list-none items-center gap-2 text-sm font-medium'>
            <SlidersHorizontal size={15} />
            {t('Custom request body')}
          </summary>
          <div className='pt-4'>
            <CustomRequestEditor
              customRequestMode={customRequestMode}
              customRequestBody={customRequestBody}
              onCustomRequestModeChange={onCustomRequestModeChange}
              onCustomRequestBodyChange={onCustomRequestBodyChange}
              defaultPayload={previewPayload}
            />
          </div>
        </details>
      </div>

      <div className='flex-shrink-0 border-t border-[var(--semi-color-border)] p-4'>
        <ConfigManager
          currentConfig={currentConfig}
          onConfigImport={onConfigImport}
          onConfigReset={onConfigReset}
          styleState={styleState}
          messages={messages}
        />
      </div>
    </div>
  );
};

export default SettingsPanel;
