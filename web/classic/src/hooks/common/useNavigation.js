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

import { useMemo } from 'react';

const parseCustomNavLinks = (raw) => {
  try {
    const parsed = JSON.parse(raw || '[]');
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map((item, index) => {
        const text = typeof item?.name === 'string' ? item.name.trim() : '';
        const externalLink =
          typeof item?.url === 'string' ? item.url.trim() : '';
        if (
          !text ||
          (!externalLink.startsWith('http://') &&
            !externalLink.startsWith('https://'))
        ) {
          return null;
        }
        return {
          text,
          itemKey: `custom-${index}`,
          isExternal: true,
          externalLink,
          openInNewTab: Boolean(item?.openInNewTab),
        };
      })
      .filter(Boolean);
  } catch (error) {
    return [];
  }
};

const getCachedCustomNavLinks = () => {
  try {
    const customNavLinks = localStorage.getItem('custom_nav_links');
    if (customNavLinks) {
      return customNavLinks;
    }
    const raw = localStorage.getItem('status');
    if (!raw) {
      return undefined;
    }
    return JSON.parse(raw)?.CustomNavLinks;
  } catch (error) {
    return undefined;
  }
};

export const useNavigation = (
  t,
  docsLink,
  headerNavModules,
  customNavLinksConfig,
) => {
  const mainNavLinks = useMemo(() => {
    // 默认配置，如果没有传入配置则显示所有模块
    const defaultModules = {
      home: true,
      console: true,
      pricing: true,
      docs: true,
      about: true,
    };

    // 使用传入的配置或默认配置
    const modules = headerNavModules || defaultModules;

    const allLinks = [
      {
        text: t('首页'),
        itemKey: 'home',
        to: '/',
      },
      {
        text: t('控制台'),
        itemKey: 'console',
        to: '/console',
      },
      {
        text: t('模型广场'),
        itemKey: 'pricing',
        to: '/pricing',
      },
      ...(docsLink
        ? [
            {
              text: t('文档'),
              itemKey: 'docs',
              isExternal: true,
              externalLink: docsLink,
            },
          ]
        : []),
      {
        text: t('关于'),
        itemKey: 'about',
        to: '/about',
      },
    ];

    // 根据配置过滤导航链接
    const builtinLinks = allLinks.filter((link) => {
      if (link.itemKey === 'docs') {
        return docsLink && modules.docs;
      }
      if (link.itemKey === 'pricing') {
        // 支持新的pricing配置格式
        return typeof modules.pricing === 'object'
          ? modules.pricing.enabled
          : modules.pricing;
      }
      return modules[link.itemKey] === true;
    });

    return [
      ...builtinLinks,
      ...parseCustomNavLinks(
        customNavLinksConfig ?? getCachedCustomNavLinks(),
      ),
    ];
  }, [t, docsLink, headerNavModules, customNavLinksConfig]);

  return {
    mainNavLinks,
  };
};
