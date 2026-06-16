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
import {
  Button,
  Modal,
  Typography,
  Input,
  InputNumber,
} from '@douyinfe/semi-ui';
import { CreditCard } from 'lucide-react';
import { getCurrencyConfig } from '../../../helpers';
import {
  displayAmountToQuota,
  quotaToDisplayAmount,
} from '../../../helpers/quota';

const TransferModal = ({
  t,
  openTransfer,
  transfer,
  handleTransferCancel,
  userState,
  renderQuota,
  getQuotaPerUnit,
  transferAmount,
  setTransferAmount,
  minTransferQuota = 0,
}) => {
  const effectiveMinTransferQuota =
    minTransferQuota > 0 ? minTransferQuota : getQuotaPerUnit();
  const availableQuota = userState?.user?.aff_quota || 0;
  const currencyConfig = getCurrencyConfig();
  const amountPrefix =
    currencyConfig.type === 'TOKENS' ? undefined : currencyConfig.symbol;
  const minTransferAmount = Number(
    quotaToDisplayAmount(effectiveMinTransferQuota).toFixed(6),
  );
  const availableAmount = Number(quotaToDisplayAmount(availableQuota).toFixed(6));
  const transferDisplayAmount =
    transferAmount === '' || transferAmount == null
      ? ''
      : Number(quotaToDisplayAmount(transferAmount).toFixed(6));

  return (
    <Modal
      title={
        <div className='flex items-center'>
          <CreditCard className='mr-2' size={18} />
          {t('划转邀请额度')}
        </div>
      }
      visible={openTransfer}
      onOk={transfer}
      onCancel={handleTransferCancel}
      maskClosable={false}
      centered
    >
      <div className='space-y-4'>
        <div>
          <Typography.Text strong className='block mb-2'>
            {t('可用邀请额度')}
          </Typography.Text>
          <Input
            value={renderQuota(userState?.user?.aff_quota)}
            disabled
            className='!rounded-lg'
          />
        </div>
        <div>
          <Typography.Text strong className='block mb-2'>
            {t('金额')} · {t('最低') + renderQuota(effectiveMinTransferQuota)}
          </Typography.Text>
          <InputNumber
            prefix={amountPrefix}
            min={minTransferAmount}
            max={availableAmount}
            value={transferDisplayAmount}
            precision={6}
            step={0.000001}
            onChange={(value) => {
              const amount = value === '' || value == null ? '' : value;
              setTransferAmount(
                amount === '' ? '' : displayAmountToQuota(amount),
              );
            }}
            className='w-full !rounded-lg'
          />
          <div className='flex items-center justify-between mt-2'>
            <Typography.Text type='tertiary' size='small'>
              {t('最低')}: {renderQuota(effectiveMinTransferQuota)}
            </Typography.Text>
            <Button
              size='small'
              type='tertiary'
              onClick={() => setTransferAmount(availableQuota)}
              disabled={availableQuota <= 0}
            >
              {t('全部划转')}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default TransferModal;
