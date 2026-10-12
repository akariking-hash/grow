export type Sex = 'M' | 'F';

export interface Child {
  id: string;
  name: string;
  sex: Sex;
  birth: string; // YYYY-MM-DD
  avatar: string; // 이모지
  color: string;
  fatherHeight?: number;
  motherHeight?: number;
}

export interface GrowthRecord {
  id: string;
  childId: string;
  date: string; // YYYY-MM-DD
  height?: number; // cm
  weight?: number; // kg
  source: 'photo' | 'manual';
  memo?: string;
  thumb?: string; // 작은 썸네일 data URL
}

export interface Settings {
  ocrEngine: 'device' | 'claude';
  claudeApiKey?: string;
}

export interface AppState {
  children: Child[];
  records: GrowthRecord[];
  activeChildId?: string;
  settings: Settings;
}
