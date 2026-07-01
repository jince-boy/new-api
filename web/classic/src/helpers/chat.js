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

export const DISABLED_CHAT_PRESET_PREFIX = '__newapi_disabled_chat__:';

function parseChatPresetValue(value) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    const enabled = !trimmed.startsWith(DISABLED_CHAT_PRESET_PREFIX);
    const url = enabled
      ? trimmed
      : trimmed.slice(DISABLED_CHAT_PRESET_PREFIX.length).trim();
    return url ? { url, enabled } : null;
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  if (typeof value.url !== 'string' || !value.url.trim()) return null;
  if ('enabled' in value && typeof value.enabled !== 'boolean') return null;

  return {
    url: value.url.trim(),
    enabled: value.enabled !== false,
  };
}

function serializeChatPresetValue(url, enabled) {
  const trimmedUrl = String(url || '').trim();
  return enabled
    ? trimmedUrl
    : `${DISABLED_CHAT_PRESET_PREFIX}${trimmedUrl}`;
}

export function parseChatPresets(raw, options = {}) {
  const { includeDisabled = false } = options;
  let parsed = raw;

  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
  }

  if (!Array.isArray(parsed)) return [];

  return parsed
    .map((item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return null;
      }

      const entries = Object.entries(item);
      if (entries.length !== 1) return null;

      const [name, value] = entries[0];
      const parsedValue = parseChatPresetValue(value);
      if (!parsedValue) return null;

      return {
        id: index,
        name,
        url: parsedValue.url,
        enabled: parsedValue.enabled,
      };
    })
    .filter((item) => item && (includeDisabled || item.enabled));
}

export function serializeChatPresets(configs) {
  return JSON.stringify(
    configs.map((config) => ({
      [config.name]: serializeChatPresetValue(
        config.url,
        config.enabled !== false,
      ),
    })),
    null,
    2,
  );
}

function replaceToken(source, token, value) {
  return source.split(token).join(value);
}

function replaceTemplateVariable(source, name, value) {
  return replaceToken(
    replaceToken(source, `{{${name}}}`, value),
    `{${name}}`,
    value,
  );
}

function getCurrentTheme(theme) {
  if (theme === 'dark' || theme === 'light') return theme;

  if (typeof document !== 'undefined') {
    if (document.documentElement.classList.contains('dark')) return 'dark';
    if (document.body?.getAttribute('theme-mode') === 'dark') return 'dark';
  }

  if (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-color-scheme: dark)').matches
  ) {
    return 'dark';
  }

  return 'light';
}

export function resolveChatUrl({
  template,
  apiKey,
  apiKeys,
  purposeDefinitions = [],
  serverAddress,
  encodeToBase64,
  theme,
}) {
  let url = template || '';
  const safeServerAddress = serverAddress || '';
  const safeApiKey = apiKey
    ? apiKey.startsWith('sk-')
      ? apiKey
      : `sk-${apiKey}`
    : '';
  const normalizeApiKey = (key) =>
    key ? (key.startsWith('sk-') ? key : `sk-${key}`) : '';
  const currentTheme = getCurrentTheme(theme);
  const safeApiKeys = {};
  for (const definition of purposeDefinitions) {
    if (!definition?.purpose) continue;
    safeApiKeys[definition.purpose] = normalizeApiKey(
      apiKeys?.[definition.purpose] || '',
    );
  }
  safeApiKeys.chat = normalizeApiKey(apiKeys?.chat || safeApiKey);
  const safeChatApiKey = safeApiKeys.chat;

  const encodeConfig = (payload) => {
    const json = JSON.stringify(payload);
    const encoded =
      typeof encodeToBase64 === 'function'
        ? encodeToBase64(json)
        : window.btoa(json);
    return encodeURIComponent(encoded);
  };

  if (url.includes('{cherryConfig}')) {
    url = replaceTemplateVariable(
      url,
      'cherryConfig',
      encodeConfig({
        id: 'new-api',
        baseUrl: safeServerAddress,
        apiKey: safeChatApiKey,
      }),
    );
  }

  if (url.includes('{aionuiConfig}')) {
    url = replaceTemplateVariable(
      url,
      'aionuiConfig',
      encodeConfig({
        platform: 'new-api',
        baseUrl: safeServerAddress,
        apiKey: safeChatApiKey,
      }),
    );
  }

  if (url.includes('{deepchatConfig}')) {
    url = replaceTemplateVariable(
      url,
      'deepchatConfig',
      encodeConfig({
        id: 'new-api',
        baseUrl: safeServerAddress,
        apiKey: safeChatApiKey,
      }),
    );
  }

  if (safeServerAddress) {
    url = replaceTemplateVariable(
      url,
      'address',
      encodeURIComponent(safeServerAddress),
    );
  }

  if (safeChatApiKey) {
    url = replaceTemplateVariable(url, 'key', safeChatApiKey);
  }

  for (const definition of purposeDefinitions) {
    const token = definition?.token;
    const purpose = definition?.purpose;
    if (!token || !purpose) continue;
    const key = safeApiKeys[purpose];
    if (key) {
      url = replaceTemplateVariable(url, token, key);
    }
  }

  return replaceTemplateVariable(url, 'theme', currentTheme);
}

export function chatLinkRequiredApiKeyPurposes(url, purposeDefinitions = []) {
  const purposes = new Set();
  if (
    url.includes('{key}') ||
    url.includes('{{key}}') ||
    url.includes('{cherryConfig}') ||
    url.includes('{{cherryConfig}}') ||
    url.includes('{aionuiConfig}') ||
    url.includes('{{aionuiConfig}}') ||
    url.includes('{deepchatConfig}') ||
    url.includes('{{deepchatConfig}}')
  ) {
    purposes.add('chat');
  }
  for (const definition of purposeDefinitions) {
    const token = definition?.token;
    if (!token) continue;
    if (url.includes(`{${token}}`) || url.includes(`{{${token}}}`)) {
      purposes.add(definition.purpose);
    }
  }
  return Array.from(purposes);
}
