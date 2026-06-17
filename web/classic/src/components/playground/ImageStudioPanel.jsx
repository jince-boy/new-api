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

import React, { useCallback, useRef } from 'react';
import { Button, Select, Toast, Tooltip, Typography } from '@douyinfe/semi-ui';
import {
  Copy,
  Download,
  Image as ImageIcon,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { renderGroupOption, selectFilter } from '../../helpers';
import { IMAGE_SIZE_OPTIONS } from '../../constants/playground.constants';

const imageSizeOptions = IMAGE_SIZE_OPTIONS.map((value) => ({
  label: value,
  value,
}));

const imageCountOptions = [1, 2, 3, 4].map((value) => ({
  label: String(value),
  value,
}));

const imageQualityOptions = [
  { label: 'auto', value: 'auto' },
  { label: 'standard', value: 'standard' },
  { label: 'hd', value: 'hd' },
  { label: 'high', value: 'high' },
  { label: 'medium', value: 'medium' },
  { label: 'low', value: 'low' },
];

const readImageAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    if (!file?.type?.startsWith('image/')) {
      reject(new Error('invalid-image'));
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => resolve(event.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const ImageTile = ({ asset, onUseAsReference, onDelete }) => {
  const { t } = useTranslation();

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(asset.url);
      Toast.success(t('Image URL copied'));
    } catch {
      Toast.error(t('Failed to copy image URL'));
    }
  };

  return (
    <article className='playground-image-tile'>
      <div className='playground-image-thumb'>
        <img src={asset.url} alt={asset.prompt || t('Creative result')} />
      </div>
      <div className='playground-image-tile-body'>
        <Typography.Text className='line-clamp-2 text-xs text-[var(--semi-color-text-1)]'>
          {asset.prompt || t('No prompt')}
        </Typography.Text>
        <div className='flex flex-wrap items-center gap-1.5'>
          <Tooltip content={t('Use as reference')}>
            <Button
              icon={<Plus size={13} />}
              size='small'
              theme='borderless'
              type='tertiary'
              onClick={() => onUseAsReference(asset.url)}
              className='!h-7 !w-7 !rounded-full !p-0'
            />
          </Tooltip>
          <Tooltip content={t('Copy image URL')}>
            <Button
              icon={<Copy size={13} />}
              size='small'
              theme='borderless'
              type='tertiary'
              onClick={copyUrl}
              className='!h-7 !w-7 !rounded-full !p-0'
            />
          </Tooltip>
          <Tooltip content={t('Download image')}>
            <a href={asset.url} download className='playground-icon-link'>
              <Download size={13} />
            </a>
          </Tooltip>
          {onDelete && (
            <Tooltip content={t('Delete image')}>
              <Button
                icon={<Trash2 size={13} />}
                size='small'
                theme='borderless'
                type='danger'
                onClick={() => onDelete(asset.id)}
                className='!h-7 !w-7 !rounded-full !p-0'
              />
            </Tooltip>
          )}
        </div>
      </div>
    </article>
  );
};

const ImageStudioPanel = ({
  activeMode,
  modeItems,
  inputs,
  models,
  groups,
  references,
  latestImages,
  imageLibrary,
  onModeChange,
  onInputChange,
  onAddReferences,
  onRemoveReference,
  onClearReferences,
  onUseImageAsReference,
  onDeleteImageAsset,
  onClearImageLibrary,
}) => {
  const { t } = useTranslation();
  const fileInputRef = useRef(null);
  const isImageMode = activeMode === 'image' || activeMode === 'image_edit';
  const hasReferences = references.length > 0;
  const imageSizeValue = IMAGE_SIZE_OPTIONS.includes(inputs.imageSize)
    ? inputs.imageSize
    : IMAGE_SIZE_OPTIONS[0];

  const handleFileChange = useCallback(
    async (event) => {
      const files = Array.from(event.target.files || []);
      event.target.value = '';
      if (files.length === 0) return;

      try {
        const dataUrls = await Promise.all(files.map(readImageAsDataUrl));
        onAddReferences(dataUrls);
        Toast.success(t('Reference image added'));
      } catch {
        Toast.warning(t('Please select image files'));
      }
    },
    [onAddReferences, t],
  );

  return (
    <aside className='playground-studio-panel'>
      <section className='playground-studio-section playground-studio-hero'>
        <div>
          <Typography.Text className='playground-studio-kicker'>
            {t('Image studio')}
          </Typography.Text>
          <Typography.Title heading={5} className='!mb-1'>
            {t('Image generation and editing')}
          </Typography.Title>
          <Typography.Text className='text-xs text-[var(--semi-color-text-2)]'>
            {t('Prompt, references, output size, and local image library')}
          </Typography.Text>
        </div>
      </section>

      <section className='playground-studio-section'>
        <Typography.Text strong>{t('Creative mode')}</Typography.Text>
        <div className='playground-mode-grid'>
          {modeItems.map((item) => {
            const Icon = item.icon;
            const selected = activeMode === item.key;
            return (
              <button
                type='button'
                key={item.key}
                data-active={selected ? 'true' : 'false'}
                className='playground-mode-card'
                onClick={() => onModeChange(item.key)}
              >
                <Icon size={17} />
                <span>{t(item.label)}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className='playground-studio-section'>
        <div className='flex items-center justify-between gap-2'>
          <Typography.Text strong>{t('Output settings')}</Typography.Text>
          <Typography.Text className='text-xs text-[var(--semi-color-text-2)]'>
            {isImageMode
              ? t('Image requests use these settings')
              : t('Chat keeps image settings idle')}
          </Typography.Text>
        </div>
        <div className='playground-studio-fields'>
          <Select
            placeholder={t('Select Model')}
            value={inputs.model}
            optionList={models}
            filter={selectFilter}
            autoClearSearchValue={false}
            onChange={(value) => onInputChange('model', value)}
            size='small'
          />
          <Select
            placeholder={t('Choose Group')}
            value={inputs.group}
            optionList={groups}
            filter={selectFilter}
            renderOptionItem={renderGroupOption}
            autoClearSearchValue={false}
            onChange={(value) => onInputChange('group', value)}
            size='small'
          />
          <Select
            placeholder={t('Image size')}
            value={imageSizeValue}
            optionList={imageSizeOptions}
            onChange={(value) => onInputChange('imageSize', value)}
            size='small'
          />
          <Select
            placeholder={t('Image count')}
            value={inputs.imageCount || 1}
            optionList={imageCountOptions}
            onChange={(value) => onInputChange('imageCount', value)}
            size='small'
          />
          <Select
            placeholder={t('Image quality')}
            value={inputs.imageQuality || 'auto'}
            optionList={imageQualityOptions}
            onChange={(value) => onInputChange('imageQuality', value)}
            size='small'
          />
        </div>
      </section>

      <section className='playground-studio-section'>
        <div className='flex items-center justify-between gap-2'>
          <Typography.Text strong>{t('Reference images')}</Typography.Text>
          <div className='flex items-center gap-1'>
            <input
              ref={fileInputRef}
              type='file'
              accept='image/*'
              multiple
              className='hidden'
              onChange={handleFileChange}
            />
            <Tooltip content={t('Upload reference images')}>
              <Button
                icon={<Upload size={14} />}
                size='small'
                theme='borderless'
                type='tertiary'
                onClick={() => fileInputRef.current?.click()}
                className='!rounded-full'
              />
            </Tooltip>
            {hasReferences && (
              <Tooltip content={t('Clear references')}>
                <Button
                  icon={<Trash2 size={14} />}
                  size='small'
                  theme='borderless'
                  type='danger'
                  onClick={onClearReferences}
                  className='!rounded-full'
                />
              </Tooltip>
            )}
          </div>
        </div>
        {hasReferences ? (
          <div className='playground-reference-grid'>
            {references.map((url, index) => (
              <div className='playground-reference-thumb' key={`${url}-${index}`}>
                <img src={url} alt={t('Reference image')} />
                <button type='button' onClick={() => onRemoveReference(index)}>
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className='playground-empty-reference'>
            <ImageIcon size={18} />
            <span>
              {activeMode === 'image_edit'
                ? t('Image-to-image needs at least one reference image.')
                : t('Optional: upload references to switch into image-to-image.')}
            </span>
          </div>
        )}
      </section>

      <section className='playground-studio-section'>
        <div className='flex items-center justify-between gap-2'>
          <Typography.Text strong>{t('Output canvas')}</Typography.Text>
          <Typography.Text className='text-xs text-[var(--semi-color-text-2)]'>
            {latestImages.length > 0
              ? t('{{count}} result images', { count: latestImages.length })
              : t('Waiting for generation')}
          </Typography.Text>
        </div>
        {latestImages.length > 0 ? (
          <div className='playground-canvas-grid'>
            {latestImages.map((asset) => (
              <ImageTile
                key={asset.id}
                asset={asset}
                onUseAsReference={onUseImageAsReference}
              />
            ))}
          </div>
        ) : (
          <div className='playground-studio-empty'>
            <ImageIcon size={28} />
            <Typography.Text strong>{t('No images yet')}</Typography.Text>
            <Typography.Text className='text-xs text-[var(--semi-color-text-2)]'>
              {t(
                'Generated images will appear here after you submit a prompt in image mode.',
              )}
            </Typography.Text>
          </div>
        )}
      </section>

      <section className='playground-studio-section'>
        <div className='flex items-center justify-between gap-2'>
          <Typography.Text strong>{t('Local image library')}</Typography.Text>
          {imageLibrary.length > 0 && (
            <Button
              icon={<Trash2 size={13} />}
              size='small'
              theme='borderless'
              type='danger'
              onClick={onClearImageLibrary}
              className='!rounded-full'
            >
              {t('Clear')}
            </Button>
          )}
        </div>
        {imageLibrary.length > 0 ? (
          <div className='playground-library-grid'>
            {imageLibrary.slice(0, 12).map((asset) => (
              <ImageTile
                key={asset.id}
                asset={asset}
                onUseAsReference={onUseImageAsReference}
                onDelete={onDeleteImageAsset}
              />
            ))}
          </div>
        ) : (
          <Typography.Text className='text-xs text-[var(--semi-color-text-2)]'>
            {t('Generated images are saved in this browser.')}
          </Typography.Text>
        )}
      </section>
    </aside>
  );
};

export default ImageStudioPanel;
