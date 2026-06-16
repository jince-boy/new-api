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

import React, { useContext, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  Form,
  Modal,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
} from '@douyinfe/semi-ui';
import { IconDelete, IconEdit, IconPlus, IconSave } from '@douyinfe/semi-icons';
import { useTranslation } from 'react-i18next';
import { API, showError, showSuccess } from '../../../helpers';
import { StatusContext } from '../../../context/Status';

const { Text } = Typography;

const parseCustomNavLinks = (raw) => {
  try {
    const parsed = JSON.parse(raw || '[]');
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map((item, index) => ({
        id: index + 1,
        name: typeof item?.name === 'string' ? item.name : '',
        url: typeof item?.url === 'string' ? item.url : '',
        openInNewTab: Boolean(item?.openInNewTab),
      }))
      .filter((item) => item.name.trim() && item.url.trim());
  } catch (error) {
    return [];
  }
};

const serializeCustomNavLinks = (links) =>
  JSON.stringify(
    links.map(({ name, url, openInNewTab }) => ({
      name: name.trim(),
      url: url.trim(),
      openInNewTab,
    })),
  );

const isValidUrl = (value) => {
  if (!value.startsWith('http://') && !value.startsWith('https://')) {
    return false;
  }
  try {
    const parsed = new URL(value);
    return Boolean(parsed.hostname);
  } catch (error) {
    return false;
  }
};

export default function SettingsCustomNavLinks(props) {
  const { t } = useTranslation();
  const [statusState, statusDispatch] = useContext(StatusContext);
  const [loading, setLoading] = useState(false);
  const [links, setLinks] = useState([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingLink, setEditingLink] = useState(null);
  const [formValues, setFormValues] = useState({
    name: '',
    url: '',
    openInNewTab: false,
  });

  useEffect(() => {
    setLinks(parseCustomNavLinks(props.options?.CustomNavLinks));
    setHasChanges(false);
  }, [props.options?.CustomNavLinks]);

  const openAddModal = () => {
    setEditingLink(null);
    setFormValues({
      name: '',
      url: '',
      openInNewTab: false,
    });
    setModalVisible(true);
  };

  const openEditModal = (link) => {
    setEditingLink(link);
    setFormValues({
      name: link.name,
      url: link.url,
      openInNewTab: link.openInNewTab,
    });
    setModalVisible(true);
  };

  const handleDelete = (link) => {
    Modal.confirm({
      title: t('删除导航'),
      content: t('确定要删除该导航吗？'),
      onOk: () => {
        setLinks((prev) => prev.filter((item) => item.id !== link.id));
        setHasChanges(true);
      },
    });
  };

  const handleModalSave = () => {
    const nextValues = {
      name: formValues.name.trim(),
      url: formValues.url.trim(),
      openInNewTab: Boolean(formValues.openInNewTab),
    };

    if (!nextValues.name) {
      showError(t('请输入导航名称'));
      return;
    }
    if (!nextValues.url) {
      showError(t('请输入导航网址'));
      return;
    }
    if (!isValidUrl(nextValues.url)) {
      showError(t('网址必须以 http:// 或 https:// 开头'));
      return;
    }

    if (editingLink) {
      setLinks((prev) =>
        prev.map((item) =>
          item.id === editingLink.id ? { ...item, ...nextValues } : item,
        ),
      );
    } else {
      const nextId = Math.max(...links.map((item) => item.id), 0) + 1;
      setLinks((prev) => [...prev, { id: nextId, ...nextValues }]);
    }
    setHasChanges(true);
    setModalVisible(false);
  };

  const handleSaveAll = async () => {
    setLoading(true);
    const serialized = serializeCustomNavLinks(links);
    try {
      const res = await API.put('/api/option/', {
        key: 'CustomNavLinks',
        value: serialized,
      });
      const { success, message } = res.data;
      if (success) {
        showSuccess(t('保存成功'));
        const nextStatus = {
          ...(statusState?.status || {}),
          CustomNavLinks: serialized,
        };
        statusDispatch({
          type: 'set',
          payload: nextStatus,
        });
        localStorage.setItem('custom_nav_links', serialized);
        localStorage.setItem('status', JSON.stringify(nextStatus));
        setHasChanges(false);
        if (props.refresh) {
          await props.refresh();
        }
      } else {
        showError(message);
      }
    } catch (error) {
      showError(t('保存失败，请重试'));
    } finally {
      setLoading(false);
    }
  };

  const columns = useMemo(
    () => [
      {
        title: t('名称'),
        dataIndex: 'name',
        render: (text) => <Text strong>{text}</Text>,
      },
      {
        title: t('网址'),
        dataIndex: 'url',
        render: (text) => (
          <Text
            type='secondary'
            ellipsis={{ showTooltip: true }}
            style={{ maxWidth: 360, fontFamily: 'monospace' }}
          >
            {text}
          </Text>
        ),
      },
      {
        title: t('新标签页打开'),
        dataIndex: 'openInNewTab',
        width: 140,
        render: (value) => (
          <Tag color={value ? 'green' : 'grey'}>
            {value ? t('开启') : t('关闭')}
          </Tag>
        ),
      },
      {
        title: t('操作'),
        width: 140,
        render: (_, record) => (
          <Space>
            <Button
              type='tertiary'
              size='small'
              icon={<IconEdit />}
              onClick={() => openEditModal(record)}
            />
            <Button
              type='danger'
              size='small'
              icon={<IconDelete />}
              onClick={() => handleDelete(record)}
            />
          </Space>
        ),
      },
    ],
    [t],
  );

  return (
    <Card>
      <Form.Section text={t('导航管理')}>
        <Space style={{ marginBottom: 16 }}>
          <Button type='primary' icon={<IconPlus />} onClick={openAddModal}>
            {t('添加导航')}
          </Button>
          <Button
            type='secondary'
            icon={<IconSave />}
            loading={loading}
            disabled={!hasChanges}
            onClick={handleSaveAll}
          >
            {t('保存设置')}
          </Button>
        </Space>
        <Table
          rowKey='id'
          columns={columns}
          dataSource={links}
          pagination={false}
          empty={t('暂无导航')}
        />
      </Form.Section>

      <Modal
        title={editingLink ? t('编辑导航') : t('添加导航')}
        visible={modalVisible}
        onCancel={() => setModalVisible(false)}
        onOk={handleModalSave}
        okText={editingLink ? t('更新') : t('添加')}
        cancelText={t('取消')}
      >
        <Form labelPosition='top'>
          <Form.Input
            field='name'
            label={t('名称')}
            value={formValues.name}
            onChange={(value) =>
              setFormValues((prev) => ({ ...prev, name: value }))
            }
            placeholder={t('服务状态')}
          />
          <Form.Input
            field='url'
            label={t('网址')}
            value={formValues.url}
            onChange={(value) =>
              setFormValues((prev) => ({ ...prev, url: value }))
            }
            placeholder='https://status.example.com'
          />
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: 8,
            }}
          >
            <Text>{t('新标签页打开')}</Text>
            <Switch
              checked={formValues.openInNewTab}
              onChange={(checked) =>
                setFormValues((prev) => ({
                  ...prev,
                  openInNewTab: checked,
                }))
              }
            />
          </div>
        </Form>
      </Modal>
    </Card>
  );
}
