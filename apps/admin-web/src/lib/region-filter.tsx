'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AdminRegion } from '@motoboycity/types';
import { adminRegionsApi } from './api-client';
import { session } from './session';

export const REGION_FILTER_STORAGE_KEY = 'motoboycity:admin-region-id';

const EMPTY_REGIONS: AdminRegion[] = [];
const listeners = new Set<() => void>();

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener('storage', onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onChange);
  };
}

function getSnapshot(): string {
  return window.localStorage.getItem(REGION_FILTER_STORAGE_KEY) ?? '';
}

function getServerSnapshot(): string {
  return '';
}

function writeStoredRegionId(nextRegionId: string) {
  if (nextRegionId) {
    window.localStorage.setItem(REGION_FILTER_STORAGE_KEY, nextRegionId);
  } else {
    window.localStorage.removeItem(REGION_FILTER_STORAGE_KEY);
  }
  listeners.forEach((notify) => notify());
}

/**
 * Se a cidade salva no navegador não existir mais no catálogo, volta para a
 * visão consolidada ("Todas as cidades") sem travar o painel em listas vazias.
 */
export function normalizeSelectedRegionId(
  storedRegionId: string,
  regions: readonly Pick<AdminRegion, 'id'>[] | undefined,
): string {
  if (!storedRegionId) return '';
  if (!regions) return storedRegionId;
  return regions.some((region) => region.id === storedRegionId) ? storedRegionId : '';
}

export interface AdminRegionFilterState {
  regionId: string;
  setRegionId: (regionId: string) => void;
  selectedRegion: AdminRegion | null;
  regions: AdminRegion[];
  isLoading: boolean;
}

const AdminRegionFilterContext = createContext<AdminRegionFilterState | null>(null);

export function AdminRegionFilterProvider({ children }: { children: ReactNode }) {
  const token = session.getToken();
  const storedRegionId = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const regionsQuery = useQuery({
    queryKey: ['admin', 'regions'],
    queryFn: () => adminRegionsApi.list(token as string),
    enabled: Boolean(token),
    staleTime: 30_000,
  });

  const regions = regionsQuery.data ?? EMPTY_REGIONS;
  const regionId = normalizeSelectedRegionId(storedRegionId, regionsQuery.data);
  const selectedRegion = useMemo(
    () => regions.find((region) => region.id === regionId) ?? null,
    [regionId, regions],
  );

  const setRegionId = useCallback((nextRegionId: string) => {
    writeStoredRegionId(nextRegionId);
  }, []);

  const value = useMemo<AdminRegionFilterState>(
    () => ({
      regionId,
      setRegionId,
      selectedRegion,
      regions,
      isLoading: regionsQuery.isLoading,
    }),
    [regionId, regions, regionsQuery.isLoading, selectedRegion, setRegionId],
  );

  return (
    <AdminRegionFilterContext.Provider value={value}>{children}</AdminRegionFilterContext.Provider>
  );
}

export function useAdminRegionFilter(): AdminRegionFilterState {
  const context = useContext(AdminRegionFilterContext);
  if (!context) {
    throw new Error('useAdminRegionFilter deve ser usado dentro de AdminRegionFilterProvider.');
  }
  return context;
}
