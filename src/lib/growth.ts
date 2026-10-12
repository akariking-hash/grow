import lms from '../data/who-lms.json';
import type { GrowthRecord, Sex } from './types';

export type Metric = 'height' | 'weight' | 'bmi';
type Row = [number, number, number, number]; // [개월, L, M, S]

const TABLES = lms as unknown as Record<'boys' | 'girls', Record<Metric, Row[]>>;

export const METRIC_LABEL: Record<Metric, string> = { height: '키', weight: '몸무게', bmi: 'BMI' };
export const METRIC_UNIT: Record<Metric, string> = { height: 'cm', weight: 'kg', bmi: '' };

function table(sex: Sex, metric: Metric): Row[] {
  return TABLES[sex === 'M' ? 'boys' : 'girls'][metric];
}

export function maxMonths(sex: Sex, metric: Metric): number {
  const t = table(sex, metric);
  return t[t.length - 1][0];
}

/** 월령에 해당하는 LMS 값 (개월 사이는 선형 보간) */
export function lmsAt(sex: Sex, metric: Metric, months: number): { L: number; M: number; S: number } | null {
  const t = table(sex, metric);
  if (months < 0 || months > t[t.length - 1][0]) return null;
  const i = Math.min(Math.floor(months), t.length - 2);
  const [, L0, M0, S0] = t[i];
  const [, L1, M1, S1] = t[i + 1];
  const f = months - t[i][0];
  return { L: L0 + (L1 - L0) * f, M: M0 + (M1 - M0) * f, S: S0 + (S1 - S0) * f };
}

export function zScore(sex: Sex, metric: Metric, months: number, value: number): number | null {
  const p = lmsAt(sex, metric, months);
  if (!p || value <= 0) return null;
  const { L, M, S } = p;
  return Math.abs(L) < 1e-6 ? Math.log(value / M) / S : (Math.pow(value / M, L) - 1) / (L * S);
}

export function valueAtZ(sex: Sex, metric: Metric, months: number, z: number): number | null {
  const p = lmsAt(sex, metric, months);
  if (!p) return null;
  const { L, M, S } = p;
  return Math.abs(L) < 1e-6 ? M * Math.exp(S * z) : M * Math.pow(1 + L * S * z, 1 / L);
}

/** 표준정규분포 누적확률 (Abramowitz–Stegun 근사) */
export function normCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

/** 백분위수 → z (Acklam 역함수 근사) */
export function normInv(p: number): number {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const lo = 0.02425;
  if (p < lo) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - lo) return -normInv(1 - p);
  const q = p - 0.5;
  const r = q * q;
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

/** 백분위 (0–100). "또래 100명 중 작은 쪽부터 몇 번째" */
export function percentile(sex: Sex, metric: Metric, months: number, value: number): number | null {
  const z = zScore(sex, metric, months, value);
  return z == null ? null : normCdf(z) * 100;
}

export function bmi(heightCm: number, weightKg: number): number {
  const m = heightCm / 100;
  return weightKg / (m * m);
}

export type BmiStatus = { label: string; tone: 'low' | 'ok' | 'warn' | 'high' };

/** 소아청소년 BMI 백분위 판정 기준 (5 미만 저체중, 85 이상 과체중, 95 이상 비만) */
export function bmiStatus(pct: number): BmiStatus {
  if (pct < 5) return { label: '저체중', tone: 'low' };
  if (pct < 85) return { label: '정상', tone: 'ok' };
  if (pct < 95) return { label: '과체중', tone: 'warn' };
  return { label: '비만', tone: 'high' };
}

export const ADULT_MONTHS = 216; // 만 18세

/**
 * 성인 예상 키.
 * 1) 현재 키 백분위를 18세까지 유지한다고 가정한 값
 * 2) 부모 키가 있으면 중간부모키(Tanner)와 평균
 * 어디까지나 통계적 추정치이며 ±5cm 이상 차이 날 수 있습니다.
 */
export function predictAdultHeight(
  sex: Sex,
  months: number,
  heightCm: number,
  parents?: { father?: number; mother?: number },
): { value: number; byPercentile: number; midParental: number | null; range: [number, number] } | null {
  if (months < 24) return null; // 만 2세 미만은 예측 신뢰도가 낮음
  const z = zScore(sex, 'height', months, heightCm);
  if (z == null) return null;
  const byPercentile = valueAtZ(sex, 'height', ADULT_MONTHS, z)!;
  let midParental: number | null = null;
  if (parents?.father && parents?.mother) {
    midParental = (parents.father + parents.mother + (sex === 'M' ? 13 : -13)) / 2;
  }
  const value = midParental == null ? byPercentile : (byPercentile + midParental) / 2;
  return { value, byPercentile, midParental, range: [value - 5, value + 5] };
}

/** 생년월일 → 측정일 기준 월령 (소수) */
export function ageInMonths(birth: string, on: string): number {
  const b = new Date(birth + 'T00:00:00');
  const d = new Date(on + 'T00:00:00');
  return (d.getTime() - b.getTime()) / (1000 * 60 * 60 * 24) / 30.4375;
}

export function formatAge(months: number): string {
  if (months < 0) return '출생 전';
  const y = Math.floor(months / 12);
  const m = Math.floor(months % 12);
  if (y === 0) return `${m}개월`;
  return m === 0 ? `${y}세` : `${y}세 ${m}개월`;
}

/** "상위 n%" 문구 */
export function rankText(pct: number): string {
  const top = Math.max(1, Math.round(100 - pct));
  return top <= 50 ? `상위 ${top}%` : `하위 ${Math.max(1, Math.round(pct))}%`;
}

export function valueOf(r: GrowthRecord, metric: Metric): number | undefined {
  if (metric === 'bmi') return r.height && r.weight ? bmi(r.height, r.weight) : undefined;
  return r[metric];
}
