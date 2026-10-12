/**
 * 병원·보건소 기록지(영유아건강검진 결과통보서, 진료 기록, 키재기 기계 출력물 등)의
 * OCR 텍스트에서 측정일, 키, 몸무게를 찾아냅니다.
 */
export interface ParsedMeasurement {
  date?: string;
  height?: number;
  weight?: number;
  confidence: { height: Confidence; weight: Confidence; date: Confidence };
}
export type Confidence = 'high' | 'low' | 'none';

const HEIGHT_RANGE: [number, number] = [40, 200];
const WEIGHT_RANGE: [number, number] = [1.5, 150];

const NUM = String.raw`(?<![\d.])(\d{1,3}(?:[.,]\d{1,2})?)(?![\d])`;
const HEIGHT_LABEL = String.raw`(?:신\s*장|키(?!로)|height|ht|身長|身高|길이|신장\s*\(cm\))`;
const WEIGHT_LABEL = String.raw`(?:체\s*중|몸\s*무\s*게|weight|wt|體重|体重)`;
const CM = String.raw`(?:cm|㎝|c\s*m|om|crn|센티)`;
const KG = String.raw`(?:kg|㎏|k\s*g|kq|k9|키로|킬로)`;

export function normalize(text: string): string {
  return text
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[．。]/g, '.')
    .replace(/[：]/g, ':')
    .replace(/(\d)\s*[.,]\s*(\d)/g, '$1.$2')
    .replace(/[ \t]+/g, ' ');
}

const toNum = (s: string) => Number(s.replace(',', '.'));
const inRange = (v: number, [lo, hi]: [number, number]) => v >= lo && v <= hi;

function findLabeled(
  text: string,
  label: string,
  unit: string,
  range: [number, number],
): { value: number; withUnit: boolean } | undefined {
  // 라벨 뒤 가까운 숫자. 표가 칸별로 인식돼 라벨과 값이 다른 줄로 나뉘는 경우도 허용.
  // 단위가 붙은 값을 우선 (백분위수 같은 숫자를 피하기 위해)
  const re = new RegExp(`${label}[^\\d]{0,14}?${NUM}\\s*(${unit})?`, 'gi');
  let loose: number | undefined;
  for (const m of text.matchAll(re)) {
    const v = toNum(m[1]);
    if (!inRange(v, range)) continue;
    if (m[2]) return { value: v, withUnit: true };
    loose ??= v;
  }
  return loose == null ? undefined : { value: loose, withUnit: false };
}

function findByUnit(text: string, unit: string, range: [number, number]): number | undefined {
  const re = new RegExp(`${NUM}\\s*${unit}(?![a-z])`, 'gi');
  for (const m of text.matchAll(re)) {
    const v = toNum(m[1]);
    if (inRange(v, range)) return v;
  }
  return undefined;
}

const pad = (n: number) => String(n).padStart(2, '0');

export function findDate(text: string, today = new Date()): string | undefined {
  const patterns = [
    /(20\d{2})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})\s*일?/g,
    /(?<!\d)(\d{2})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{1,2})(?!\d)/g,
    /(?<!\d)(20\d{2})(\d{2})(\d{2})(?!\d)/g,
  ];
  const found: string[] = [];
  for (const re of patterns) {
    for (const m of text.matchAll(re)) {
      let y = Number(m[1]);
      if (y < 100) y += 2000;
      const mo = Number(m[2]);
      const d = Number(m[3]);
      if (mo < 1 || mo > 12 || d < 1 || d > 31) continue;
      const iso = `${y}-${pad(mo)}-${pad(d)}`;
      const dt = new Date(iso + 'T00:00:00');
      if (Number.isNaN(dt.getTime()) || dt > today || y < 2000) continue;
      found.push(iso);
    }
    if (found.length) break;
  }
  // 생년월일 같은 오래된 날짜보다 측정일(가장 최근)이 더 그럴듯함
  return found.sort().at(-1);
}

export function parseMeasurement(raw: string, today = new Date()): ParsedMeasurement {
  const text = normalize(raw);
  const hl = findLabeled(text, HEIGHT_LABEL, CM, HEIGHT_RANGE);
  const wl = findLabeled(text, WEIGHT_LABEL, KG, WEIGHT_RANGE);
  const hu = hl?.withUnit ? undefined : findByUnit(text, CM, HEIGHT_RANGE);
  const wu = wl?.withUnit ? undefined : findByUnit(text, KG, WEIGHT_RANGE);
  const height = hl?.withUnit ? hl.value : (hl?.value ?? hu);
  const weight = wl?.withUnit ? wl.value : (wl?.value ?? wu);
  const date = findDate(text, today);
  return {
    height,
    weight,
    date,
    confidence: {
      height: hl?.withUnit ? 'high' : height != null ? 'low' : 'none',
      weight: wl?.withUnit ? 'high' : weight != null ? 'low' : 'none',
      date: date ? 'high' : 'none',
    },
  };
}

const RANK: Record<Confidence, number> = { none: 0, low: 1, high: 2 };

/** 여러 번 인식한 결과 중 항목별로 더 확실한 값을 고릅니다. */
export function mergeParsed(a: ParsedMeasurement, b: ParsedMeasurement): ParsedMeasurement {
  const out: ParsedMeasurement = { ...a, confidence: { ...a.confidence } };
  for (const k of ['height', 'weight', 'date'] as const) {
    if (RANK[b.confidence[k]] > RANK[a.confidence[k]]) {
      (out as unknown as Record<string, unknown>)[k] = b[k];
      out.confidence[k] = b.confidence[k];
    }
  }
  return out;
}

export function isComplete(p: ParsedMeasurement): boolean {
  return p.confidence.height === 'high' && p.confidence.weight === 'high' && p.confidence.date === 'high';
}
