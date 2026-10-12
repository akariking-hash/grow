import { useCallback, useEffect, useState } from 'react';
import type { AppState, Child, GrowthRecord, Settings } from './types';

const KEY = 'aikiki:v1';

const empty: AppState = { children: [], records: [], settings: { ocrEngine: 'device' } };

function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...empty, ...JSON.parse(raw) } : empty;
  } catch {
    return empty;
  }
}

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

export function useAppState() {
  const [state, setState] = useState<AppState>(load);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      // 저장 공간 부족 등 — 메모리 상태는 유지
    }
  }, [state]);

  const saveChild = useCallback((child: Child) => {
    setState((s) => {
      const exists = s.children.some((c) => c.id === child.id);
      return {
        ...s,
        children: exists ? s.children.map((c) => (c.id === child.id ? child : c)) : [...s.children, child],
        activeChildId: child.id,
      };
    });
  }, []);

  const removeChild = useCallback((id: string) => {
    setState((s) => {
      const children = s.children.filter((c) => c.id !== id);
      return {
        ...s,
        children,
        records: s.records.filter((r) => r.childId !== id),
        activeChildId: s.activeChildId === id ? children[0]?.id : s.activeChildId,
      };
    });
  }, []);

  const setActive = useCallback((id: string) => setState((s) => ({ ...s, activeChildId: id })), []);

  const saveRecord = useCallback((rec: GrowthRecord) => {
    setState((s) => {
      const exists = s.records.some((r) => r.id === rec.id);
      return { ...s, records: exists ? s.records.map((r) => (r.id === rec.id ? rec : r)) : [...s.records, rec] };
    });
  }, []);

  const removeRecord = useCallback((id: string) => {
    setState((s) => ({ ...s, records: s.records.filter((r) => r.id !== id) }));
  }, []);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setState((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
  }, []);

  const replaceAll = useCallback((next: AppState) => setState({ ...empty, ...next }), []);

  return { state, saveChild, removeChild, setActive, saveRecord, removeRecord, updateSettings, replaceAll };
}

export type Store = ReturnType<typeof useAppState>;

export function recordsOf(state: AppState, childId: string): GrowthRecord[] {
  return state.records.filter((r) => r.childId === childId).sort((a, b) => a.date.localeCompare(b.date));
}

export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
