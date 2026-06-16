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
import React, { useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Empty,
  Modal,
  Table,
  TabPane,
  Tabs,
  Toast,
  Typography,
} from '@douyinfe/semi-ui';
import {
  IllustrationNoResult,
  IllustrationNoResultDark,
} from '@douyinfe/semi-illustrations';
import { API, timestamp2string } from '../../../helpers';
import { useIsMobile } from '../../../hooks/common/useIsMobile';

const { Text } = Typography;

const renderTimestamp = (time) => (time ? timestamp2string(time) : '-');

const InvitationDetailsModal = ({ visible, onCancel, t, renderQuota }) => {
  const [loading, setLoading] = useState(false);
  const [details, setDetails] = useState({
    invited_users: [],
    invited_total: 0,
    rebate_details: [],
    rebate_total: 0,
  });
  const isMobile = useIsMobile();

  const loadDetails = async () => {
    setLoading(true);
    try {
      const res = await API.get('/api/user/aff?details=1');
      const { success, message, data } = res.data;
      if (success) {
        setDetails({
          invited_users: data?.invited_users || [],
          invited_total: data?.invited_total || 0,
          rebate_details: data?.rebate_details || [],
          rebate_total: data?.rebate_total || 0,
        });
      } else {
        Toast.error({ content: message || t('加载邀请明细失败') });
      }
    } catch (error) {
      Toast.error({ content: t('加载邀请明细失败') });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible) {
      loadDetails();
    }
  }, [visible]);

  const emptyNode = (description) => (
    <Empty
      image={<IllustrationNoResult style={{ width: 150, height: 150 }} />}
      darkModeImage={
        <IllustrationNoResultDark style={{ width: 150, height: 150 }} />
      }
      description={description}
      style={{ padding: 30 }}
    />
  );

  const userColumns = useMemo(
    () => [
      {
        title: t('用户ID'),
        dataIndex: 'id',
        key: 'id',
        render: (id) => <Text>{id}</Text>,
      },
      {
        title: t('用户名'),
        dataIndex: 'username',
        key: 'username',
        render: (username) => <Text>{username || '-'}</Text>,
      },
      {
        title: t('状态'),
        dataIndex: 'status',
        key: 'status',
        render: (status) => (
          <span className='flex items-center gap-2'>
            <Badge dot type={status === 1 ? 'success' : 'danger'} />
            <span>{status === 1 ? t('已启用') : t('已禁用')}</span>
          </span>
        ),
      },
      {
        title: t('创建时间'),
        dataIndex: 'created_at',
        key: 'created_at',
        render: (time) => renderTimestamp(time),
      },
    ],
    [t],
  );

  const rebateColumns = useMemo(
    () => [
      {
        title: t('被邀请用户'),
        key: 'invitee',
        render: (_, record) => (
          <Text>{record.invitee_name || record.invitee_username || '-'}</Text>
        ),
      },
      {
        title: t('充值额度'),
        dataIndex: 'recharge_quota',
        key: 'recharge_quota',
        render: (quota) => <Text>{renderQuota(quota || 0)}</Text>,
      },
      {
        title: t('返利额度'),
        dataIndex: 'reward_quota',
        key: 'reward_quota',
        render: (quota) => <Text type='success'>{renderQuota(quota || 0)}</Text>,
      },
      {
        title: t('支付方式'),
        key: 'payment_method',
        render: (_, record) => (
          <Text>{record.payment_method || record.payment_provider || '-'}</Text>
        ),
      },
      {
        title: t('完成时间'),
        dataIndex: 'complete_time',
        key: 'complete_time',
        render: (time, record) => renderTimestamp(time || record.create_time),
      },
    ],
    [renderQuota, t],
  );

  return (
    <Modal
      title={t('邀请明细')}
      visible={visible}
      onCancel={onCancel}
      footer={null}
      size={isMobile ? 'full-width' : 'large'}
      bodyStyle={{ paddingBottom: 28 }}
    >
      <Tabs type='button' className='pb-4'>
        <TabPane
          tab={`${t('邀请人员')} (${details.invited_total || 0})`}
          itemKey='users'
        >
          <Table
            columns={userColumns}
            dataSource={details.invited_users}
            loading={loading}
            rowKey='id'
            pagination={false}
            size='small'
            empty={emptyNode(t('暂无邀请人员'))}
          />
        </TabPane>
        <TabPane
          tab={`${t('返利明细')} (${details.rebate_total || 0})`}
          itemKey='rebates'
        >
          <Table
            columns={rebateColumns}
            dataSource={details.rebate_details}
            loading={loading}
            rowKey='id'
            pagination={false}
            size='small'
            empty={emptyNode(t('暂无返利记录'))}
          />
        </TabPane>
      </Tabs>
    </Modal>
  );
};

export default InvitationDetailsModal;
