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

// ========== UI config ==========
export const CHART_CONFIG = { mode: 'desktop-browser' };

export const CARD_PROPS = {
  shadows: '',
  bordered: true,
  headerLine: true,
};

export const FORM_FIELD_PROPS = {
  className: 'w-full mb-2 !rounded-lg',
  size: 'large',
};

export const ICON_BUTTON_CLASS = 'text-white hover:bg-opacity-80 !rounded-full';
export const FLEX_CENTER_GAP2 = 'flex items-center gap-2';

export const ILLUSTRATION_SIZE = { width: 96, height: 96 };

// ========== Time config ==========
export const TIME_OPTIONS = [
  { label: '\u5c0f\u65f6', value: 'hour' },
  { label: '\u5929', value: 'day' },
  { label: '\u5468', value: 'week' },
];

export const DEFAULT_TIME_INTERVALS = {
  hour: { seconds: 3600, minutes: 60 },
  day: { seconds: 86400, minutes: 1440 },
  week: { seconds: 604800, minutes: 10080 },
};

// ========== Default time settings ==========
export const DEFAULT_TIME_RANGE = {
  HOUR: 'hour',
  DAY: 'day',
  WEEK: 'week',
};

export const QUICK_RANGE_PRESETS = [
  {
    key: 'today',
    labelKey: '\u5f53\u5929',
    granularity: 'hour',
    mode: 'today',
    amount: 1,
  },
  {
    key: 'last_24_hours',
    labelKey: '24\u5c0f\u65f6',
    granularity: 'hour',
    mode: 'rolling',
    unit: 'hour',
    amount: 24,
  },
  {
    key: 'last_7_days',
    labelKey: '7\u5929',
    granularity: 'day',
    mode: 'rolling',
    unit: 'day',
    amount: 7,
  },
  {
    key: 'last_14_days',
    labelKey: '14\u5929',
    granularity: 'day',
    mode: 'rolling',
    unit: 'day',
    amount: 14,
  },
  {
    key: 'last_30_days',
    labelKey: '30\u5929',
    granularity: 'day',
    mode: 'rolling',
    unit: 'day',
    amount: 30,
  },
];

export const DEFAULT_QUICK_RANGE_PRESET = 'today';

// ========== Default chart config ==========
export const DEFAULT_CHART_SPECS = {
  PIE: {
    type: 'pie',
    outerRadius: 0.8,
    innerRadius: 0.5,
    padAngle: 0.6,
    valueField: 'value',
    categoryField: 'type',
    pie: {
      style: {
        cornerRadius: 10,
      },
      state: {
        hover: {
          outerRadius: 0.85,
          stroke: '#000',
          lineWidth: 1,
        },
        selected: {
          outerRadius: 0.85,
          stroke: '#000',
          lineWidth: 1,
        },
      },
    },
    legends: {
      visible: true,
      orient: 'left',
    },
    label: {
      visible: true,
    },
  },

  BAR: {
    type: 'bar',
    stack: true,
    legends: {
      visible: true,
      selectMode: 'single',
    },
    bar: {
      state: {
        hover: {
          stroke: '#000',
          lineWidth: 1,
        },
      },
    },
  },

  LINE: {
    type: 'line',
    legends: {
      visible: true,
      selectMode: 'single',
    },
  },
};

// ========== Announcement legend data ==========
export const ANNOUNCEMENT_LEGEND_DATA = [
  { color: 'grey', label: '\u9ed8\u8ba4', type: 'default' },
  { color: 'blue', label: '\u8fdb\u884c\u4e2d', type: 'ongoing' },
  { color: 'green', label: '\u6210\u529f', type: 'success' },
  { color: 'orange', label: '\u8b66\u544a', type: 'warning' },
  { color: 'red', label: '\u5f02\u5e38', type: 'error' },
];

// ========== Uptime status map ==========
export const UPTIME_STATUS_MAP = {
  1: { color: '#10b981', label: '\u6b63\u5e38', text: '\u53ef\u7528' }, // UP
  0: { color: '#ef4444', label: '\u5f02\u5e38', text: '\u6709\u5f02\u5e38' }, // DOWN
  2: { color: '#f59e0b', label: '\u9ad8\u5ef6\u8fdf', text: '\u9ad8\u5ef6\u8fdf' }, // PENDING
  3: { color: '#3b82f6', label: '\u7ef4\u62a4\u4e2d', text: '\u7ef4\u62a4\u4e2d' }, // MAINTENANCE
};

// ========== Storage keys ==========
export const STORAGE_KEYS = {
  DATA_EXPORT_DEFAULT_TIME: 'data_export_default_time',
  MJ_NOTIFY_ENABLED: 'mj_notify_enabled',
};

// ========== Defaults ==========
export const DEFAULTS = {
  PAGE_SIZE: 20,
  CHART_HEIGHT: 96,
  MODEL_TABLE_PAGE_SIZE: 10,
  MAX_TREND_POINTS: 7,
};
