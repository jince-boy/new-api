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
import { Card, Tabs, TabPane } from '@douyinfe/semi-ui';
import { PieChart } from 'lucide-react';
import { VChart } from '@visactor/react-vchart';

const getRankRows = (spec) =>
  (spec?.data?.[0]?.values || []).filter((item) => !item?.__rankPlaceholder);

const getRankValue = (row) => Number(row?.rawTokens ?? row?.rawQuota ?? 0) || 0;

const getRankLabel = (spec, row) => {
  const value = getRankValue(row);
  return spec?.label?.formatMethod ? spec.label.formatMethod(value, row) : String(value);
};

const getRankColor = (spec, row, index) => {
  const name = row?.User;
  return (
    spec?.color?.specified?.[name] ||
    (Array.isArray(spec?.color?.range) ? spec.color.range[index % spec.color.range.length] : null) ||
    'var(--semi-color-primary)'
  );
};

const RankBarList = ({ spec }) => {
  const rows = getRankRows(spec);
  const maxValue = Math.max(...rows.map(getRankValue), 1);

  return (
    <div className='dashboard-rank-scroll'>
      <div className='dashboard-rank-list'>
        {rows.map((row, index) => {
          const name = row?.User || '-';
          const value = getRankValue(row);
          const width = `${Math.max((value / maxValue) * 100, 2)}%`;
          const color = getRankColor(spec, row, index);

          return (
            <div
              key={`${index}-${name}`}
              className='dashboard-rank-row'
            >
              <div className='dashboard-rank-user'>
                <span className='dashboard-rank-index'>
                  {index + 1}
                </span>
                <span className='dashboard-rank-name' title={name}>
                  {name}
                </span>
              </div>
              <div className='dashboard-rank-track'>
                <div className='dashboard-rank-bar' style={{ width, backgroundColor: color }} />
              </div>
              <div className='dashboard-rank-value'>
                {getRankLabel(spec, row)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const ChartsPanel = ({
  activeChartTab,
  setActiveChartTab,
  spec_line,
  spec_model_line,
  spec_pie,
  spec_rank_bar,
  spec_token_rank,
  spec_user_rank,
  spec_user_trend,
  isAdminUser,
  CARD_PROPS,
  CHART_CONFIG,
  FLEX_CENTER_GAP2,
  hasApiInfoPanel,
  t,
}) => {
  const isCompactRankTab = activeChartTab === '5' || (activeChartTab === '6' && isAdminUser);

  return (
    <Card
      {...CARD_PROPS}
      className={`!rounded-2xl ${hasApiInfoPanel ? 'lg:col-span-3' : ''}`}
      title={
        <div className='flex flex-col lg:flex-row lg:items-center lg:justify-between w-full gap-3'>
          <div className={FLEX_CENTER_GAP2}>
            <PieChart size={16} />
            {t('模型数据分析')}
          </div>
          <Tabs
            type='slash'
            activeKey={activeChartTab}
            onChange={setActiveChartTab}
          >
            <TabPane tab={<span>{t('消耗分布')}</span>} itemKey='1' />
            <TabPane tab={<span>{t('调用趋势')}</span>} itemKey='2' />
            <TabPane tab={<span>{t('调用次数分布')}</span>} itemKey='3' />
            <TabPane tab={<span>{t('调用次数排行')}</span>} itemKey='4' />
            <TabPane tab={<span>{t('Token消耗排行')}</span>} itemKey='5' />
            {isAdminUser && (
              <TabPane tab={<span>{t('用户消耗排行')}</span>} itemKey='6' />
            )}
            {isAdminUser && (
              <TabPane tab={<span>{t('用户消耗趋势')}</span>} itemKey='7' />
            )}
          </Tabs>
        </div>
      }
      bodyStyle={{ padding: 0 }}
    >
      <div className={`${isCompactRankTab ? 'h-64' : 'h-96'} p-2`}>
        {activeChartTab === '1' && (
          <VChart spec={spec_line} option={CHART_CONFIG} />
        )}
        {activeChartTab === '2' && (
          <VChart spec={spec_model_line} option={CHART_CONFIG} />
        )}
        {activeChartTab === '3' && (
          <VChart spec={spec_pie} option={CHART_CONFIG} />
        )}
        {activeChartTab === '4' && (
          <VChart spec={spec_rank_bar} option={CHART_CONFIG} />
        )}
        {activeChartTab === '5' && (
          <RankBarList spec={spec_token_rank} />
        )}
        {activeChartTab === '6' && isAdminUser && (
          <RankBarList spec={spec_user_rank} />
        )}
        {activeChartTab === '7' && isAdminUser && (
          <VChart spec={spec_user_trend} option={CHART_CONFIG} />
        )}
      </div>
    </Card>
  );
};

export default ChartsPanel;
