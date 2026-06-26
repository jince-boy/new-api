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
import { VChart } from '@visactor/react-vchart';
import { registerBrowserEnv } from '@visactor/vchart';

try {
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    registerBrowserEnv();
  }
} catch (error) {
  console.error('[DashboardChart] failed to register browser env', error);
}

class SafeVChartBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidUpdate(prevProps) {
    if (this.state.hasError && prevProps.spec !== this.props.spec) {
      this.setState({ hasError: false });
    }
  }

  componentDidCatch(error, errorInfo) {
    console.error('[DashboardChart]', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return <div className='h-full w-full' />;
    }

    return this.props.children;
  }
}

const SafeVChart = ({ onError, ...props }) => {
  const [themeName, setThemeName] = useState(() => {
    if (typeof document === 'undefined') return 'light';
    return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
  });

  useEffect(() => {
    if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') {
      return undefined;
    }

    const updateTheme = () => {
      setThemeName(
        document.documentElement.classList.contains('dark') ? 'dark' : 'light',
      );
    };
    updateTheme();

    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => observer.disconnect();
  }, []);

  const spec = useMemo(
    () => ({
      ...(props.spec || {}),
      background: 'transparent',
      theme: themeName,
    }),
    [props.spec, themeName],
  );

  const option = useMemo(
    () => ({
      ...(props.option || props.options || {}),
      background: 'transparent',
    }),
    [props.option, props.options],
  );

  const handleError = (...args) => {
    console.error('[DashboardChart]', ...args);
    onError?.(...args);
  };

  return (
    <SafeVChartBoundary spec={spec}>
      <div className='dashboard-vchart h-full w-full'>
        <VChart
          {...props}
          key={themeName}
          spec={spec}
          option={option}
          options={option}
          onError={handleError}
        />
      </div>
    </SafeVChartBoundary>
  );
};

export default SafeVChart;
