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

import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  Card,
  Col,
  DatePicker,
  Form,
  Input,
  Modal,
  Row,
  Slider,
  Space,
  Typography,
} from '@douyinfe/semi-ui';
import { CalendarClock, Crop, ExternalLink, Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { StatusContext } from '../../context/Status';
import { API, copy, showError, showSuccess } from '../../helpers';

const GROUP_CHAT_QRCODE_PUBLIC_PATH = '/api/group-chat-qrcode';
const MAX_CROP_PREVIEW_SIZE = 360;
const MAX_CROP_OUTPUT_SIZE = 1024;

function resolvePublicURL(value) {
  if (!value) return '';
  try {
    return new URL(value, window.location.origin).toString();
  } catch {
    return value;
  }
}

function resolvePreviewURL(value, cacheBust) {
  if (!value) return '';
  try {
    const url = new URL(value);
    url.searchParams.set('_', String(cacheBust));
    return url.toString();
  } catch {
    const separator = value.includes('?') ? '&' : '?';
    return `${value}${separator}_=${cacheBust}`;
  }
}

function dateFromOptionValue(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return null;

  if (/^\d+$/.test(normalized)) {
    const timestamp = Number(normalized);
    const date = new Date(
      timestamp > 1_000_000_000_000 ? timestamp : timestamp * 1000,
    );
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatExpirationTime(value) {
  const date = dateFromOptionValue(value);
  return date ? date.toLocaleString() : '';
}

function normalizeDatePickerValue(value) {
  if (!value) return undefined;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function endOfDay(date) {
  const nextDate = new Date(date);
  nextDate.setHours(23, 59, 59, 999);
  return nextDate;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function createCenteredCropFrame(width, height) {
  const size = Math.min(width, height);
  return {
    x: Math.round((width - size) / 2),
    y: Math.round((height - size) / 2),
    size,
  };
}

function getMinimumCropSize(image) {
  const shortestSide = Math.min(image.naturalWidth, image.naturalHeight);
  return Math.min(shortestSide, Math.max(32, Math.round(shortestSide * 0.2)));
}

function getPreviewMetrics(image) {
  const scale = Math.min(
    MAX_CROP_PREVIEW_SIZE / image.naturalWidth,
    MAX_CROP_PREVIEW_SIZE / image.naturalHeight,
    1,
  );
  return {
    displayWidth: Math.round(image.naturalWidth * scale),
    displayHeight: Math.round(image.naturalHeight * scale),
    scale,
  };
}

function readImageSize(objectURL) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      if (!image.naturalWidth || !image.naturalHeight) {
        reject(new Error('Image has no dimensions'));
        return;
      }
      resolve({
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
      });
    };
    image.onerror = () => reject(new Error('Unable to load image'));
    image.src = objectURL;
  });
}

function loadImageElement(objectURL) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Unable to load image'));
    image.src = objectURL;
  });
}

async function cropImageToFile(image, frame) {
  const sourceImage = await loadImageElement(image.objectURL);
  const outputSize = clamp(Math.round(frame.size), 1, MAX_CROP_OUTPUT_SIZE);
  const canvas = document.createElement('canvas');
  canvas.width = outputSize;
  canvas.height = outputSize;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas is not available');
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(
    sourceImage,
    frame.x,
    frame.y,
    frame.size,
    frame.size,
    0,
    0,
    outputSize,
    outputSize,
  );

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((nextBlob) => {
      if (!nextBlob) {
        reject(new Error('Failed to create cropped image'));
        return;
      }
      resolve(nextBlob);
    }, 'image/png');
  });

  return new File([blob], `group-chat-qrcode-${Date.now()}.png`, {
    type: 'image/png',
  });
}

const GroupChatQRCodeSetting = () => {
  const { t } = useTranslation();
  const [statusState, statusDispatch] = useContext(StatusContext);
  const fileInputRef = useRef();
  const cropAreaRef = useRef();
  const selectedImageRef = useRef(null);
  const dragStateRef = useRef(null);
  const [groupChatQRCodeURL, setGroupChatQRCodeURL] = useState('');
  const [groupChatQRCodeExpiresAt, setGroupChatQRCodeExpiresAt] = useState('');
  const [expiresAtDate, setExpiresAtDate] = useState();
  const [previewCacheBust, setPreviewCacheBust] = useState(() => Date.now());
  const [loading, setLoading] = useState(false);
  const [cropVisible, setCropVisible] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [cropFrame, setCropFrame] = useState(null);

  useEffect(() => {
    getOptions();
    return () => {
      if (selectedImageRef.current) {
        URL.revokeObjectURL(selectedImageRef.current.objectURL);
      }
    };
  }, []);

  const resolvedGroupChatQRCodeURL = useMemo(
    () => resolvePublicURL(groupChatQRCodeURL),
    [groupChatQRCodeURL],
  );

  const previewGroupChatQRCodeURL = useMemo(
    () => resolvePreviewURL(resolvedGroupChatQRCodeURL, previewCacheBust),
    [previewCacheBust, resolvedGroupChatQRCodeURL],
  );

  const minExpirationDate = useMemo(
    () => new Date(Date.now() + 60_000),
    [],
  );

  const minSelectableDate = useMemo(
    () =>
      new Date(
        minExpirationDate.getFullYear(),
        minExpirationDate.getMonth(),
        minExpirationDate.getDate(),
      ),
    [minExpirationDate],
  );

  const expirationText = useMemo(() => {
    const formattedTime = formatExpirationTime(groupChatQRCodeExpiresAt);
    return formattedTime
      ? t('The QR code expires at {{time}}', { time: formattedTime })
      : t('No expiration time has been set.');
  }, [groupChatQRCodeExpiresAt, t]);

  const previewMetrics = useMemo(
    () => (selectedImage ? getPreviewMetrics(selectedImage) : null),
    [selectedImage],
  );

  const cropSizeRange = useMemo(() => {
    if (!selectedImage) {
      return { min: 1, max: 1 };
    }
    return {
      min: getMinimumCropSize(selectedImage),
      max: Math.min(selectedImage.naturalWidth, selectedImage.naturalHeight),
    };
  }, [selectedImage]);

  const setNextSelectedImage = (image) => {
    if (selectedImageRef.current) {
      URL.revokeObjectURL(selectedImageRef.current.objectURL);
    }
    selectedImageRef.current = image;
    setSelectedImage(image);
  };

  const closeCropModal = () => {
    dragStateRef.current = null;
    setCropVisible(false);
    setCropFrame(null);
    setNextSelectedImage(null);
  };

  const getOptions = async () => {
    const res = await API.get('/api/option/');
    const { success, message, data } = res.data;
    if (!success) {
      showError(message);
      return;
    }

    const imageURLOption = data.find(
      (item) => item.key === 'GroupChatQRCodeImageURL',
    );
    const expiresAtOption = data.find(
      (item) => item.key === 'GroupChatQRCodeExpiresAt',
    );
    const nextExpiresAt = expiresAtOption?.value || '';
    setGroupChatQRCodeURL(imageURLOption?.value || '');
    setGroupChatQRCodeExpiresAt(nextExpiresAt);
    setExpiresAtDate(dateFromOptionValue(nextExpiresAt) || undefined);
  };

  const uploadQRCodeFile = async (file) => {
    const expiresAtPayload = expiresAtDate?.toISOString() || '';
    if (
      !expiresAtPayload ||
      !expiresAtDate ||
      expiresAtDate < minExpirationDate
    ) {
      showError(t('Please select the QR code expiration time'));
      return false;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('expires_at', expiresAtPayload);
      const res = await API.post('/api/option/group-chat-qrcode', formData);
      const { success, message, data } = res.data;
      if (!success) {
        showError(message || t('Failed to upload QR code'));
        return false;
      }

      const nextURL = data?.url || GROUP_CHAT_QRCODE_PUBLIC_PATH;
      const nextExpiresAt = data?.expires_at || expiresAtPayload;
      setGroupChatQRCodeURL(nextURL);
      setGroupChatQRCodeExpiresAt(nextExpiresAt);
      setExpiresAtDate(dateFromOptionValue(nextExpiresAt) || undefined);
      setPreviewCacheBust(Date.now());
      const nextStatus = {
        ...(statusState?.status || {}),
        group_chat_qrcode: nextURL,
        group_chat_qrcode_expires_at: nextExpiresAt,
      };
      statusDispatch({ type: 'set', payload: nextStatus });
      localStorage.setItem('status', JSON.stringify(nextStatus));
      closeCropModal();
      showSuccess(t('QR code uploaded successfully'));
      return true;
    } catch (error) {
      console.error('Failed to upload group chat QR code', error);
      showError(t('Failed to upload QR code'));
      return false;
    } finally {
      setLoading(false);
    }
  };

  const handleSelectQRCodeImage = () => {
    if (!expiresAtDate || expiresAtDate < minExpirationDate) {
      showError(t('Please select the QR code expiration time'));
      return;
    }
    fileInputRef.current?.click();
  };

  const handleExpiresDateChange = (date) => {
    const selectedDate = normalizeDatePickerValue(date);
    if (!selectedDate) {
      setExpiresAtDate(undefined);
      return;
    }
    setExpiresAtDate(endOfDay(selectedDate));
  };

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const objectURL = URL.createObjectURL(file);
    try {
      const imageSize = await readImageSize(objectURL);
      const nextImage = {
        file,
        objectURL,
        ...imageSize,
      };
      setNextSelectedImage(nextImage);
      setCropFrame(
        createCenteredCropFrame(
          nextImage.naturalWidth,
          nextImage.naturalHeight,
        ),
      );
      setCropVisible(true);
    } catch (error) {
      URL.revokeObjectURL(objectURL);
      showError(t('Failed to prepare image'));
    }
  };

  const copyGroupChatQRCodeURL = async () => {
    const url = resolvePublicURL(groupChatQRCodeURL);
    if (!url) return;
    if (await copy(url)) {
      showSuccess(t('Copied to clipboard'));
      return;
    }
    showError(t('Failed to copy to clipboard'));
  };

  const updateCropSize = (nextSizeValue) => {
    if (!selectedImage) return;
    setCropFrame((current) => {
      if (!current) return current;
      const nextSize = clamp(
        Math.round(nextSizeValue),
        cropSizeRange.min,
        cropSizeRange.max,
      );
      const centerX = current.x + current.size / 2;
      const centerY = current.y + current.size / 2;
      return {
        x: clamp(
          centerX - nextSize / 2,
          0,
          selectedImage.naturalWidth - nextSize,
        ),
        y: clamp(
          centerY - nextSize / 2,
          0,
          selectedImage.naturalHeight - nextSize,
        ),
        size: nextSize,
      };
    });
  };

  const moveCropFrame = (nextX, nextY) => {
    if (!selectedImage) return;
    setCropFrame((current) => {
      if (!current) return current;
      return {
        ...current,
        x: clamp(nextX, 0, selectedImage.naturalWidth - current.size),
        y: clamp(nextY, 0, selectedImage.naturalHeight - current.size),
      };
    });
  };

  const handleCropPointerDown = (event) => {
    if (!previewMetrics || !cropFrame || event.button !== 0) return;
    event.preventDefault();
    const cropArea = cropAreaRef.current;
    if (!cropArea) return;

    const bounds = cropArea.getBoundingClientRect();
    const pointerX = (event.clientX - bounds.left) / previewMetrics.scale;
    const pointerY = (event.clientY - bounds.top) / previewMetrics.scale;
    dragStateRef.current = {
      pointerId: event.pointerId,
      offsetX: pointerX - cropFrame.x,
      offsetY: pointerY - cropFrame.y,
    };
    cropArea.setPointerCapture(event.pointerId);
  };

  const handleCropPointerMove = (event) => {
    if (!previewMetrics) return;
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    const cropArea = cropAreaRef.current;
    if (!cropArea) return;

    const bounds = cropArea.getBoundingClientRect();
    const pointerX = (event.clientX - bounds.left) / previewMetrics.scale;
    const pointerY = (event.clientY - bounds.top) / previewMetrics.scale;
    moveCropFrame(pointerX - dragState.offsetX, pointerY - dragState.offsetY);
  };

  const handleCropPointerUp = (event) => {
    const cropArea = cropAreaRef.current;
    if (cropArea?.hasPointerCapture(event.pointerId)) {
      cropArea.releasePointerCapture(event.pointerId);
    }
    if (dragStateRef.current?.pointerId === event.pointerId) {
      dragStateRef.current = null;
    }
  };

  const handleCropKeyDown = (event) => {
    if (!cropFrame) return;
    const step = event.shiftKey ? 10 : 1;
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      moveCropFrame(cropFrame.x - step, cropFrame.y);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      moveCropFrame(cropFrame.x + step, cropFrame.y);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveCropFrame(cropFrame.x, cropFrame.y - step);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveCropFrame(cropFrame.x, cropFrame.y + step);
    }
  };

  const handleCropAndUpload = async () => {
    if (!selectedImage || !cropFrame) return;
    try {
      const croppedFile = await cropImageToFile(selectedImage, cropFrame);
      await uploadQRCodeFile(croppedFile);
    } catch (error) {
      console.error('Failed to crop group chat QR code', error);
      showError(t('Failed to crop image'));
    }
  };

  return (
    <Row>
      <Col
        span={24}
        style={{
          marginTop: '10px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
        }}
      >
        <Form>
          <Card>
            <Form.Section text={t('Group Chat QR Code')}>
              <Typography.Paragraph type='tertiary'>
                {t(
                  'Upload the current WeChat group QR code and share the public link below.',
                )}
              </Typography.Paragraph>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                  gap: 24,
                  alignItems: 'start',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 18,
                    minWidth: 0,
                  }}
                >
                  <div>
                    <Typography.Text strong>
                      {t('QR code expiration time')}
                    </Typography.Text>
                    <DatePicker
                      type='date'
                      value={expiresAtDate}
                      format='yyyy-MM-dd'
                      placeholder={t(
                        'Please select the QR code expiration time',
                      )}
                      prefix={<CalendarClock size={16} />}
                      inputReadOnly
                      showClear
                      onChangeWithDateFirst
                      disabledDate={(date) =>
                        Boolean(date && date < minSelectableDate)
                      }
                      onChange={handleExpiresDateChange}
                      aria-label={t('QR code expiration time')}
                      style={{ marginTop: 8, width: '100%' }}
                    />
                    <Typography.Paragraph
                      type='tertiary'
                      style={{ marginTop: 6, marginBottom: 0 }}
                    >
                      {t(
                        'The system will email root users within 24 hours before the QR code expires.',
                      )}
                    </Typography.Paragraph>
                  </div>

                  <div>
                    <Typography.Text strong>
                      {t('Group chat QR code public link')}
                    </Typography.Text>
                    <Input
                      value={resolvedGroupChatQRCodeURL}
                      readOnly
                      placeholder={t(
                        'No group chat QR code has been uploaded yet.',
                      )}
                      aria-label={t('Group chat QR code public link')}
                      style={{ marginTop: 8, width: '100%' }}
                    />
                  </div>

                  <input
                    ref={fileInputRef}
                    type='file'
                    accept='image/png,image/jpeg,image/webp,image/gif'
                    style={{ display: 'none' }}
                    onChange={handleFileChange}
                  />
                  <Space wrap>
                    <Button
                      type='primary'
                      icon={<Upload size={16} />}
                      onClick={handleSelectQRCodeImage}
                      loading={loading}
                    >
                      {t('Select QR Code Image')}
                    </Button>
                    <Button
                      disabled={!groupChatQRCodeURL}
                      onClick={copyGroupChatQRCodeURL}
                    >
                      {t('Copy public link')}
                    </Button>
                    <Button
                      icon={<ExternalLink size={16} />}
                      disabled={!groupChatQRCodeURL}
                      onClick={() =>
                        window.open(
                          resolvedGroupChatQRCodeURL,
                          '_blank',
                          'noopener,noreferrer',
                        )
                      }
                    >
                      {t('Open public link')}
                    </Button>
                  </Space>
                </div>

                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 10,
                    minWidth: 0,
                  }}
                >
                  <Typography.Text strong>
                    {t('Group chat QR code preview')}
                  </Typography.Text>
                  <div
                    style={{
                      width: 220,
                      maxWidth: '100%',
                      aspectRatio: '1 / 1',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: '1px solid var(--semi-color-border)',
                      borderRadius: 8,
                      background: 'var(--semi-color-fill-0)',
                      padding: 12,
                    }}
                  >
                    {groupChatQRCodeURL ? (
                      <img
                        src={previewGroupChatQRCodeURL}
                        alt={t('Group chat QR code preview')}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'contain',
                        }}
                      />
                    ) : (
                      <Typography.Text
                        type='tertiary'
                        style={{ textAlign: 'center' }}
                      >
                        {t('No group chat QR code has been uploaded yet.')}
                      </Typography.Text>
                    )}
                  </div>
                  <Typography.Text
                    type='tertiary'
                    style={{ textAlign: 'center' }}
                  >
                    {expirationText}
                  </Typography.Text>
                </div>
              </div>
            </Form.Section>
          </Card>
        </Form>
      </Col>

      <Modal
        title={t('Crop QR Code')}
        visible={cropVisible}
        onCancel={() => {
          if (!loading) closeCropModal();
        }}
        maskClosable={!loading}
        closeOnEsc={!loading}
        footer={
          <Space>
            <Button onClick={closeCropModal} disabled={loading}>
              {t('Cancel')}
            </Button>
            <Button
              onClick={() =>
                selectedImage && uploadQRCodeFile(selectedImage.file)
              }
              disabled={!selectedImage}
              loading={loading}
            >
              {t('Use original image')}
            </Button>
            <Button
              type='primary'
              icon={<Crop size={16} />}
              onClick={handleCropAndUpload}
              disabled={!selectedImage || !cropFrame}
              loading={loading}
            >
              {t('Crop and upload')}
            </Button>
          </Space>
        }
      >
        <Typography.Paragraph type='tertiary'>
          {t(
            'Move the crop box over the QR code, then upload the cropped image.',
          )}
        </Typography.Paragraph>
        {selectedImage && previewMetrics && cropFrame ? (
          <>
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                overflow: 'auto',
                border: '1px solid var(--semi-color-border)',
                borderRadius: 8,
                background: 'var(--semi-color-fill-0)',
                padding: 12,
              }}
            >
              <div
                ref={cropAreaRef}
                style={{
                  position: 'relative',
                  flexShrink: 0,
                  touchAction: 'none',
                  userSelect: 'none',
                  width: previewMetrics.displayWidth,
                  height: previewMetrics.displayHeight,
                }}
                onPointerMove={handleCropPointerMove}
                onPointerUp={handleCropPointerUp}
                onPointerCancel={handleCropPointerUp}
              >
                <img
                  src={selectedImage.objectURL}
                  alt={t('Group chat QR code preview')}
                  style={{
                    display: 'block',
                    width: previewMetrics.displayWidth,
                    height: previewMetrics.displayHeight,
                    objectFit: 'contain',
                    borderRadius: 8,
                  }}
                />
                <div
                  role='button'
                  tabIndex={0}
                  aria-label={t('Drag to crop')}
                  style={{
                    position: 'absolute',
                    left: cropFrame.x * previewMetrics.scale,
                    top: cropFrame.y * previewMetrics.scale,
                    width: cropFrame.size * previewMetrics.scale,
                    height: cropFrame.size * previewMetrics.scale,
                    cursor: 'move',
                    border: '2px solid var(--semi-color-primary)',
                    borderRadius: 8,
                    background: 'rgba(var(--semi-primary-5), 0.08)',
                    boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.22)',
                    outline: 'none',
                  }}
                  onPointerDown={handleCropPointerDown}
                  onKeyDown={handleCropKeyDown}
                />
              </div>
            </div>

            <div style={{ marginTop: 16 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 12,
                  marginBottom: 8,
                }}
              >
                <Typography.Text strong>{t('Crop size')}</Typography.Text>
                <Typography.Text type='tertiary'>
                  {Math.round(cropFrame.size)}px
                </Typography.Text>
              </div>
              <Slider
                min={cropSizeRange.min}
                max={cropSizeRange.max}
                step={1}
                value={cropFrame.size}
                onChange={updateCropSize}
                disabled={loading}
              />
              <Typography.Paragraph type='tertiary' style={{ marginTop: 8 }}>
                {t(
                  'Drag the crop box or use the size slider to keep the QR code inside the square.',
                )}
              </Typography.Paragraph>
            </div>
          </>
        ) : (
          <Typography.Paragraph type='tertiary'>
            {t('Failed to prepare image')}
          </Typography.Paragraph>
        )}
      </Modal>
    </Row>
  );
};

export default GroupChatQRCodeSetting;
