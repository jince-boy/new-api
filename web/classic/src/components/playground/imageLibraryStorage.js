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

const IMAGE_LIBRARY_STORAGE_KEY = 'playground_image_library';
const MAX_IMAGE_ASSETS = 80;

export const loadImageLibrary = () => {
  try {
    const raw = localStorage.getItem(IMAGE_LIBRARY_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const persistImageLibrary = (assets) => {
  const next = (Array.isArray(assets) ? assets : []).slice(0, MAX_IMAGE_ASSETS);

  try {
    localStorage.setItem(IMAGE_LIBRARY_STORAGE_KEY, JSON.stringify(next));
    return next;
  } catch {
    const compact = next.slice(0, 24);
    try {
      localStorage.setItem(IMAGE_LIBRARY_STORAGE_KEY, JSON.stringify(compact));
    } catch {
      localStorage.removeItem(IMAGE_LIBRARY_STORAGE_KEY);
      return [];
    }
    return compact;
  }
};

export const createImageAssets = ({
  urls,
  prompt,
  mode,
  model,
  group,
  size,
  quality,
  conversationId,
}) => {
  const now = Date.now();
  return (urls || []).map((url, index) => ({
    id: `pg-img-${now}-${index}-${Math.random().toString(36).slice(2, 8)}`,
    url,
    prompt,
    mode,
    model,
    group,
    size,
    quality,
    conversationId,
    createdAt: now,
  }));
};
