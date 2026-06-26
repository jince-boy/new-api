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

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { API, isAdmin, showError } from '../../helpers';
import { buildQuickRangePayload } from '../../helpers/dashboard';
import {
  TIME_OPTIONS,
  QUICK_RANGE_PRESETS,
  DEFAULT_QUICK_RANGE_PRESET,
} from '../../constants/dashboard.constants';
import { useIsMobile } from '../common/useIsMobile';
import { useMinimumLoadingTime } from '../common/useMinimumLoadingTime';

export const useDashboardData = (userState, userDispatch, statusState) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const initialized = useRef(false);
  const initialQuickRangeRef = useRef(
    buildQuickRangePayload(DEFAULT_QUICK_RANGE_PRESET),
  );

  const [loading, setLoading] = useState(false);
  const [greetingVisible, setGreetingVisible] = useState(false);
  const [searchModalVisible, setSearchModalVisible] = useState(false);
  const showLoading = useMinimumLoadingTime(loading);

  const [inputs, setInputs] = useState({
    username: '',
    token_name: '',
    model_name: '',
    start_timestamp: initialQuickRangeRef.current.start_timestamp,
    end_timestamp: initialQuickRangeRef.current.end_timestamp,
    channel: '',
    data_export_default_time: '',
  });

  const [dataExportDefaultTime, setDataExportDefaultTime] =
    useState(initialQuickRangeRef.current.dataExportDefaultTime);
  const [activeQuickRangePreset, setActiveQuickRangePreset] = useState(
    initialQuickRangeRef.current.presetKey,
  );

  const [quotaData, setQuotaData] = useState([]);
  const [consumeQuota, setConsumeQuota] = useState(0);
  const [consumeTokens, setConsumeTokens] = useState(0);
  const [times, setTimes] = useState(0);
  const [pieData, setPieData] = useState([{ type: 'null', value: '0' }]);
  const [lineData, setLineData] = useState([]);
  const [modelColors, setModelColors] = useState({});

  const [activeChartTab, setActiveChartTab] = useState('1');

  const [trendData, setTrendData] = useState({
    balance: [],
    usedQuota: [],
    requestCount: [],
    times: [],
    consumeQuota: [],
    tokens: [],
    rpm: [],
    tpm: [],
  });

  const [uptimeData, setUptimeData] = useState([]);
  const [uptimeLoading, setUptimeLoading] = useState(false);
  const [activeUptimeTab, setActiveUptimeTab] = useState('');

  const isAdminUser = isAdmin();

  const apiInfoEnabled = statusState?.status?.api_info_enabled ?? true;
  const announcementsEnabled =
    statusState?.status?.announcements_enabled ?? true;
  const faqEnabled = statusState?.status?.faq_enabled ?? true;
  const uptimeEnabled = statusState?.status?.uptime_kuma_enabled ?? true;

  const hasApiInfoPanel = apiInfoEnabled;
  const hasInfoPanels = announcementsEnabled || faqEnabled || uptimeEnabled;

  const timeOptions = useMemo(
    () =>
      TIME_OPTIONS.map((option) => ({
        ...option,
        label: t(option.label),
      })),
    [t],
  );

  const quickRangePresets = useMemo(
    () =>
      QUICK_RANGE_PRESETS.map((preset) => ({
        ...preset,
        label: t(preset.labelKey),
      })),
    [t],
  );

  const performanceMetrics = useMemo(() => {
    const { start_timestamp, end_timestamp } = inputs;
    const timeDiff =
      (Date.parse(end_timestamp) - Date.parse(start_timestamp)) / 60000;
    const avgRPM = isNaN(times / timeDiff)
      ? '0'
      : (times / timeDiff).toFixed(3);
    const avgTPM = isNaN(consumeTokens / timeDiff)
      ? '0'
      : (consumeTokens / timeDiff).toFixed(3);

    return { avgRPM, avgTPM, timeDiff };
  }, [times, consumeTokens, inputs]);

  const getGreeting = useMemo(() => {
    const hours = new Date().getHours();
    let greeting = '';

    if (hours >= 5 && hours < 12) {
      greeting = t('\u65e9\u4e0a\u597d');
    } else if (hours >= 12 && hours < 14) {
      greeting = t('\u4e2d\u5348\u597d');
    } else if (hours >= 14 && hours < 18) {
      greeting = t('\u4e0b\u5348\u597d');
    } else {
      greeting = t('\u665a\u4e0a\u597d');
    }

    const username = userState?.user?.username || '';
    return `\uD83D\uDC4B${greeting}\uff0c${username}`;
  }, [t, userState?.user?.username]);

  const handleInputChange = useCallback((value, name) => {
    if (name === 'data_export_default_time') {
      setDataExportDefaultTime(value);
      localStorage.setItem('data_export_default_time', value);
      return;
    }
    setInputs((inputs) => ({ ...inputs, [name]: value }));
  }, []);

  const showSearchModal = useCallback(() => {
    setSearchModalVisible(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setSearchModalVisible(false);
  }, []);

  const loadQuotaData = useCallback(async (override = {}) => {
    setLoading(true);
    try {
      let url = '';
      const effectiveInputs = { ...inputs, ...(override.inputs || {}) };
      const effectiveDataExportDefaultTime =
        override.dataExportDefaultTime || dataExportDefaultTime;
      const { start_timestamp, end_timestamp, username } = effectiveInputs;
      const localStartTimestamp = Date.parse(start_timestamp) / 1000;
      const localEndTimestamp = Date.parse(end_timestamp) / 1000;

      if (isAdminUser) {
        url = `/api/data/?username=${username}&start_timestamp=${localStartTimestamp}&end_timestamp=${localEndTimestamp}&default_time=${effectiveDataExportDefaultTime}`;
      } else {
        url = `/api/data/self/?start_timestamp=${localStartTimestamp}&end_timestamp=${localEndTimestamp}&default_time=${effectiveDataExportDefaultTime}`;
      }

      const res = await API.get(url);
      const { success, message, data } = res.data;
      if (success) {
        const nextData = Array.isArray(data)
          ? data.map((item) => ({
              ...item,
              count: Number(item?.count) || 0,
              quota: Number(item?.quota) || 0,
              token_used: Number(item?.token_used) || 0,
              created_at: Number(item?.created_at) || Date.now() / 1000,
              model_name: item?.model_name || '\u65e0\u6570\u636e',
            }))
          : [];
        if (nextData.length === 0) {
          nextData.push({
            count: 0,
            model_name: '\u65e0\u6570\u636e',
            quota: 0,
            created_at: Date.now() / 1000,
          });
        }
        nextData.sort((a, b) => a.created_at - b.created_at);
        setQuotaData(nextData);
        return nextData;
      }

      showError(message);
      return [];
    } finally {
      setLoading(false);
    }
  }, [inputs, dataExportDefaultTime, isAdminUser]);

  const loadUptimeData = useCallback(async () => {
    setUptimeLoading(true);
    try {
      const res = await API.get('/api/uptime/status');
      const { success, message, data } = res.data;
      if (success) {
        const nextData = Array.isArray(data) ? data : [];
        setUptimeData(nextData);
        if (nextData.length > 0 && !activeUptimeTab) {
          setActiveUptimeTab(nextData[0]?.categoryName || '');
        }
      } else {
        showError(message);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setUptimeLoading(false);
    }
  }, [activeUptimeTab]);

  const loadUserQuotaData = useCallback(async (override = {}) => {
    if (!isAdminUser) return [];
    try {
      const effectiveInputs = { ...inputs, ...(override.inputs || {}) };
      const { start_timestamp, end_timestamp } = effectiveInputs;
      const localStartTimestamp = Date.parse(start_timestamp) / 1000;
      const localEndTimestamp = Date.parse(end_timestamp) / 1000;
      const url = `/api/data/users?start_timestamp=${localStartTimestamp}&end_timestamp=${localEndTimestamp}`;
      const res = await API.get(url);
      const { success, message, data } = res.data;
      if (success) {
        return Array.isArray(data) ? data : [];
      }

      showError(message);
      return [];
    } catch (err) {
      console.error(err);
      return [];
    }
  }, [inputs, isAdminUser]);

  const loadTokenRanking = useCallback(async (override = {}) => {
    try {
      const effectiveInputs = { ...inputs, ...(override.inputs || {}) };
      const { start_timestamp, end_timestamp, username } = effectiveInputs;
      const localStartTimestamp = Date.parse(start_timestamp) / 1000;
      const localEndTimestamp = Date.parse(end_timestamp) / 1000;
      const params = new URLSearchParams({
        start_timestamp: String(localStartTimestamp),
        end_timestamp: String(localEndTimestamp),
      });
      if (isAdminUser && username) {
        params.set('username', username);
      }
      const res = await API.get(`/api/data/token-ranking?${params.toString()}`);
      const { success, message, data } = res.data;
      if (success) {
        return data || null;
      }

      showError(message);
      return null;
    } catch (err) {
      console.error(err);
      return null;
    }
  }, [inputs, isAdminUser]);

  const getUserData = useCallback(async () => {
    const res = await API.get('/api/user/self');
    const { success, message, data } = res.data;
    if (success) {
      userDispatch({ type: 'login', payload: data });
    } else {
      showError(message);
    }
  }, [userDispatch]);

  const refresh = useCallback(async () => {
    const data = await loadQuotaData();
    await loadUptimeData();
    return data;
  }, [loadQuotaData, loadUptimeData]);

  const handleSearchConfirm = useCallback(
    async (updateChartDataCallback) => {
      setActiveQuickRangePreset(null);
      const data = await refresh();
      if (data && data.length > 0 && updateChartDataCallback) {
        updateChartDataCallback(data);
      }
      setSearchModalVisible(false);
    },
    [refresh],
  );

  const applyQuickRangePreset = useCallback(
    async (presetKey, updateChartDataCallback) => {
      const quickRangePayload = buildQuickRangePayload(presetKey);
      const nextInputs = {
        ...inputs,
        start_timestamp: quickRangePayload.start_timestamp,
        end_timestamp: quickRangePayload.end_timestamp,
      };

      setInputs(nextInputs);
      setDataExportDefaultTime(quickRangePayload.dataExportDefaultTime);
      setActiveQuickRangePreset(quickRangePayload.presetKey);
      localStorage.setItem(
        'data_export_default_time',
        quickRangePayload.dataExportDefaultTime,
      );

      const data = await loadQuotaData({
        inputs: {
          start_timestamp: quickRangePayload.start_timestamp,
          end_timestamp: quickRangePayload.end_timestamp,
        },
        dataExportDefaultTime: quickRangePayload.dataExportDefaultTime,
      });

      if (data && data.length > 0 && updateChartDataCallback) {
        updateChartDataCallback(data);
      }

      return { data, inputs: nextInputs };
    },
    [inputs, loadQuotaData],
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      setGreetingVisible(true);
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!initialized.current) {
      getUserData();
      initialized.current = true;
    }
  }, [getUserData]);

  return {
    loading: showLoading,
    greetingVisible,
    searchModalVisible,

    inputs,
    dataExportDefaultTime,
    quickRangePresets,
    activeQuickRangePreset,

    quotaData,
    consumeQuota,
    setConsumeQuota,
    consumeTokens,
    setConsumeTokens,
    times,
    setTimes,
    pieData,
    setPieData,
    lineData,
    setLineData,
    modelColors,
    setModelColors,

    activeChartTab,
    setActiveChartTab,

    trendData,
    setTrendData,

    uptimeData,
    uptimeLoading,
    activeUptimeTab,
    setActiveUptimeTab,

    timeOptions,
    performanceMetrics,
    getGreeting,
    isAdminUser,
    hasApiInfoPanel,
    hasInfoPanels,
    apiInfoEnabled,
    announcementsEnabled,
    faqEnabled,
    uptimeEnabled,

    handleInputChange,
    showSearchModal,
    handleCloseModal,
    loadQuotaData,
    loadUserQuotaData,
    loadTokenRanking,
    loadUptimeData,
    getUserData,
    refresh,
    handleSearchConfirm,
    applyQuickRangePreset,

    navigate,
    t,
    isMobile,
  };
};
