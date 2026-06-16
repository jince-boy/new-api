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

import React, { useEffect, useState, useRef } from 'react';
import { Banner, Button, Col, Form, Row, Spin } from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';
import {
  compareObjects,
  API,
  showError,
  showSuccess,
  showWarning,
} from '../../../helpers';

export default function SettingsCreditLimit(props) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [inputs, setInputs] = useState({
    QuotaForNewUser: '',
    PreConsumedQuota: '',
    QuotaForInviter: '',
    QuotaForInvitee: '',
    InviterRewardType: '',
    InviterRewardValue: '',
    MinAffTransferQuota: '',
    'quota_setting.enable_free_model_pre_consume': true,
  });
  const refForm = useRef();
  const [inputsRow, setInputsRow] = useState(inputs);
  const complianceConfirmed =
    props.options?.['payment_setting.compliance_confirmed'] === true ||
    props.options?.['payment_setting.compliance_confirmed'] === 'true';

  async function onSubmit() {
    const updateArray = compareObjects(inputs, inputsRow);
    if (!updateArray.length) return showWarning(t('你似乎并没有修改什么'));
    const priority =
      inputs.InviterRewardType === 'percentage'
        ? ['InviterRewardValue', 'InviterRewardType']
        : ['InviterRewardType', 'InviterRewardValue'];
    const orderedUpdateArray = [...updateArray].sort((left, right) => {
      const leftIndex = priority.indexOf(left.key);
      const rightIndex = priority.indexOf(right.key);
      if (leftIndex === -1 && rightIndex === -1) return 0;
      if (leftIndex === -1) return 1;
      if (rightIndex === -1) return -1;
      return leftIndex - rightIndex;
    });
    const buildRequestPayload = (item) => {
      let value = '';
      if (typeof inputs[item.key] === 'boolean') {
        value = String(inputs[item.key]);
      } else if (item.key === 'InviterRewardType' && inputs[item.key] === 'disabled') {
        value = '';
      } else {
        value = inputs[item.key];
      }
      return {
        key: item.key,
        value,
      };
    };
    setLoading(true);
    try {
      for (const item of orderedUpdateArray) {
        const payload = buildRequestPayload(item);
        const res = await API.put('/api/option/', payload);
        if (!res?.data?.success) {
          showError(res?.data?.message || t('保存失败，请重试'));
          return;
        }
      }
      showSuccess(t('保存成功'));
      props.refresh();
    } catch {
      showError(t('保存失败，请重试'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const currentInputs = {};
    for (let key in props.options) {
      if (Object.keys(inputs).includes(key)) {
        currentInputs[key] = props.options[key];
      }
    }
    if (!currentInputs.InviterRewardType) {
      currentInputs.InviterRewardType = 'disabled';
    }
    setInputs(currentInputs);
    setInputsRow(structuredClone(currentInputs));
    refForm.current.setValues(currentInputs);
  }, [props.options]);
  return (
    <>
      <Spin spinning={loading}>
        {!complianceConfirmed && (
          <Banner
            type='warning'
            description={t(
              '设置非零邀请奖励额度前，需要先在支付设置中确认合规声明。',
            )}
            closeIcon={null}
            className='!rounded-lg mb-3'
          />
        )}
        <Form
          values={inputs}
          getFormApi={(formAPI) => (refForm.current = formAPI)}
          style={{ marginBottom: 15 }}
        >
          <Form.Section text={t('额度设置')}>
            <Row gutter={16}>
              <Col xs={24} sm={12} md={8} lg={8} xl={8}>
                <Form.InputNumber
                  label={t('新用户初始额度')}
                  field={'QuotaForNewUser'}
                  step={1}
                  min={0}
                  suffix={'Token'}
                  placeholder={''}
                  onChange={(value) =>
                    setInputs({
                      ...inputs,
                      QuotaForNewUser: String(value),
                    })
                  }
                />
              </Col>
              <Col xs={24} sm={12} md={8} lg={8} xl={8}>
                <Form.InputNumber
                  label={t('请求预扣费额度')}
                  field={'PreConsumedQuota'}
                  step={1}
                  min={0}
                  suffix={'Token'}
                  extraText={t('请求结束后多退少补')}
                  placeholder={''}
                  onChange={(value) =>
                    setInputs({
                      ...inputs,
                      PreConsumedQuota: String(value),
                    })
                  }
                />
              </Col>
              <Col xs={24} sm={12} md={8} lg={8} xl={8}>
                <Form.InputNumber
                  label={t('邀请新用户奖励额度')}
                  field={'QuotaForInviter'}
                  step={1}
                  min={0}
                  suffix={'Token'}
                  extraText={
                    !complianceConfirmed ? t('非零值需先确认合规声明') : ''
                  }
                  placeholder={t('例如：2000')}
                  onChange={(value) =>
                    setInputs({
                      ...inputs,
                      QuotaForInviter: String(value),
                    })
                  }
                />
              </Col>
            </Row>
            <Row>
              <Col xs={24} sm={12} md={8} lg={8} xl={6}>
                <Form.InputNumber
                  label={t('新用户使用邀请码奖励额度')}
                  field={'QuotaForInvitee'}
                  step={1}
                  min={0}
                  suffix={'Token'}
                  extraText={
                    !complianceConfirmed ? t('非零值需先确认合规声明') : ''
                  }
                  placeholder={t('例如：1000')}
                  onChange={(value) =>
                    setInputs({
                      ...inputs,
                      QuotaForInvitee: String(value),
                    })
                  }
                />
              </Col>
            </Row>
            <div className='mt-2 mb-3'>
              <div className='text-base font-medium mb-3'>
                {t('邀请充值返利')}
              </div>
              <Banner
                type='info'
                description={t(
                  '被邀请用户每次充值成功后，邀请人可获得固定额度或按充值额度百分比计算的返利。',
                )}
                closeIcon={null}
                className='!rounded-lg mb-3'
              />
              <Row gutter={16}>
                <Col xs={24} sm={12} md={8} lg={8} xl={8}>
                  <Form.Select
                    label={t('充值返利类型')}
                    field={'InviterRewardType'}
                    optionList={[
                      { label: t('关闭'), value: 'disabled' },
                      { label: t('固定额度'), value: 'fixed' },
                      { label: t('充值百分比'), value: 'percentage' },
                    ]}
                    onChange={(value) =>
                      setInputs({
                        ...inputs,
                        InviterRewardType: value,
                        InviterRewardValue:
                          value !== 'disabled' &&
                          inputs.InviterRewardType !== 'disabled' &&
                          (inputs.InviterRewardType === 'fixed') !==
                            (value === 'fixed')
                            ? '0'
                            : inputs.InviterRewardValue,
                      })
                    }
                  />
                </Col>
                <Col xs={24} sm={12} md={8} lg={8} xl={8}>
                  <Form.InputNumber
                    label={t('充值返利值')}
                    field={'InviterRewardValue'}
                    step={1}
                    min={0}
                    max={
                      inputs.InviterRewardType === 'percentage'
                        ? 100
                        : undefined
                    }
                    suffix={
                      inputs.InviterRewardType === 'percentage' ? '%' : 'Token'
                    }
                    extraText={
                      inputs.InviterRewardType === 'percentage'
                        ? t('按被邀请用户充值额度的百分比计算')
                        : t('每次充值成功后奖励的固定 Token 额度')
                    }
                    onChange={(value) =>
                      setInputs({
                        ...inputs,
                        InviterRewardValue: String(value),
                      })
                    }
                  />
                </Col>
                <Col xs={24} sm={12} md={8} lg={8} xl={8}>
                  <Form.InputNumber
                    label={t('最低划转门槛')}
                    field={'MinAffTransferQuota'}
                    step={1}
                    min={0}
                    suffix={'Token'}
                    extraText={t('为 0 时使用默认最低划转额度')}
                    onChange={(value) =>
                      setInputs({
                        ...inputs,
                        MinAffTransferQuota: String(value),
                      })
                    }
                  />
                </Col>
              </Row>
            </div>
            <Row>
              <Col>
                <Form.Switch
                  label={t('对免费模型启用预消耗')}
                  field={'quota_setting.enable_free_model_pre_consume'}
                  extraText={t(
                    '开启后，对免费模型（倍率为0，或者价格为0）的模型也会预消耗额度',
                  )}
                  onChange={(value) =>
                    setInputs({
                      ...inputs,
                      'quota_setting.enable_free_model_pre_consume': value,
                    })
                  }
                />
              </Col>
            </Row>

            <Row>
              <Button size='default' onClick={onSubmit}>
                {t('保存额度设置')}
              </Button>
            </Row>
          </Form.Section>
        </Form>
      </Spin>
    </>
  );
}
