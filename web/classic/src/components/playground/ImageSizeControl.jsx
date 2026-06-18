/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

import React, { useEffect, useMemo, useState } from 'react';
import { InputNumber, Select } from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';
import {
  CUSTOM_IMAGE_SIZE_VALUE,
  IMAGE_SIZE_OPTIONS,
  isPresetImageSize,
  normalizeImageSizeInput,
  parseImageSizeDimensions,
  validateImageSize,
} from '../../constants/playground.constants';

const imageSizeOptions = [
  ...IMAGE_SIZE_OPTIONS.map((value) => ({
    label: value,
    value,
  })),
  {
    label: 'Custom size',
    value: CUSTOM_IMAGE_SIZE_VALUE,
  },
];

const ImageSizeControl = ({
  value,
  onChange,
  disabled = false,
  className = '',
  selectClassName = '',
  selectProps = {},
  compact = false,
}) => {
  const { t } = useTranslation();
  const normalizedValue = normalizeImageSizeInput(value);
  const [customMode, setCustomMode] = useState(
    Boolean(normalizedValue) && !isPresetImageSize(normalizedValue),
  );
  const [draftWidth, setDraftWidth] = useState(1024);
  const [draftHeight, setDraftHeight] = useState(1024);

  useEffect(() => {
    const dimensions = parseImageSizeDimensions(value);
    if (!dimensions) return;

    setDraftWidth(dimensions.width);
    setDraftHeight(dimensions.height);
    if (!isPresetImageSize(value)) {
      setCustomMode(true);
    }
  }, [value]);

  const selectedValue =
    customMode || !isPresetImageSize(normalizedValue)
      ? CUSTOM_IMAGE_SIZE_VALUE
      : normalizedValue || IMAGE_SIZE_OPTIONS[0];
  const validation = useMemo(
    () => validateImageSize(`${draftWidth}x${draftHeight}`),
    [draftWidth, draftHeight],
  );
  const dropdownClassName = [
    'playground-image-size-dropdown',
    selectProps.dropdownClassName,
  ]
    .filter(Boolean)
    .join(' ');

  const handleDimensionChange = (nextWidth, nextHeight) => {
    setDraftWidth(nextWidth);
    setDraftHeight(nextHeight);
    if (nextWidth && nextHeight) {
      onChange?.(`${nextWidth}x${nextHeight}`);
    }
  };

  return (
    <div className={`playground-image-size-control ${className}`}>
      <div className='playground-image-size-row'>
        <Select
          placeholder={t('Image size')}
          value={selectedValue}
          optionList={imageSizeOptions.map((option) => ({
            ...option,
            label: t(option.label),
          }))}
          onChange={(nextValue) => {
            if (nextValue === CUSTOM_IMAGE_SIZE_VALUE) {
              setCustomMode(true);
              return;
            }
            setCustomMode(false);
            onChange?.(nextValue);
          }}
          disabled={disabled}
          size='small'
          className={selectClassName}
          {...selectProps}
          dropdownClassName={dropdownClassName}
        />
        {customMode && (
          <div
            className={`playground-image-size-custom ${compact ? 'playground-image-size-custom-compact' : ''}`}
          >
            <InputNumber
              value={draftWidth}
              min={1}
              max={99999}
              step={16}
              hideButtons
              disabled={disabled}
              placeholder={t('Width')}
              aria-label={t('Width')}
              onNumberChange={(nextValue) =>
                handleDimensionChange(Number(nextValue) || 0, draftHeight)
              }
            />
            <span>x</span>
            <InputNumber
              value={draftHeight}
              min={1}
              max={99999}
              step={16}
              hideButtons
              disabled={disabled}
              placeholder={t('Height')}
              aria-label={t('Height')}
              onNumberChange={(nextValue) =>
                handleDimensionChange(draftWidth, Number(nextValue) || 0)
              }
            />
          </div>
        )}
      </div>
      {customMode && (
        <div
          className={
            validation.valid
              ? 'playground-image-size-help'
              : 'playground-image-size-help playground-image-size-help-error'
          }
        >
          {validation.valid
            ? t(
                'Custom size rules: long edge <= 3840px; multiples of 16; ratio <= 3:1; total pixels 655,360-8,294,400.',
              )
            : t(validation.reason || 'Invalid image size.')}
        </div>
      )}
    </div>
  );
};

export default ImageSizeControl;
