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

import React, { useRef, useEffect, useCallback, useState } from 'react';
import {
  Button,
  Select,
  Switch,
  TextArea,
  Toast,
  Typography,
} from '@douyinfe/semi-ui';
import { ArrowUp, Globe, Paperclip, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { usePlayground } from '../../contexts/PlaygroundContext';
import { renderGroupOption, selectFilter } from '../../helpers';
import { IMAGE_SIZE_OPTIONS } from '../../constants/playground.constants';

const fixedImageSizeOptions = IMAGE_SIZE_OPTIONS.map((value) => ({
  label: value,
  value,
}));

const selectPopupProps = {
  position: 'topLeft',
  dropdownMatchSelectWidth: true,
  zIndex: 1200,
};

const renderSelectedGroup = (option) => option?.value || option?.label || '';

const getCompactModeLabel = (key, label) => {
  if (key === 'image') return 'Image';
  return label;
};

const CustomInputRender = (props) => {
  const { t } = useTranslation();
  const { onSubmit } = props;
  const {
    onPasteImage,
    imageUrls,
    activeMode,
    modeItems,
    inputs,
    models,
    groups,
    onModeChange,
    onInputChange,
    onImageUrlsChange,
    onImageEnabledChange,
  } = usePlayground();
  const containerRef = useRef(null);
  const fileInputRef = useRef(null);
  const [text, setText] = useState('');

  const readImageFile = useCallback(
    (file) => {
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        Toast.warning(t('Please select image files'));
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target.result;
        onImageEnabledChange?.(true);
        onPasteImage?.(base64);
        Toast.success(t('Reference image added'));
      };
      reader.onerror = () => {
        Toast.error(t('Failed to add pasted image'));
      };
      reader.readAsDataURL(file);
    },
    [onImageEnabledChange, onPasteImage, t],
  );

  const handlePaste = useCallback(
    async (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.indexOf('image') !== -1) {
          e.preventDefault();
          readImageFile(item.getAsFile());
          break;
        }
      }
    },
    [readImageFile],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('paste', handlePaste);
    return () => {
      container.removeEventListener('paste', handlePaste);
    };
  }, [handlePaste]);

  const handleModeChange = (mode) => {
    onModeChange?.(mode);
    if (mode === 'image_edit') {
      onImageEnabledChange?.(true);
    }
  };

  const handleFileChange = (event) => {
    const files = Array.from(event.target.files || []);
    files.forEach(readImageFile);
    event.target.value = '';
  };

  const handleRemoveImage = (index) => {
    const nextUrls = (imageUrls || []).filter((_, i) => i !== index);
    onImageUrlsChange?.(nextUrls.length > 0 ? nextUrls : ['']);
  };

  const compactImages = (imageUrls || []).filter((url) => url?.trim());
  const isImageMode = activeMode === 'image' || activeMode === 'image_edit';
  const imageSize =
    inputs.imageSize === undefined || inputs.imageSize === null
      ? '1024x1024'
      : inputs.imageSize;
  const imageSizeSelectValue = IMAGE_SIZE_OPTIONS.includes(imageSize)
    ? imageSize
    : IMAGE_SIZE_OPTIONS[0];

  const handleSubmit = useCallback(() => {
    const content = text.trim();
    if (!content) return;
    onSubmit?.(content);
    setText('');
  }, [onSubmit, text]);

  const handleKeyDown = useCallback(
    (event) => {
      if (event.key !== 'Enter' || event.shiftKey) return;
      event.preventDefault();
      handleSubmit();
    },
    [handleSubmit],
  );

  return (
    <div className='px-3 pb-2 sm:px-6 sm:pb-3' ref={containerRef}>
      <div className='mx-auto grid w-full max-w-4xl gap-3'>
        <div className='playground-composer playground-default-composer rounded-xl border border-[var(--semi-color-border)] bg-[var(--semi-color-bg-0)]'>
          <div className='px-4 pt-3'>
            <TextArea
              autosize={{ minRows: 2, maxRows: 6 }}
              value={text}
              onChange={(value) => setText(value)}
              onKeyDown={handleKeyDown}
              placeholder={t('Ask anything')}
              className='playground-inline-textarea playground-default-textarea'
            />
          </div>

          {compactImages.length > 0 && (
            <div className='image-list-scroll flex gap-2 overflow-x-auto px-4 pt-3'>
              {compactImages.map((url, index) => (
                <div
                  key={`${url}-${index}`}
                  className='group relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl border border-[var(--semi-color-border)] bg-[var(--semi-color-fill-0)]'
                >
                  <img
                    src={url}
                    alt={t('Reference image')}
                    className='h-full w-full object-cover'
                  />
                  <button
                    type='button'
                    className='absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/65 text-white opacity-0 transition-opacity group-hover:opacity-100'
                    onClick={() => handleRemoveImage(index)}
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {activeMode === 'image_edit' && compactImages.length === 0 && (
            <div className='px-4 pt-3'>
              <Typography.Text className='text-xs text-[var(--semi-color-text-2)]'>
                {t('Upload or paste references to redraw, replace, or extend the image.')}
              </Typography.Text>
            </div>
          )}

          <div className='playground-default-footer flex items-center justify-between gap-2 p-2.5'>
            <div className='playground-default-tools flex min-w-0 items-center gap-2'>
              <input
                ref={fileInputRef}
                type='file'
                accept='image/*'
                multiple
                className='hidden'
                onChange={handleFileChange}
              />
              <Button
                icon={<Paperclip size={15} />}
                size='small'
                theme='outline'
                type='tertiary'
                onClick={() => {
                  onImageEnabledChange?.(true);
                  fileInputRef.current?.click();
                }}
                className='playground-tool-button !rounded-md'
              >
                <span className='hidden xl:inline'>{t('Upload photo')}</span>
              </Button>
              <Button
                icon={<Globe size={15} />}
                size='small'
                theme='outline'
                type='tertiary'
                onClick={() => Toast.info(t('Search feature in development'))}
                className='playground-tool-button !rounded-md'
              >
                <span className='hidden xl:inline'>{t('Search')}</span>
              </Button>
              {modeItems.map((item) => {
                const Icon = item.icon;
                const selected = activeMode === item.key;
                return (
                  <Button
                    key={item.key}
                    size='small'
                    theme={selected ? 'solid' : 'borderless'}
                    type={selected ? 'primary' : 'tertiary'}
                    icon={<Icon size={14} />}
                    onClick={() => handleModeChange(item.key)}
                    className='playground-mode-button !rounded-full'
                    data-active={selected ? 'true' : 'false'}
                  >
                    {t(getCompactModeLabel(item.key, item.label))}
                  </Button>
                );
              })}
              {compactImages.length > 0 && (
                <button
                  type='button'
                  className='playground-reference-badge'
                  onClick={() => onImageUrlsChange?.([''])}
                  title={t('Clear references')}
                >
                  {t('{{count}} references', {
                    count: compactImages.length,
                  })}
                </button>
              )}
            </div>

            <div className='playground-default-actions flex min-w-0 items-center justify-end gap-2'>
              <Select
                placeholder={t('Select Model')}
                value={inputs.model}
                optionList={models}
                filter={selectFilter}
                autoClearSearchValue={false}
                onChange={(value) => onInputChange?.('model', value)}
                size='small'
                className='playground-compact-select playground-model-select'
                {...selectPopupProps}
              />
              <Select
                placeholder={t('Choose Group')}
                value={inputs.group}
                optionList={groups}
                filter={selectFilter}
                renderOptionItem={renderGroupOption}
                renderSelectedItem={renderSelectedGroup}
                autoClearSearchValue={false}
                onChange={(value) => onInputChange?.('group', value)}
                size='small'
                className='playground-compact-select playground-group-select'
                {...selectPopupProps}
              />
              {activeMode === 'chat' && (
                <div className='playground-stream-toggle hidden h-8 items-center gap-2 rounded-md border border-[var(--semi-color-border)] px-2.5 sm:flex'>
                  <span className='hidden whitespace-nowrap text-xs text-[var(--semi-color-text-2)] xl:inline'>
                    {t('Streaming')}
                  </span>
                  <Switch
                    checked={inputs.stream}
                    onChange={(checked) => onInputChange?.('stream', checked)}
                    size='small'
                  />
                </div>
              )}
              <Button
                icon={<ArrowUp size={18} strokeWidth={2.6} />}
                aria-label={t('Send')}
                className='playground-send-button !rounded-full flex-shrink-0'
                disabled={!text.trim()}
                onClick={handleSubmit}
                style={{
                  width: 34,
                  height: 34,
                  minWidth: 34,
                  padding: 0,
                }}
              />
            </div>
          </div>
        </div>

        {isImageMode && (
          <div className='playground-size-bar flex flex-wrap items-center gap-2 rounded-xl border border-[var(--semi-color-border)] bg-[var(--semi-color-bg-0)] px-3 py-2'>
            <span className='text-xs font-medium text-[var(--semi-color-text-2)]'>
              {t('Image size')}
            </span>
            <Select
              placeholder={t('Image size')}
              value={imageSizeSelectValue}
              optionList={fixedImageSizeOptions}
              onChange={(value) => onInputChange?.('imageSize', value)}
              size='small'
              className='playground-compact-select playground-size-select'
              {...selectPopupProps}
            />
          </div>
        )}

        {activeMode === 'chat' && (
          <div className='playground-mobile-stream-toggle flex items-center gap-2 rounded-xl border border-[var(--semi-color-border)] bg-[var(--semi-color-bg-0)] px-3 py-2 sm:hidden'>
            <span className='text-xs font-medium text-[var(--semi-color-text-2)]'>
              {t('Streaming')}
            </span>
            <Switch
              checked={inputs.stream}
              onChange={(checked) => onInputChange?.('stream', checked)}
              size='small'
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default CustomInputRender;
