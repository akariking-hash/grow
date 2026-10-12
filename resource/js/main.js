/* ==========================================================================
   쑥쑥 키린 — 아이 성장 기록
   1. 성장 계산 (LMS 백분위·BMI·예상 키)
   2. 기록지 텍스트 해석 (OCR 결과에서 날짜·키·몸무게 찾기)
   3. 화면 (상태 저장, 렌더링, 그래프, 시트, 사진 인식)
   ========================================================================== */

/* --------------------------------------------------------------------------
   1. 성장 계산
   -------------------------------------------------------------------------- */

const ADULT_MONTHS = 216; // 만 18세
const PERCENTILE_LINES = [3, 10, 25, 50, 75, 90, 97];
const METRIC_LABEL = { height: '키', weight: '몸무게', bmi: 'BMI' };
const METRIC_UNIT = { height: 'cm', weight: 'kg', bmi: '' };

function lmsTable(sex, metric) {
    return LMS_DATA[sex === 'M' ? 'boys' : 'girls'][metric];
}

function maxMonths(sex, metric) {
    const table = lmsTable(sex, metric);
    return table[table.length - 1][0];
}

/** 월령에 해당하는 L·M·S (개월 사이는 선형 보간) */
function lmsAt(sex, metric, months) {
    const table = lmsTable(sex, metric);
    if (months < 0 || months > table[table.length - 1][0]) {
        return null;
    }
    const i = Math.min(Math.floor(months), table.length - 2);
    const a = table[i];
    const b = table[i + 1];
    const f = months - a[0];
    return { L: a[1] + (b[1] - a[1]) * f, M: a[2] + (b[2] - a[2]) * f, S: a[3] + (b[3] - a[3]) * f };
}

function zScore(sex, metric, months, value) {
    const p = lmsAt(sex, metric, months);
    if (!p || !(value > 0)) {
        return null;
    }
    if (Math.abs(p.L) < 1e-6) {
        return Math.log(value / p.M) / p.S;
    }
    return (Math.pow(value / p.M, p.L) - 1) / (p.L * p.S);
}

function valueAtZ(sex, metric, months, z) {
    const p = lmsAt(sex, metric, months);
    if (!p) {
        return null;
    }
    if (Math.abs(p.L) < 1e-6) {
        return p.M * Math.exp(p.S * z);
    }
    return p.M * Math.pow(1 + p.L * p.S * z, 1 / p.L);
}

/** 표준정규분포 누적확률 (Abramowitz–Stegun 근사) */
function normCdf(z) {
    const t = 1 / (1 + 0.2316419 * Math.abs(z));
    const d = 0.3989423 * Math.exp((-z * z) / 2);
    const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return z > 0 ? 1 - p : p;
}

/** 누적확률 → z (Acklam 근사) */
function normInv(p) {
    const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
    const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
    const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
    const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
    const low = 0.02425;
    if (p < low) {
        const q = Math.sqrt(-2 * Math.log(p));
        return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }
    if (p > 1 - low) {
        return -normInv(1 - p);
    }
    const q = p - 0.5;
    const r = q * q;
    return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

/** 백분위 0~100 (작은 쪽부터) */
function percentile(sex, metric, months, value) {
    const z = zScore(sex, metric, months, value);
    return z === null ? null : normCdf(z) * 100;
}

function calcBmi(heightCm, weightKg) {
    const m = heightCm / 100;
    return weightKg / (m * m);
}

function valueOf(record, metric) {
    if (metric === 'bmi') {
        return record.height && record.weight ? calcBmi(record.height, record.weight) : null;
    }
    return record[metric] || null;
}

/** 소아청소년 BMI 판정: 5 미만 저체중, 85 이상 과체중, 95 이상 비만 */
function bmiStatus(pct) {
    if (pct < 5) {
        return { label: '저체중', tone: 'low' };
    }
    if (pct < 85) {
        return { label: '정상', tone: 'ok' };
    }
    if (pct < 95) {
        return { label: '과체중', tone: 'warn' };
    }
    return { label: '비만', tone: 'high' };
}

/**
 * 성인 예상 키: 현재 키 백분위를 만 18세까지 유지한다고 가정한 값.
 * 부모 키가 있으면 중간부모키(Tanner)와 평균. 만 2세 미만은 예측하지 않음.
 */
function predictAdultHeight(sex, months, heightCm, father, mother) {
    if (months < 24) {
        return null;
    }
    const z = zScore(sex, 'height', months, heightCm);
    if (z === null) {
        return null;
    }
    const byPercentile = valueAtZ(sex, 'height', ADULT_MONTHS, z);
    const midParental = father && mother ? (father + mother + (sex === 'M' ? 13 : -13)) / 2 : null;
    const value = midParental === null ? byPercentile : (byPercentile + midParental) / 2;
    return { value: value, byPercentile: byPercentile, midParental: midParental, range: [value - 5, value + 5] };
}

function ageInMonths(birth, on) {
    const b = new Date(birth + 'T00:00:00');
    const d = new Date(on + 'T00:00:00');
    return (d - b) / 86400000 / 30.4375;
}

function formatAge(months) {
    if (months < 0) {
        return '출생 전';
    }
    const y = Math.floor(months / 12);
    const m = Math.floor(months % 12);
    if (y === 0) {
        return m + '개월';
    }
    return m === 0 ? y + '세' : y + '세 ' + m + '개월';
}

function rankText(pct) {
    const top = Math.max(1, Math.round(100 - pct));
    return top <= 50 ? '상위 ' + top + '%' : '하위 ' + Math.max(1, Math.round(pct)) + '%';
}

/* --------------------------------------------------------------------------
   2. 기록지 텍스트 해석
   -------------------------------------------------------------------------- */

const HEIGHT_RANGE = [40, 200];
const WEIGHT_RANGE = [1.5, 150];
// 앞뒤가 숫자이거나 '90~200' 같은 범위 표기면 측정값이 아님
const NUM_PATTERN = '(?<![\\d.]|[~～]\\s?)(\\d{1,3}(?:[.,]\\d{1,2})?)(?!\\d|\\.\\d|\\s*[~～])';
const HEIGHT_LABEL = '(?:신\\s*장|키(?!로)|height|ht|身長|身高|길이)';
const WEIGHT_LABEL = '(?:체\\s*중|몸\\s*무\\s*게|weight|wt|體重|体重)';
const CM_PATTERN = '(?:cm|㎝|c\\s*m|om|crn|센티)';
const KG_PATTERN = '(?:kg|㎏|k\\s*g|kq|k9|키로|킬로)';
const CONFIDENCE_RANK = { none: 0, low: 1, high: 2 };

function normalizeText(text) {
    return text
        .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
        .replace(/[．。]/g, '.')
        .replace(/[：]/g, ':')
        .replace(/(\d)\s*[.,]\s*(\d)/g, '$1.$2')
        .replace(/[ \t]+/g, ' ');
}

const toNumber = (s) => Number(s.replace(',', '.'));
const inRange = (v, range) => v >= range[0] && v <= range[1];

/** 라벨 가까이 있는 숫자. 표가 칸별로 인식돼 줄이 나뉘어도 찾고, 단위가 붙은 값을 우선 */
function findLabeled(text, label, unit, range) {
    const re = new RegExp(label + '[^\\d]{0,14}?' + NUM_PATTERN + '\\s*(' + unit + ')?', 'gi');
    let loose = null;
    for (const m of text.matchAll(re)) {
        const v = toNumber(m[1]);
        if (!inRange(v, range)) {
            continue;
        }
        if (m[2]) {
            return { value: v, withUnit: true };
        }
        if (loose === null) {
            loose = v;
        }
    }
    return loose === null ? null : { value: loose, withUnit: false };
}

function findByUnit(text, unit, range) {
    const re = new RegExp(NUM_PATTERN + '\\s*' + unit + '(?![a-z])', 'gi');
    for (const m of text.matchAll(re)) {
        const v = toNumber(m[1]);
        if (inRange(v, range)) {
            return v;
        }
    }
    return null;
}

const pad2 = (n) => String(n).padStart(2, '0');

/** 날짜 후보 중 오늘 이전의 가장 최근 날짜(=측정일). 생년월일보다 측정일이 늦으므로 */
function findDate(text, today) {
    const now = today || new Date();
    const patterns = [
        /(20\d{2})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})\s*일?/g,
        /(?<!\d)(\d{2})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{1,2})(?!\d)/g,
        /(?<!\d)(20\d{2})(\d{2})(\d{2})(?!\d)/g
    ];
    const found = [];
    for (const re of patterns) {
        for (const m of text.matchAll(re)) {
            let y = Number(m[1]);
            if (y < 100) {
                y += 2000;
            }
            const mo = Number(m[2]);
            const d = Number(m[3]);
            if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 2000) {
                continue;
            }
            const iso = y + '-' + pad2(mo) + '-' + pad2(d);
            const dt = new Date(iso + 'T00:00:00');
            if (Number.isNaN(dt.getTime()) || dt > now) {
                continue;
            }
            found.push(iso);
        }
        if (found.length) {
            break;
        }
    }
    return found.sort().pop() || null;
}

function parseMeasurement(raw, today) {
    const text = normalizeText(raw);
    const hl = findLabeled(text, HEIGHT_LABEL, CM_PATTERN, HEIGHT_RANGE);
    const wl = findLabeled(text, WEIGHT_LABEL, KG_PATTERN, WEIGHT_RANGE);
    const hu = hl && hl.withUnit ? null : findByUnit(text, CM_PATTERN, HEIGHT_RANGE);
    const wu = wl && wl.withUnit ? null : findByUnit(text, KG_PATTERN, WEIGHT_RANGE);
    const height = hl ? hl.value : hu;
    const weight = wl ? wl.value : wu;
    const date = findDate(text, today);
    return {
        height: height,
        weight: weight,
        date: date,
        confidence: {
            height: hl && hl.withUnit ? 'high' : height !== null ? 'low' : 'none',
            weight: wl && wl.withUnit ? 'high' : weight !== null ? 'low' : 'none',
            date: date ? 'high' : 'none'
        }
    };
}

/** 여러 번 인식한 결과에서 항목별로 더 확실한 값을 고름 */
function mergeParsed(a, b) {
    const out = { height: a.height, weight: a.weight, date: a.date, confidence: Object.assign({}, a.confidence) };
    ['height', 'weight', 'date'].forEach((key) => {
        if (CONFIDENCE_RANK[b.confidence[key]] > CONFIDENCE_RANK[a.confidence[key]]) {
            out[key] = b[key];
            out.confidence[key] = b.confidence[key];
        }
    });
    return out;
}

function isComplete(p) {
    return p.confidence.height === 'high' && p.confidence.weight === 'high' && p.confidence.date === 'high';
}

/* --------------------------------------------------------------------------
   2-1. LED 숫자 판독 (신장·체중 자동측정기의 초록/빨강 7세그먼트 화면)
   글자 인식(Tesseract)은 칸 모양 숫자를 못 읽어서, 켜진 LED 픽셀을 직접 분석합니다.
   -------------------------------------------------------------------------- */

// 세그먼트 순서: a(위) b(오른쪽 위) c(오른쪽 아래) d(아래) e(왼쪽 아래) f(왼쪽 위) g(가운데)
const SEGMENT_DIGITS = {
    '1111110': 0, '0110000': 1, '1101101': 2, '1111001': 3, '0110011': 4,
    '1011011': 5, '1011111': 6, '1110000': 7, '1111111': 8, '1111011': 9,
    '0011111': 6, '1110010': 7, '1110011': 9
};
// 세그먼트별 확인 영역 [x 시작, x 끝, y 시작, y 끝] (기울기를 바로 세운 숫자 칸 대비 비율)
const SEGMENT_ZONES = [
    [0.3, 0.7, 0, 0.15],
    [0.68, 1, 0.18, 0.4],
    [0.68, 1, 0.6, 0.82],
    [0.3, 0.7, 0.85, 1],
    [0, 0.32, 0.6, 0.82],
    [0, 0.32, 0.18, 0.4],
    [0.3, 0.7, 0.43, 0.57]
];

/** 켜진 LED 픽셀 지도 (초록·빨강 중 더 많은 색). 밝기 기준은 사진마다 가장 밝은 LED 대비 상대값 */
function ledMask(image) {
    const total = image.width * image.height;
    const d = image.data;
    const strengthOf = (color, i) => (color === 'green' ? d[i * 4 + 1] - Math.max(d[i * 4], d[i * 4 + 2]) : d[i * 4] - Math.max(d[i * 4 + 1], d[i * 4 + 2]));
    const brightOf = (color, i) => (color === 'green' ? d[i * 4 + 1] : d[i * 4]);
    let best = null;
    ['green', 'red'].forEach((color) => {
        let peakStrength = 0;
        let peakBright = 0;
        for (let i = 0; i < total; i += 1) {
            const strength = strengthOf(color, i);
            if (strength > peakStrength) {
                peakStrength = strength;
            }
            if (strength > 40 && brightOf(color, i) > peakBright) {
                peakBright = brightOf(color, i);
            }
        }
        const mask = new Uint8Array(total);
        let count = 0;
        const minStrength = Math.max(35, peakStrength * 0.4);
        const minBright = Math.max(60, peakBright * 0.55);
        for (let i = 0; i < total; i += 1) {
            if (strengthOf(color, i) > minStrength && brightOf(color, i) > minBright) {
                mask[i] = 1;
                count += 1;
            }
        }
        if (!best || count > best.count) {
            best = { mask: mask, count: count };
        }
    });
    return best.mask;
}

/** 0이 아닌 구간들 [시작, 끝) — 간격이 gap 이하면 하나로 합침 */
function runs(values, minValue, gap) {
    const out = [];
    let start = -1;
    let lastOn = -1;
    values.forEach((v, i) => {
        if (v > minValue) {
            if (start < 0) {
                start = i;
            } else if (i - lastOn - 1 > gap) {
                out.push([start, lastOn + 1]);
                start = i;
            }
            lastOn = i;
        }
    });
    if (start >= 0) {
        out.push([start, lastOn + 1]);
    }
    return out;
}

function decodeDigit(mask, width, x0, x1, y0, y1) {
    const h = y1 - y0;
    const w = x1 - x0;
    if (w < h * 0.32) {
        return { digit: 1, exact: true }; // 1은 오른쪽 세로 획만 켜져 폭이 좁음
    }
    const lit = SEGMENT_ZONES.map((zone) => {
        let on = 0;
        let all = 0;
        for (let y = Math.floor(y0 + zone[2] * h); y < Math.ceil(y0 + zone[3] * h); y += 1) {
            for (let x = Math.floor(x0 + zone[0] * w); x < Math.ceil(x0 + zone[1] * w); x += 1) {
                on += mask[y * width + x];
                all += 1;
            }
        }
        return all && on / all > 0.18 ? '1' : '0';
    }).join('');
    if (lit in SEGMENT_DIGITS) {
        return { digit: SEGMENT_DIGITS[lit], exact: true };
    }
    // 정확히 맞는 모양이 없으면 세그먼트 하나 차이 나는 숫자 중 가장 가까운 것
    let best = null;
    Object.keys(SEGMENT_DIGITS).forEach((pattern) => {
        let diff = 0;
        for (let i = 0; i < 7; i += 1) {
            diff += pattern[i] !== lit[i] ? 1 : 0;
        }
        if (diff === 1 && best === null) {
            best = SEGMENT_DIGITS[pattern];
        }
    });
    return best === null ? null : { digit: best, exact: false };
}

/**
 * 사진이 돌아가 있으면 LED 줄이 수평이 되도록 회전(±12°).
 * 줄 방향 히스토그램이 가장 뾰족해지는(줄 사이가 가장 또렷한) 각도를 고름.
 */
function straighten(mask, width, height) {
    const points = [];
    for (let i = 0; i < mask.length; i += 1) {
        if (mask[i]) {
            points.push([i % width, Math.floor(i / width)]);
        }
    }
    let bestAngle = 0;
    let bestScore = -1;
    for (let deg = -12; deg <= 12.001; deg += 1) {
        const rad = (deg * Math.PI) / 180;
        const sin = Math.sin(rad);
        const cos = Math.cos(rad);
        const hist = new Map();
        points.forEach((p) => {
            const y = Math.round(p[1] * cos - p[0] * sin);
            hist.set(y, (hist.get(y) || 0) + 1);
        });
        let score = 0;
        hist.forEach((v) => {
            score += v * v;
        });
        if (score > bestScore) {
            bestScore = score;
            bestAngle = rad;
        }
    }
    if (bestAngle === 0 || !points.length) {
        return { mask: mask, width: width, height: height };
    }
    const sin = Math.sin(bestAngle);
    const cos = Math.cos(bestAngle);
    const moved = points.map((p) => [Math.round(p[0] * cos + p[1] * sin), Math.round(p[1] * cos - p[0] * sin)]);
    const minX = Math.min.apply(null, moved.map((p) => p[0]));
    const minY = Math.min.apply(null, moved.map((p) => p[1]));
    const w = Math.max.apply(null, moved.map((p) => p[0])) - minX + 1;
    const h = Math.max.apply(null, moved.map((p) => p[1])) - minY + 1;
    const out = new Uint8Array(w * h);
    // 회전하면서 생긴 빈틈을 메우기 위해 오른쪽·아래 한 칸도 채움
    moved.forEach((p) => {
        const x = p[0] - minX;
        const y = p[1] - minY;
        out[y * w + x] = 1;
        if (x + 1 < w) {
            out[y * w + x + 1] = 1;
        }
        if (y + 1 < h) {
            out[(y + 1) * w + x] = 1;
        }
    });
    return { mask: out, width: w, height: h };
}

/**
 * 한 줄을 잘라 기울기(이탤릭 글꼴·사진 회전)를 바로 세움.
 * 세로 획이 가장 곧게 서는(차지하는 열 수가 가장 적은) 기울기를 찾아 x' = x + s·(y − 중심)으로 옮김.
 */
function deskewBand(mask, width, y0, y1) {
    const points = [];
    for (let y = y0; y < y1; y += 1) {
        for (let x = 0; x < width; x += 1) {
            if (mask[y * width + x]) {
                points.push([x, y - y0]);
            }
        }
    }
    const h = y1 - y0;
    const mid = h / 2;
    let bestShear = 0;
    let bestColumns = Infinity;
    for (let shear = -0.4; shear <= 0.4001; shear += 0.02) {
        const used = new Set();
        points.forEach((p) => used.add(Math.round(p[0] + shear * (p[1] - mid))));
        if (used.size < bestColumns) {
            bestColumns = used.size;
            bestShear = shear;
        }
    }
    let minX = Infinity;
    let maxX = -Infinity;
    const moved = points.map((p) => {
        const x = Math.round(p[0] + bestShear * (p[1] - mid));
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        return [x, p[1]];
    });
    const subWidth = moved.length ? maxX - minX + 1 : 0;
    const subMask = new Uint8Array(subWidth * h);
    moved.forEach((p) => {
        subMask[p[1] * subWidth + (p[0] - minX)] = 1;
    });
    return { mask: subMask, width: subWidth, height: h };
}

/**
 * 화면 이미지({width, height, data: RGBA})에서 LED 숫자 줄을 위에서부터 읽음.
 * 자동측정기는 소수점 한 자리 고정(129.3)이라 마지막 숫자를 소수 첫째 자리로 봄.
 */
function readLedRows(image) {
    const upright = straighten(ledMask(image), image.width, image.height);
    const mask = upright.mask;
    const W = upright.width;
    const H = upright.height;
    const rowSums = new Array(H).fill(0);
    for (let y = 0; y < H; y += 1) {
        for (let x = 0; x < W; x += 1) {
            rowSums[y] += mask[y * W + x];
        }
    }
    const minRow = Math.max(2, W * 0.004);
    const bands = runs(rowSums, minRow, Math.round(H * 0.012)).filter((b) => b[1] - b[0] >= H * 0.015);
    const rows = [];
    bands.forEach((band) => {
        const sub = deskewBand(mask, W, band[0], band[1]);
        const h = sub.height;
        const colSums = new Array(sub.width).fill(0);
        for (let y = 0; y < h; y += 1) {
            for (let x = 0; x < sub.width; x += 1) {
                colSums[x] += sub.mask[y * sub.width + x];
            }
        }
        // 소수점처럼 낮은 덩어리는 버리고, 숫자 높이의 60% 이상인 덩어리만 숫자로 봄
        const cells = runs(colSums, 0, Math.round(h * 0.06)).filter((c) => {
            let top = h;
            let bottom = 0;
            for (let y = 0; y < h; y += 1) {
                for (let x = c[0]; x < c[1]; x += 1) {
                    if (sub.mask[y * sub.width + x]) {
                        top = Math.min(top, y);
                        bottom = Math.max(bottom, y);
                    }
                }
            }
            return bottom - top >= h * 0.6 && c[1] - c[0] <= h * 1.1;
        });
        if (cells.length < 2 || cells.length > 5) {
            return;
        }
        const digits = cells.map((c) => decodeDigit(sub.mask, sub.width, c[0], c[1], 0, h));
        if (digits.some((d) => d === null)) {
            return;
        }
        rows.push({
            value: Number(digits.map((d) => d.digit).join('')) / 10,
            exact: digits.every((d) => d.exact)
        });
    });
    return rows;
}

/** LED 줄들 → 키·몸무게 (위에서부터 키, 그다음 몸무게 순서인 기계가 대부분) */
function readLedMeasurement(image) {
    const rows = readLedRows(image);
    const result = { height: null, weight: null, date: null, confidence: { height: 'none', weight: 'none', date: 'none' }, ledRows: rows };
    const i = rows.findIndex((r) => inRange(r.value, HEIGHT_RANGE));
    if (i >= 0) {
        result.height = rows[i].value;
        result.confidence.height = rows[i].exact ? 'high' : 'low';
    }
    const weightRow = rows.slice(i + 1).find((r) => inRange(r.value, WEIGHT_RANGE));
    if (weightRow) {
        result.weight = weightRow.value;
        result.confidence.weight = weightRow.exact ? 'high' : 'low';
    }
    return result;
}

/* --------------------------------------------------------------------------
   2-2. 사진 찍은 날짜 (JPEG EXIF DateTimeOriginal)
   -------------------------------------------------------------------------- */

function readExifDate(buffer) {
    const view = new DataView(buffer);
    if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) {
        return null;
    }
    let offset = 2;
    while (offset + 4 < view.byteLength) {
        const marker = view.getUint16(offset);
        const size = view.getUint16(offset + 2);
        if (marker === 0xffe1 && view.getUint32(offset + 4) === 0x45786966) { // 'Exif'
            return readTiffDate(view, offset + 10);
        }
        if ((marker & 0xff00) !== 0xff00 || marker === 0xffda) {
            return null;
        }
        offset += 2 + size;
    }
    return null;
}

function readTiffDate(view, tiff) {
    const little = view.getUint16(tiff) === 0x4949;
    const u16 = (p) => view.getUint16(p, little);
    const u32 = (p) => view.getUint32(p, little);
    const readIfd = (ifdOffset) => {
        const entries = {};
        const start = tiff + ifdOffset;
        if (start + 2 > view.byteLength) {
            return entries;
        }
        const count = u16(start);
        for (let i = 0; i < count; i += 1) {
            const entry = start + 2 + i * 12;
            if (entry + 12 > view.byteLength) {
                break;
            }
            entries[u16(entry)] = { type: u16(entry + 2), count: u32(entry + 4), value: entry + 8 };
        }
        return entries;
    };
    const asText = (e) => {
        if (!e || e.type !== 2) {
            return null;
        }
        const p = e.count > 4 ? tiff + u32(e.value) : e.value;
        let s = '';
        for (let i = 0; i < e.count - 1 && p + i < view.byteLength; i += 1) {
            s += String.fromCharCode(view.getUint8(p + i));
        }
        return s;
    };
    const ifd0 = readIfd(u32(tiff + 4));
    const exif = ifd0[0x8769] ? readIfd(u32(ifd0[0x8769].value)) : {};
    const raw = asText(exif[0x9003]) || asText(exif[0x9004]) || asText(ifd0[0x0132]);
    const m = raw && raw.match(/^(\d{4}):(\d{2}):(\d{2})/);
    return m && m[1] !== '0000' ? m[1] + '-' + m[2] + '-' + m[3] : null;
}

/* --------------------------------------------------------------------------
   3. 화면
   -------------------------------------------------------------------------- */

const STORAGE_KEY = 'kirin:v1';
const AVATARS = ['🐣', '🐻', '🐰', '🦊', '🐼', '🐯', '🐨', '🐸', '🦄', '🐬'];
const KID_COLORS = ['#2b7a0b', '#1769c2', '#d62e5f', '#c2410c', '#7a3fc4', '#0f766e'];
const TABS = ['home', 'chart', 'records', 'family', 'settings'];
const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js';
const CLAUDE_MODEL = 'claude-opus-5-5';
const MASCOT = {
    happy: 'resource/images/mascot-happy.svg',
    wow: 'resource/images/mascot-wow.svg',
    think: 'resource/images/mascot-think.svg',
    sleep: 'resource/images/mascot-sleep.svg'
};

let state = null;
let currentTab = 'home';
let chartMetric = 'height';
let lastFocus = null;
let recordDraft = null; // 기록 시트에서 편집 중인 값
const reduceMotion = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: true };

/* ---------- 유틸 ---------- */

const $ = (selector, root) => (root || document).querySelector(selector);
const $$ = (selector, root) => Array.from((root || document).querySelectorAll(selector));

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}

function todayIso() {
    const d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

function uid() {
    return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function dotDate(iso) {
    return iso.replaceAll('-', '.');
}

function hasBatchim(word) {
    const code = word.charCodeAt(word.length - 1);
    return code >= 0xac00 && code <= 0xd7a3 && (code - 0xac00) % 28 !== 0;
}

/** 이름 + 조사 (하늘이는 / 바다는) */
function nameWith(name, josa) {
    return escapeHtml(name) + (hasBatchim(name) ? '이' : '') + josa;
}

function canAnimate() {
    return typeof gsap !== 'undefined' && !reduceMotion.matches;
}

/* ---------- 상태 ---------- */

function loadState() {
    const empty = { children: [], records: [], activeChildId: null, settings: { ocrEngine: 'device', claudeApiKey: '' } };
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
        return saved ? Object.assign(empty, saved, { settings: Object.assign(empty.settings, saved.settings) }) : empty;
    } catch (error) {
        return empty;
    }
}

function saveState() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
        showToast('저장 공간이 부족해요. 백업 후 오래된 기록을 정리해 주세요.');
    }
}

function activeChild() {
    return state.children.find((c) => c.id === state.activeChildId) || state.children[0] || null;
}

function recordsOf(childId) {
    return state.records.filter((r) => r.childId === childId).sort((a, b) => a.date.localeCompare(b.date));
}

function latestOf(records, key) {
    for (let i = records.length - 1; i >= 0; i -= 1) {
        if (records[i][key]) {
            return records[i];
        }
    }
    return null;
}

function update(mutator) {
    mutator(state);
    saveState();
    render();
}

/* ---------- 렌더링 ---------- */

function render() {
    const child = activeChild();
    const onboarding = $('[data-onboarding]');
    const header = $('[data-header]');
    if (!child) {
        onboarding.hidden = false;
        onboarding.classList.add('onboarding-active');
        header.hidden = true;
        $$('[data-panel]').forEach((panel) => {
            panel.hidden = true;
            panel.classList.remove('panel-active');
        });
        mountChildForm($('[data-child-form-slot="onboarding"]'), null, true);
        return;
    }
    onboarding.hidden = true;
    onboarding.classList.remove('onboarding-active');
    header.hidden = false;
    renderKids(child);
    renderHome(child);
    renderChartPanel(child);
    renderRecords(child);
    renderFamily();
    renderSettings(child);
    showTab(currentTab, false);
}

function renderKids(child) {
    const html = state.children.map((c) => {
        const pressed = c.id === child.id;
        return '<button type="button" class="kid kid-color' + c.colorIndex + '" aria-pressed="' + pressed + '" data-select-child="' + c.id + '">' +
            '<span class="kid_avatar" aria-hidden="true">' + c.avatar + '</span>' + escapeHtml(c.name) + '</button>';
    }).join('');
    $('[data-kids]').innerHTML = html +
        '<button type="button" class="kid kid-add" aria-label="아이 추가" data-add-child>' +
        '<span class="kid_avatar"><img src="resource/images/icons/icon-plus.svg" alt="" width="18" height="18"></span></button>';
}

function statCard(opts) {
    if (!opts.record) {
        return '<article class="stat stat-' + opts.tone + '"><h3 class="stat_head"><img src="' + opts.icon + '" class="stat_icon" alt="" width="20" height="20" loading="lazy">' + opts.label + '</h3><p class="stat_empty">기록 없음</p></article>';
    }
    const pctHtml = opts.pct === null
        ? '<p class="stat_sub">비교 범위 밖 나이</p>'
        : '<p class="stat_sub">' + rankText(opts.pct) + ' · ' + opts.pct.toFixed(0) + '백분위</p>' +
            '<div class="pctbar" aria-hidden="true"><span class="pctbar_dot" data-pct="' + Math.min(97, Math.max(3, opts.pct)).toFixed(1) + '"></span></div>';
    return '<article class="stat stat-' + opts.tone + '">' +
        '<h3 class="stat_head"><img src="' + opts.icon + '" class="stat_icon" alt="" width="20" height="20" loading="lazy">' + opts.label + '</h3>' +
        '<p class="stat_value">' + opts.value + '<span class="stat_unit">' + opts.unit + '</span></p>' + pctHtml +
        '<p class="stat_date">' + dotDate(opts.record.date) + ' 측정</p></article>';
}

function renderHome(child) {
    const records = recordsOf(child.id);
    const lh = latestOf(records, 'height');
    const lw = latestOf(records, 'weight');
    const hPct = lh ? percentile(child.sex, 'height', ageInMonths(child.birth, lh.date), lh.height) : null;
    const wPct = lw ? percentile(child.sex, 'weight', ageInMonths(child.birth, lw.date), lw.weight) : null;
    const both = records.slice().reverse().find((r) => r.height && r.weight);
    const bmiValue = both ? calcBmi(both.height, both.weight) : null;
    const bmiPct = both ? percentile(child.sex, 'bmi', ageInMonths(child.birth, both.date), bmiValue) : null;
    const pred = lh ? predictAdultHeight(child.sex, ageInMonths(child.birth, lh.date), lh.height, child.fatherHeight, child.motherHeight) : null;
    const prev = lh ? records.slice().reverse().find((r) => r.height && r.date < lh.date) : null;

    $('[data-home-age]').textContent = child.avatar + ' ' + formatAge(ageInMonths(child.birth, todayIso()));
    $('[data-home-title]').innerHTML = nameWith(child.name, '는') + ' 쑥쑥 크는 중!';

    let speech;
    let mood;
    if (!records.length) {
        mood = 'think';
        speech = '아직 기록이 없어요. 병원 다녀오셨다면 <strong class="speech_em">결과지 사진</strong>부터 올려볼까요?';
    } else if (hPct === null) {
        mood = 'happy';
        speech = '키 기록을 추가하면 또래 친구들과 비교해 드릴게요!';
    } else {
        mood = hPct >= 50 ? 'wow' : 'happy';
        speech = '또래 친구 100명이 줄을 서면 ' + nameWith(child.name, '는') + ' 키 큰 순서로 <strong class="speech_em">앞에서 ' + Math.max(1, Math.round(100 - hPct)) + '번째</strong>쯤이에요!';
        if (prev) {
            speech += ' 지난번보다 <strong class="speech_em">' + (lh.height - prev.height).toFixed(1) + 'cm</strong> 컸어요.';
        }
    }
    $('[data-home-speech]').innerHTML = speech;
    $('[data-home-mascot]').src = MASCOT[mood];

    const stats = $('[data-stats]');
    if (!records.length) {
        stats.innerHTML = '';
    } else {
        const bmiCard = '<article class="stat stat-green"><h3 class="stat_head"><img src="resource/images/icons/icon-bmi.svg" class="stat_icon" alt="" width="20" height="20" loading="lazy">BMI (비만도)</h3>' +
            (bmiValue
                ? '<p class="stat_value">' + bmiValue.toFixed(1) + '</p>' + (bmiPct !== null ? '<p class="pill pill-' + bmiStatus(bmiPct).tone + '">' + bmiStatus(bmiPct).label + '</p>' : '')
                : '<p class="stat_empty">키·몸무게를 함께 기록하면 알려드려요</p>') + '</article>';
        const predCard = '<article class="stat stat-purple" data-tab-link="chart" tabindex="0" role="link" aria-label="예상 성인 키 자세히 보기"><h3 class="stat_head"><img src="resource/images/icons/icon-sparkles.svg" class="stat_icon" alt="" width="20" height="20" loading="lazy">예상 성인 키</h3>' +
            (pred
                ? '<p class="stat_value">' + pred.value.toFixed(0) + '<span class="stat_unit">cm</span></p><p class="stat_sub">' + pred.range[0].toFixed(0) + '~' + pred.range[1].toFixed(0) + 'cm 사이</p>'
                : '<p class="stat_empty">만 2세부터 예측할 수 있어요</p>') + '</article>';
        stats.innerHTML =
            statCard({ label: '키', icon: 'resource/images/icons/icon-ruler.svg', tone: 'blue', record: lh, value: lh && lh.height, unit: 'cm', pct: hPct }) +
            statCard({ label: '몸무게', icon: 'resource/images/icons/icon-weight.svg', tone: 'orange', record: lw, value: lw && lw.weight, unit: 'kg', pct: wPct }) +
            bmiCard + predCard;
        $$('[data-pct]', stats).forEach((dot) => {
            dot.style.left = dot.dataset.pct + '%';
        });
    }
    $('[data-home-chart-card]').hidden = !records.some((r) => r.height);
}

function renderChartPanel(child) {
    const records = recordsOf(child.id);
    $$('[data-metric]').forEach((btn) => btn.setAttribute('aria-pressed', String(btn.dataset.metric === chartMetric)));
    $('[data-weight-note]').hidden = chartMetric !== 'weight';

    const rows = records.filter((r) => valueOf(r, chartMetric)).reverse();
    $('[data-chart-table]').innerHTML = rows.length
        ? '<table class="table"><caption class="blind">' + METRIC_LABEL[chartMetric] + ' 측정값</caption><thead><tr><th class="table_th" scope="col">날짜</th><th class="table_th" scope="col">' + METRIC_LABEL[chartMetric] + '</th><th class="table_th" scope="col">백분위</th></tr></thead><tbody>' +
            rows.map((r) => {
                const v = valueOf(r, chartMetric);
                const age = ageInMonths(child.birth, r.date);
                const p = percentile(child.sex, chartMetric, age, v);
                return '<tr><td class="table_td">' + dotDate(r.date) + '<span class="table_sub">' + formatAge(age) + '</span></td>' +
                    '<td class="table_td table_td-num">' + v.toFixed(1) + METRIC_UNIT[chartMetric] + '</td>' +
                    '<td class="table_td table_td-num table_td-muted">' + (p === null ? '-' : p.toFixed(0) + '%') + '</td></tr>';
            }).join('') + '</tbody></table>'
        : '<p class="hint">아직 기록이 없어요.</p>';

    const lh = latestOf(records, 'height');
    const pred = lh ? predictAdultHeight(child.sex, ageInMonths(child.birth, lh.date), lh.height, child.fatherHeight, child.motherHeight) : null;
    const predictBox = $('[data-predict]');
    predictBox.hidden = !(chartMetric === 'height' && pred);
    if (pred) {
        predictBox.innerHTML =
            '<div class="speech"><img src="' + MASCOT.wow + '" class="speech_mascot speech_mascot-small" alt="" width="72" height="72" loading="lazy">' +
            '<p class="speech_bubble">지금처럼 자라면 어른이 됐을 때 <strong class="speech_em-purple">' + pred.value.toFixed(1) + 'cm</strong> 정도 될 것 같아요!</p></div>' +
            '<dl class="predict_list"><div class="predict_row"><dt>현재 백분위 유지 시</dt><dd class="predict_value">' + pred.byPercentile.toFixed(1) + 'cm</dd></div>' +
            '<div class="predict_row"><dt>부모 키 기준 (중간부모키)</dt><dd class="predict_value">' + (pred.midParental ? pred.midParental.toFixed(1) + 'cm' : '설정에서 입력') + '</dd></div></dl>' +
            '<p class="hint">통계적 추정이라 실제와 ±5cm 이상 다를 수 있어요.</p>';
    }
}

function renderRecords(child) {
    const records = recordsOf(child.id).reverse();
    const box = $('[data-records]');
    if (!records.length) {
        box.innerHTML = '<div class="empty"><img src="' + MASCOT.sleep + '" class="empty_mascot" alt="" width="120" height="120" loading="lazy"><p>아직 기록이 없어요.<br>홈에서 첫 기록을 추가해 보세요!</p></div>';
        return;
    }
    box.innerHTML = '<ul class="records">' + records.map((r) => {
        const thumb = r.thumb
            ? '<img src="' + r.thumb + '" class="record_thumb" alt="' + dotDate(r.date) + ' 기록지 사진" width="60" height="60" loading="lazy">'
            : '<span class="record_thumb record_thumb-empty"><img src="resource/images/icons/icon-pencil.svg" alt="" width="26" height="26" loading="lazy"></span>';
        return '<li class="record">' + thumb +
            '<button type="button" class="record_body" data-edit-record="' + r.id + '" aria-label="' + dotDate(r.date) + ' 기록 수정">' +
            '<span class="record_date">' + dotDate(r.date) + '<span class="record_age">' + formatAge(ageInMonths(child.birth, r.date)) + '</span></span>' +
            '<span class="record_values">' +
            (r.height ? '<span class="record_value"><img src="resource/images/icons/icon-ruler.svg" alt="키" width="16" height="16" loading="lazy">' + r.height + 'cm</span>' : '') +
            (r.weight ? '<span class="record_value"><img src="resource/images/icons/icon-weight.svg" alt="몸무게" width="16" height="16" loading="lazy">' + r.weight + 'kg</span>' : '') +
            '</span>' + (r.memo ? '<span class="record_memo">' + escapeHtml(r.memo) + '</span>' : '') + '</button>' +
            '<button type="button" class="icon-btn" aria-label="' + dotDate(r.date) + ' 기록 삭제" data-remove-record="' + r.id + '"><img src="resource/images/icons/icon-trash.svg" class="icon-btn_img" alt="" width="20" height="20" loading="lazy"></button></li>';
    }).join('') + '</ul>';
}

function sibBar(label, pct, value) {
    return '<div class="sibbar"><span class="sibbar_label">' + label + '</span>' +
        '<div class="sibbar_track" aria-hidden="true"><div class="sibbar_fill" data-fill="' + (pct === null ? 0 : Math.max(3, pct).toFixed(1)) + '"></div></div>' +
        '<span class="sibbar_value">' + (pct === null ? '-' : pct.toFixed(0) + '%') + '<span class="sibbar_sub">' + (value || '') + '</span></span></div>';
}

function renderFamily() {
    const box = $('[data-family]');
    if (state.children.length < 2) {
        box.innerHTML = '<div class="empty"><img src="' + MASCOT.think + '" class="empty_mascot" alt="" width="120" height="120" loading="lazy"><p>아이가 두 명 이상이면<br>같은 나이 때 성장을 나란히 비교해 드려요!</p><p class="hint">위쪽 + 버튼으로 아이를 추가하세요.</p></div>';
        return;
    }
    const cards = state.children.map((c) => {
        const recs = recordsOf(c.id);
        const lh = latestOf(recs, 'height');
        const lw = latestOf(recs, 'weight');
        const hp = lh ? percentile(c.sex, 'height', ageInMonths(c.birth, lh.date), lh.height) : null;
        const wp = lw ? percentile(c.sex, 'weight', ageInMonths(c.birth, lw.date), lw.weight) : null;
        return '<article class="card sib sib-color' + c.colorIndex + '"><div class="sib_head"><span class="sib_avatar" aria-hidden="true">' + c.avatar + '</span><div>' +
            '<h3 class="sib_name">' + escapeHtml(c.name) + '</h3><p class="sib_meta">' + formatAge(ageInMonths(c.birth, todayIso())) + ' · ' + (c.sex === 'M' ? '남아' : '여아') + '</p></div></div>' +
            sibBar('키', hp, lh ? lh.height + 'cm' : '') + sibBar('몸무게', wp, lw ? lw.weight + 'kg' : '') + '</article>';
    }).join('');
    box.innerHTML = '<div class="family"><div class="speech family_full"><img src="' + MASCOT.happy + '" class="speech_mascot speech_mascot-small" alt="" width="72" height="72" loading="lazy">' +
        '<p class="speech_bubble">백분위(%)로 비교하면 나이가 달라도 <strong class="speech_em">또래 대비 위치</strong>를 나란히 볼 수 있어요.</p></div>' +
        cards + sameAgeTable() + '</div>';
    $$('[data-fill]', box).forEach((bar) => {
        if (canAnimate()) {
            gsap.to(bar, { width: bar.dataset.fill + '%', duration: 0.8, ease: 'power2.out' });
        } else {
            bar.style.width = bar.dataset.fill + '%';
        }
    });
}

function sameAgeTable() {
    const ages = [12, 24, 36, 48, 60, 72, 84, 96, 108, 120];
    const nearest = (c, months) => {
        let best = null;
        let gap = 3; // ±3개월 이내 기록만
        recordsOf(c.id).forEach((r) => {
            const g = Math.abs(ageInMonths(c.birth, r.date) - months);
            if (r.height && g <= gap) {
                gap = g;
                best = r;
            }
        });
        return best;
    };
    const rows = ages.filter((m) => state.children.filter((c) => nearest(c, m)).length >= 2);
    if (!rows.length) {
        return '';
    }
    return '<article class="card family_full"><h3 class="card_title">같은 나이 때 키</h3><table class="table"><thead><tr><th class="table_th" scope="col">나이</th>' +
        state.children.map((c) => '<th class="table_th" scope="col">' + escapeHtml(c.name) + '</th>').join('') + '</tr></thead><tbody>' +
        rows.map((m) => '<tr><th class="table_td table_td-head" scope="row">' + formatAge(m) + '</th>' + state.children.map((c) => {
            const r = nearest(c, m);
            return '<td class="table_td table_td-num">' + (r ? r.height + 'cm' : '-') + '</td>';
        }).join('') + '</tr>').join('') + '</tbody></table></article>';
}

function renderSettings(child) {
    $('[data-settings-child-name]').textContent = child.avatar + ' ' + child.name;
    $('[data-settings-child-meta]').textContent = dotDate(child.birth) + ' 출생 · ' + (child.sex === 'M' ? '남아' : '여아') +
        (child.fatherHeight && child.motherHeight ? ' · 아빠 ' + child.fatherHeight + 'cm, 엄마 ' + child.motherHeight + 'cm' : '');
    $$('[data-ocr-engine]').forEach((input) => {
        input.checked = input.value === state.settings.ocrEngine;
    });
    $('[data-api-key-field]').hidden = state.settings.ocrEngine !== 'claude';
    const keyInput = $('[data-api-key]');
    if (document.activeElement !== keyInput) {
        keyInput.value = state.settings.claudeApiKey || '';
    }
}

/* ---------- 탭 ---------- */

function showTab(tab, moveFocus) {
    currentTab = tab;
    $$('[data-tab]').forEach((btn) => {
        const selected = btn.dataset.tab === tab;
        btn.setAttribute('aria-selected', String(selected));
        btn.tabIndex = selected ? 0 : -1;
        if (selected && moveFocus) {
            btn.focus();
        }
    });
    $$('[data-panel]').forEach((panel) => {
        const active = panel.dataset.panel === tab;
        panel.hidden = !active;
        panel.classList.toggle('panel-active', active);
    });
    drawVisibleCharts();
}

function switchTab(tab, moveFocus) {
    if (tab === currentTab) {
        return;
    }
    showTab(tab, moveFocus);
    window.scrollTo(0, 0);
    if (canAnimate()) {
        gsap.from('[data-panel="' + tab + '"] .card, [data-panel="' + tab + '"] .stat, [data-panel="' + tab + '"] .record', { y: 16, opacity: 0, duration: 0.35, stagger: 0.05, ease: 'power2.out', clearProps: 'all' });
    }
}

/* ---------- 그래프 (canvas) ---------- */

function niceStep(raw) {
    const p = Math.pow(10, Math.floor(Math.log10(raw || 1)));
    const n = raw / p;
    return (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10) * p;
}

function ticks(lo, hi, step) {
    const out = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) {
        out.push(Number(v.toFixed(2)));
    }
    return out;
}

function drawChart(canvas, child, records, metric) {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) {
        return;
    }
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);

    const W = rect.width;
    const H = rect.height;
    const pad = { l: 40, r: 30, t: 14, b: 30 };
    const pts = records
        .map((r) => ({ x: ageInMonths(child.birth, r.date), y: valueOf(r, metric) }))
        .filter((p) => p.y && p.x >= 0);

    const max = maxMonths(child.sex, metric);
    let x0 = pts.length ? Math.min.apply(null, pts.map((p) => p.x)) - 6 : 0;
    let x1 = pts.length ? Math.max.apply(null, pts.map((p) => p.x)) + 12 : 24;
    if (x1 - x0 < 24) {
        x1 = x0 + 24;
    }
    x0 = Math.max(0, Math.floor(x0));
    x1 = Math.min(max, Math.ceil(x1));
    if (pts.length && pts[pts.length - 1].x > max) {
        ctx.font = '600 14px Pretendard, sans-serif';
        ctx.fillStyle = '#6b6b6b';
        ctx.textAlign = 'center';
        ctx.fillText('이 나이는 비교 기준이 없어요', W / 2, H / 2);
        return;
    }

    const curves = {};
    const step = Math.max(0.5, (x1 - x0) / 100);
    PERCENTILE_LINES.forEach((p) => {
        const z = normInv(p / 100);
        curves[p] = [];
        for (let m = x0; m <= x1 + 1e-9; m += step) {
            curves[p].push([m, valueAtZ(child.sex, metric, Math.min(m, max), z)]);
        }
    });
    const ys = curves[3].map((c) => c[1]).concat(curves[97].map((c) => c[1]), pts.map((p) => p.y));
    const y0 = Math.floor(Math.min.apply(null, ys) * 0.97);
    const y1 = Math.ceil(Math.max.apply(null, ys) * 1.02);
    const sx = (m) => pad.l + ((m - x0) / (x1 - x0 || 1)) * (W - pad.l - pad.r);
    const sy = (v) => H - pad.b - ((v - y0) / (y1 - y0 || 1)) * (H - pad.t - pad.b);

    // 격자와 눈금
    ctx.font = '11px Pretendard, sans-serif';
    ctx.fillStyle = '#6b6b6b';
    ctx.strokeStyle = '#f1eadc';
    ctx.lineWidth = 1;
    ctx.textAlign = 'right';
    ticks(y0, y1, niceStep((y1 - y0) / 5)).forEach((v) => {
        ctx.beginPath();
        ctx.moveTo(pad.l, sy(v));
        ctx.lineTo(W - pad.r, sy(v));
        ctx.stroke();
        ctx.fillText(String(v), pad.l - 6, sy(v) + 4);
    });
    ctx.textAlign = 'center';
    ticks(x0, x1, x1 - x0 > 120 ? 24 : x1 - x0 > 24 ? 12 : 3).forEach((m) => {
        ctx.fillText(m > 0 && m % 12 === 0 ? m / 12 + '세' : m + '개월', sx(m), H - 10);
    });

    // 백분위 띠
    [[3, 97, '#e9f7dc'], [10, 90, '#d4f0bb'], [25, 75, '#bfe79a']].forEach((band) => {
        ctx.beginPath();
        curves[band[1]].forEach((c, i) => (i ? ctx.lineTo(sx(c[0]), sy(c[1])) : ctx.moveTo(sx(c[0]), sy(c[1]))));
        curves[band[0]].slice().reverse().forEach((c) => ctx.lineTo(sx(c[0]), sy(c[1])));
        ctx.closePath();
        ctx.fillStyle = band[2];
        ctx.fill();
    });

    // 50 백분위 점선
    ctx.beginPath();
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = '#2b7a0b';
    ctx.lineWidth = 2;
    curves[50].forEach((c, i) => (i ? ctx.lineTo(sx(c[0]), sy(c[1])) : ctx.moveTo(sx(c[0]), sy(c[1]))));
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.font = '600 11px Pretendard, sans-serif';
    ctx.fillStyle = '#6b6b6b';
    ctx.textAlign = 'left';
    [3, 50, 97].forEach((p) => {
        const last = curves[p][curves[p].length - 1];
        ctx.fillText(String(p), W - pad.r + 4, sy(last[1]) + 4);
    });

    // 아이 기록
    const color = KID_COLORS[child.colorIndex - 1];
    if (pts.length > 1) {
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        pts.forEach((p, i) => (i ? ctx.lineTo(sx(p.x), sy(p.y)) : ctx.moveTo(sx(p.x), sy(p.y))));
        ctx.stroke();
    }
    pts.forEach((p, i) => {
        ctx.beginPath();
        ctx.arc(sx(p.x), sy(p.y), i === pts.length - 1 ? 7 : 5, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
    });

    const last = pts[pts.length - 1];
    const lastPct = last ? percentile(child.sex, metric, last.x, last.y) : null;
    canvas.setAttribute('aria-label', child.name + ' ' + METRIC_LABEL[metric] + ' 성장 그래프. 기록 ' + pts.length + '개' +
        (lastPct !== null ? ', 최근 ' + lastPct.toFixed(0) + '백분위' : ''));
}

function drawVisibleCharts() {
    const child = activeChild();
    if (!child) {
        return;
    }
    const records = recordsOf(child.id);
    $$('[data-chart]').forEach((canvas) => {
        if (canvas.offsetParent !== null) {
            drawChart(canvas, child, records, canvas.dataset.chart === 'home' ? 'height' : chartMetric);
        }
    });
}

/* ---------- 시트 (모달) ---------- */

function openSheet(name) {
    const sheet = $('[data-sheet="' + name + '"]');
    lastFocus = document.activeElement;
    sheet.classList.add('sheet-open');
    document.body.style.overflow = 'hidden';
    if (canAnimate()) {
        gsap.fromTo($('.sheet_dim', sheet), { opacity: 0 }, { opacity: 1, duration: 0.2 });
        gsap.fromTo($('[data-sheet-panel]', sheet), { y: 60, opacity: 0 }, { y: 0, opacity: 1, duration: 0.35, ease: 'back.out(1.4)' });
    }
    focusFirst(sheet);
}

function closeSheet() {
    const sheet = $('.sheet-open');
    if (!sheet) {
        return;
    }
    batchRun += 1;
    batchBusy = false;
    sheet.classList.remove('sheet-open');
    document.body.style.overflow = '';
    if (lastFocus && document.contains(lastFocus)) {
        lastFocus.focus();
    }
}

function focusables(root) {
    return $$('button, [href], input, select, textarea, summary, [tabindex]:not([tabindex="-1"])', root)
        .filter((el) => !el.disabled && el.offsetParent !== null);
}

function focusFirst(root) {
    const list = focusables(root);
    const target = list.find((el) => !el.hasAttribute('data-close-sheet')) || list[0] || $('.sheet-open [data-close-sheet].sheet_close');
    if (target) {
        target.focus();
    }
}

function trapFocus(event) {
    const sheet = $('.sheet-open');
    if (!sheet || event.key !== 'Tab') {
        return;
    }
    const list = focusables(sheet);
    const first = list[0];
    const last = list[list.length - 1];
    if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
    }
}

/* ---------- 아이 정보 폼 ---------- */

function mountChildForm(slot, child, isOnboarding) {
    slot.innerHTML = '';
    slot.appendChild($('[data-child-form-template]').content.cloneNode(true));
    const form = $('[data-child-form]', slot);
    form.dataset.childId = child ? child.id : '';
    $('[data-child-field="name"]', form).value = child ? child.name : '';
    $('[data-child-field="birth"]', form).value = child ? child.birth : '';
    $('[data-child-field="birth"]', form).max = todayIso();
    $('[data-child-field="father"]', form).value = child && child.fatherHeight ? child.fatherHeight : '';
    $('[data-child-field="mother"]', form).value = child && child.motherHeight ? child.motherHeight : '';
    const sex = child ? child.sex : 'M';
    $$('[data-sex]', form).forEach((btn) => btn.setAttribute('aria-pressed', String(btn.dataset.sex === sex)));
    const avatar = child ? child.avatar : AVATARS[state.children.length % AVATARS.length];
    $('[data-avatar-list]', form).innerHTML = AVATARS.map((a) =>
        '<button type="button" class="chip" aria-pressed="' + (a === avatar) + '" aria-label="캐릭터 ' + a + '" data-avatar="' + a + '">' + a + '</button>').join('');
    const colorIndex = child ? child.colorIndex : (state.children.length % KID_COLORS.length) + 1;
    $('[data-color-list]', form).innerHTML = KID_COLORS.map((c, i) =>
        '<button type="button" class="swatch swatch-color' + (i + 1) + '" aria-pressed="' + (i + 1 === colorIndex) + '" aria-label="색상 ' + (i + 1) + '" data-color="' + (i + 1) + '"></button>').join('');
    $('[data-cancel]', form).hidden = isOnboarding;
    $('[data-child-submit]', form).textContent = child ? '저장하기' : isOnboarding ? '시작하기' : '추가하기';
}

function pressInGroup(button, attr) {
    $$('[' + attr + ']', button.parentElement).forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
}

function submitChildForm(form) {
    const name = $('[data-child-field="name"]', form).value.trim();
    const birth = $('[data-child-field="birth"]', form).value;
    const error = $('[data-child-error]', form);
    if (!name || !birth) {
        error.textContent = !name ? '이름을 입력해 주세요.' : '생년월일을 입력해 주세요.';
        return;
    }
    if (birth > todayIso()) {
        error.textContent = '생년월일이 오늘보다 늦어요.';
        return;
    }
    const existingId = form.dataset.childId;
    const child = {
        id: existingId || uid(),
        name: name,
        birth: birth,
        sex: $('[data-sex][aria-pressed="true"]', form).dataset.sex,
        avatar: $('[data-avatar][aria-pressed="true"]', form).dataset.avatar,
        colorIndex: Number($('[data-color][aria-pressed="true"]', form).dataset.color),
        fatherHeight: Number($('[data-child-field="father"]', form).value) || null,
        motherHeight: Number($('[data-child-field="mother"]', form).value) || null
    };
    closeSheet();
    update((s) => {
        const index = s.children.findIndex((c) => c.id === child.id);
        if (index >= 0) {
            s.children[index] = child;
        } else {
            s.children.push(child);
        }
        s.activeChildId = child.id;
    });
    if (!existingId) {
        switchTab('home');
        showToast(child.name + ' 등록 완료!');
    }
}

/* ---------- 기록 시트 ---------- */

function setStep(step) {
    $$('[data-step]').forEach((el) => el.classList.toggle('sheet_step-active', el.dataset.step === step));
    const sheet = $('[data-sheet="record"]');
    if (sheet.classList.contains('sheet-open')) {
        focusFirst($('[data-step="' + step + '"]'));
    }
}

function openRecordSheet(mode, record) {
    const child = activeChild();
    recordDraft = { mode: mode, id: record ? record.id : null, source: record ? record.source : mode, thumb: record ? record.thumb : null, ocr: null };
    const form = $('[data-record-form]');
    form.reset();
    $('[data-field="date"]').value = record ? record.date : todayIso();
    $('[data-field="date"]').min = child.birth;
    $('[data-field="date"]').max = todayIso();
    $('[data-field="height"]').value = record && record.height ? record.height : '';
    $('[data-field="weight"]').value = record && record.weight ? record.weight : '';
    $('[data-field="memo"]').value = record && record.memo ? record.memo : '';
    $('[data-record-error]').textContent = '';
    $('[data-confirm-img]').hidden = true;
    $('[data-raw-wrap]').hidden = true;
    $$('[data-tag]').forEach((t) => {
        t.innerHTML = '';
    });
    $('[data-retake]').hidden = mode !== 'photo';
    $('[data-confirm-speech]').hidden = true;
    $('[data-privacy-tip]').textContent = state.settings.ocrEngine === 'claude' && state.settings.claudeApiKey
        ? '사진은 Claude(Anthropic)로 보내 인식하고, 작은 썸네일만 저장돼요'
        : '사진은 이 기기 안에서만 인식하고, 작은 썸네일만 저장돼요';
    if (record && record.thumb) {
        $('[data-confirm-img]').src = record.thumb;
        $('[data-confirm-img]').hidden = false;
    }
    setStep(mode === 'photo' && !record ? 'pick' : 'confirm');
    openSheet('record');
}

function setConfirmMessage(mood, html) {
    $('[data-confirm-speech]').hidden = false;
    $('[data-confirm-mascot]').src = MASCOT[mood];
    $('[data-confirm-message]').innerHTML = html;
}

function setProgress(value) {
    const pct = Math.round(Math.max(0.06, value) * 100);
    $('[data-progress-bar]').style.width = pct + '%';
    $('[data-progress]').setAttribute('aria-valuenow', String(pct));
}

/** 사진 한 장 → 썸네일, 사진 찍은 날, 인식 결과 */
async function analyzePhoto(file, onProgress) {
    const thumb = await resizeImage(file, 240, 0.6);
    const photoDate = await photoDateOf(file);
    const useClaude = state.settings.ocrEngine === 'claude' && state.settings.claudeApiKey;
    const result = useClaude ? await recognizeWithClaude(file, state.settings.claudeApiKey) : await recognizeOnDevice(file, onProgress);
    return { thumb: thumb, photoDate: photoDate, result: result };
}

/** 측정일 고르기: 종이에 인쇄된 검진일 > 사진 찍은 날 */
function pickMeasureDate(result, photoDate) {
    const child = activeChild();
    const valid = (d) => d && d >= child.birth && d <= todayIso();
    if (valid(result.date)) {
        return { date: result.date, label: '자동 인식' };
    }
    if (valid(photoDate)) {
        return { date: photoDate, label: '사진 찍은 날' };
    }
    return { date: '', label: '' };
}

async function handlePhoto(file) {
    if (!file) {
        return;
    }
    $('[data-reading-img]').hidden = true;
    setStep('reading');
    setProgress(0);
    let scanTween = null;
    if (canAnimate()) {
        scanTween = gsap.fromTo('[data-scan]', { y: 0 }, { y: 200, duration: 1.4, repeat: -1, yoyo: true, ease: 'sine.inOut' });
    }
    let errorMessage = '';
    try {
        const preview = await resizeImage(file, 900, 0.8);
        $('[data-reading-img]').src = preview;
        $('[data-reading-img]').hidden = false;
        $('[data-confirm-img]').src = preview;
        $('[data-confirm-img]').hidden = false;
        const analyzed = await analyzePhoto(file, setProgress);
        const result = analyzed.result;
        recordDraft.thumb = analyzed.thumb;
        recordDraft.ocr = result;
        const picked = pickMeasureDate(result, analyzed.photoDate);
        if (picked.date) {
            $('[data-field="date"]').value = picked.date;
        }
        if (result.height) {
            $('[data-field="height"]').value = result.height;
        }
        if (result.weight) {
            $('[data-field="weight"]').value = result.weight;
        }
        ['height', 'weight'].forEach((key) => {
            const level = result.confidence[key];
            $('[data-tag="' + key + '"]').innerHTML = level === 'none' ? '' : '<span class="tag tag-' + level + '">' + (level === 'high' ? '자동 인식' : '확인 필요') + '</span>';
        });
        $('[data-tag="date"]').innerHTML = picked.label ? '<span class="tag tag-high">' + picked.label + '</span>' : '';
        if (result.rawText) {
            $('[data-raw]').textContent = result.rawText.trim();
            $('[data-raw-wrap]').hidden = false;
        }
    } catch (error) {
        errorMessage = error && error.message ? error.message : String(error);
    }
    releaseOcrWorker();
    if (scanTween) {
        scanTween.kill();
    }
    const found = recordDraft.ocr && (recordDraft.ocr.height || recordDraft.ocr.weight);
    if (errorMessage) {
        setConfirmMessage('think', '앗, 사진을 읽지 못했어요. 아래에 직접 입력해 주시겠어요?<br><small>' + escapeHtml(errorMessage) + '</small>');
    } else if (found) {
        setConfirmMessage('happy', '찾았어요! 숫자가 맞는지 <strong class="speech_em">한 번만 확인</strong>해 주세요.');
    } else {
        setConfirmMessage('think', '숫자를 잘 못 찾았어요. 아래에 직접 적어주세요!');
    }
    setStep('confirm');
}

/* ---------- 여러 장 한 번에 등록 ---------- */

const MAX_BATCH = 30;
let batchItems = [];
let batchRun = 0; // 시트를 닫거나 새로 시작하면 바뀌어서 진행 중인 인식을 멈춤
let batchBusy = false;

function parseAmount(text) {
    return Number(String(text).replace(',', '.'));
}

function batchItemValid(item) {
    const child = activeChild();
    const h = parseAmount(item.height);
    const w = parseAmount(item.weight);
    const okDate = item.date && item.date >= child.birth && item.date <= todayIso();
    return Boolean(okDate && ((h > 30 && h < 220) || (w > 1 && w < 200)));
}

function batchDuplicate(item) {
    const child = activeChild();
    return state.records.some((r) => r.childId === child.id && r.date === item.date);
}

function batchStatusText(item) {
    if (item.status === 'waiting') {
        return '기다리는 중';
    }
    if (item.status === 'reading') {
        return '읽는 중…';
    }
    if (item.date && batchDuplicate(item)) {
        return '같은 날 기록이 이미 있어요';
    }
    if (!item.date) {
        return '측정일을 넣어주세요';
    }
    if (!item.found) {
        if (batchItemValid(item)) {
            return '직접 입력';
        }
        return item.status === 'error' ? '읽지 못했어요 · 직접 입력' : '숫자를 못 찾았어요 · 직접 입력';
    }
    const dateFrom = item.label === '사진 찍은 날' ? '사진 찍은 날' : '결과지 날짜';
    return dateFrom + ' · 숫자 자동 인식';
}

/** 저장 전에 손봐야 하는 상태면 빨간 글씨 */
function batchStatusIsError(item) {
    if (item.status === 'waiting' || item.status === 'reading') {
        return false;
    }
    return !item.date || batchDuplicate(item) || !batchItemValid(item);
}

function renderBatchItem(index) {
    const item = batchItems[index];
    const li = $('[data-batch-index="' + index + '"]');
    const busy = item.status === 'waiting' || item.status === 'reading';
    const child = activeChild();
    const statusError = batchStatusIsError(item);
    li.classList.toggle('batch_item-off', !item.include);
    li.innerHTML =
        '<img src="' + (item.thumb || 'resource/images/favicon.svg') + '" class="batch_thumb" alt="' + (index + 1) + '번째 사진" width="64" height="64" loading="lazy">' +
        '<div class="batch_body"><div class="batch_head">' +
        '<label class="batch_check"><input type="checkbox" class="batch_checkbox" data-batch-check' + (item.include ? ' checked' : '') + (busy ? ' disabled' : '') + '>저장</label>' +
        '<span class="batch_status' + (statusError ? ' batch_status-error' : '') + '" data-batch-status>' + batchStatusText(item) + '</span></div>' +
        '<div class="batch_fields">' +
        '<label class="batch_label batch_label-date">측정일<input type="date" class="batch_input" data-batch-field="date" value="' + item.date + '" min="' + child.birth + '" max="' + todayIso() + '"' + (busy ? ' disabled' : '') + '></label>' +
        '<label class="batch_label">키 (cm)<input type="text" class="batch_input" inputmode="decimal" placeholder="0.0" data-batch-field="height" value="' + escapeHtml(item.height) + '"' + (busy ? ' disabled' : '') + '></label>' +
        '<label class="batch_label">몸무게 (kg)<input type="text" class="batch_input" inputmode="decimal" placeholder="0.0" data-batch-field="weight" value="' + escapeHtml(item.weight) + '"' + (busy ? ' disabled' : '') + '></label>' +
        '</div></div>';
}

function updateBatchSummary() {
    const count = batchItems.filter((item) => item.include).length;
    const button = $('[data-batch-save]');
    button.disabled = batchBusy || count === 0;
    button.textContent = count ? count + '개 저장하기' : '저장하기';
}

function setBatchProgress(value) {
    const pct = Math.round(Math.max(0.03, Math.min(1, value)) * 100);
    $('[data-batch-progress-bar]').style.width = pct + '%';
    $('[data-batch-progress]').setAttribute('aria-valuenow', String(pct));
}

function setBatchMessage(mood, html) {
    $('[data-batch-mascot]').src = MASCOT[mood];
    $('[data-batch-message]').innerHTML = html;
}

async function handlePhotos(fileList) {
    const files = Array.from(fileList).slice(0, MAX_BATCH);
    batchRun += 1;
    const run = batchRun;
    batchBusy = true;
    batchItems = files.map(() => ({ status: 'waiting', include: false, touched: false, found: false, date: '', height: '', weight: '', thumb: null, label: '' }));
    $('[data-batch-list]').innerHTML = files.map((f, i) => '<li class="batch_item" data-batch-index="' + i + '"></li>').join('');
    batchItems.forEach((item, i) => renderBatchItem(i));
    $('[data-batch-error]').textContent = '';
    $('[data-batch-progress]').hidden = false;
    setBatchProgress(0);
    setBatchMessage('think', '사진 <strong class="speech_em">' + files.length + '장</strong>을 차례대로 읽을게요. 조금만 기다려 주세요!');
    updateBatchSummary();
    setStep('batch');
    if (fileList.length > MAX_BATCH) {
        showToast('한 번에 ' + MAX_BATCH + '장까지 읽을 수 있어요. 앞의 ' + MAX_BATCH + '장만 읽을게요.');
    }

    for (let i = 0; i < files.length; i += 1) {
        if (run !== batchRun) {
            break;
        }
        const item = batchItems[i];
        item.status = 'reading';
        renderBatchItem(i);
        setBatchMessage('think', '사진을 읽는 중이에요… <strong class="speech_em">' + (i + 1) + ' / ' + files.length + '</strong>');
        try {
            const analyzed = await analyzePhoto(files[i], (p) => setBatchProgress((i + p) / files.length));
            if (run !== batchRun) {
                break;
            }
            const picked = pickMeasureDate(analyzed.result, analyzed.photoDate);
            item.thumb = analyzed.thumb;
            item.date = picked.date;
            item.label = picked.label;
            item.height = analyzed.result.height ? String(analyzed.result.height) : '';
            item.weight = analyzed.result.weight ? String(analyzed.result.weight) : '';
            item.found = Boolean(analyzed.result.height || analyzed.result.weight);
            item.status = 'done';
        } catch (error) {
            if (run !== batchRun) {
                break;
            }
            item.thumb = item.thumb || (await resizeImage(files[i], 240, 0.6).catch(() => null));
            item.status = 'error';
        }
        // 숫자를 찾았고 날짜가 있고 이미 같은 날 기록이 없으면 저장 대상으로 체크
        item.include = item.found && batchItemValid(item) && !batchDuplicate(item);
        renderBatchItem(i);
        setBatchProgress((i + 1) / files.length);
        updateBatchSummary();
    }
    await releaseOcrWorker();
    if (run !== batchRun) {
        return;
    }
    batchBusy = false;
    $('[data-batch-progress]').hidden = true;
    const ready = batchItems.filter((item) => item.include).length;
    const missing = batchItems.length - ready;
    setBatchMessage(ready ? 'happy' : 'think',
        '다 읽었어요! <strong class="speech_em">' + ready + '장</strong>은 바로 저장할 수 있어요.' +
        (missing ? ' 체크가 빠진 ' + missing + '장은 숫자를 확인하거나 직접 넣어주세요.' : ' 숫자만 한 번 훑어봐 주세요.'));
    updateBatchSummary();
}

function handleBatchInput(input) {
    const li = input.closest('[data-batch-index]');
    const index = Number(li.dataset.batchIndex);
    const item = batchItems[index];
    item[input.dataset.batchField] = input.value.trim();
    // 사용자가 체크를 직접 바꾼 적이 없으면, 값이 맞춰지는 대로 자동으로 체크
    if (!item.touched) {
        item.include = batchItemValid(item) && !batchDuplicate(item);
        $('[data-batch-check]', li).checked = item.include;
        li.classList.toggle('batch_item-off', !item.include);
    }
    const status = $('[data-batch-status]', li);
    status.textContent = batchStatusText(item);
    status.classList.toggle('batch_status-error', batchStatusIsError(item));
    updateBatchSummary();
}

function handleBatchCheck(checkbox) {
    const li = checkbox.closest('[data-batch-index]');
    const item = batchItems[Number(li.dataset.batchIndex)];
    item.include = checkbox.checked;
    item.touched = true;
    li.classList.toggle('batch_item-off', !item.include);
    updateBatchSummary();
}

function saveBatch() {
    const child = activeChild();
    const chosen = batchItems.filter((item) => item.include);
    const invalid = chosen.filter((item) => !batchItemValid(item));
    if (invalid.length) {
        $('[data-batch-error]').textContent = '체크한 사진 중 ' + invalid.length + '장은 측정일이나 숫자가 비어 있거나 범위를 벗어났어요.';
        return;
    }
    const records = chosen.map((item) => {
        const h = parseAmount(item.height);
        const w = parseAmount(item.weight);
        return {
            id: uid(),
            childId: child.id,
            date: item.date,
            height: h > 30 && h < 220 ? h : null,
            weight: w > 1 && w < 200 ? w : null,
            memo: null,
            source: 'photo',
            thumb: item.thumb
        };
    });
    closeSheet();
    update((s) => {
        s.records = s.records.concat(records);
    });
    switchTab('home');
    showToast(records.length + '개 기록했어요! 🎉');
}

function submitRecordForm() {
    const child = activeChild();
    const date = $('[data-field="date"]').value;
    const height = Number($('[data-field="height"]').value.replace(',', '.'));
    const weight = Number($('[data-field="weight"]').value.replace(',', '.'));
    const error = $('[data-record-error]');
    const okHeight = height > 30 && height < 220;
    const okWeight = weight > 1 && weight < 200;
    if (!date || date < child.birth || date > todayIso()) {
        error.textContent = '측정일을 확인해 주세요. (생년월일 ~ 오늘)';
        return;
    }
    if (!okHeight && !okWeight) {
        error.textContent = '키(30~220cm)나 몸무게(1~200kg) 중 하나는 입력해 주세요.';
        return;
    }
    const record = {
        id: recordDraft.id || uid(),
        childId: child.id,
        date: date,
        height: okHeight ? height : null,
        weight: okWeight ? weight : null,
        memo: $('[data-field="memo"]').value.trim() || null,
        source: recordDraft.source,
        thumb: recordDraft.thumb || null
    };
    closeSheet();
    update((s) => {
        const index = s.records.findIndex((r) => r.id === record.id);
        if (index >= 0) {
            s.records[index] = record;
        } else {
            s.records.push(record);
        }
    });
    switchTab('home');
    showToast('기록했어요! 🎉');
}

/* ---------- 사진 인식 ---------- */

function loadImage(file) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            URL.revokeObjectURL(url);
            resolve(img);
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('사진 파일을 열 수 없어요.'));
        };
        img.src = url;
    });
}

/** 긴 변을 maxSide 픽셀로 줄인 JPEG data URL */
async function resizeImage(file, maxSide, quality) {
    const img = await loadImage(file);
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', quality);
}

/** 흑백 + 대비 강화, 작은 사진은 확대 (Tesseract는 글자 높이 20px 이상에서 잘 읽음) */
async function prepareForOcr(file) {
    const img = await loadImage(file);
    const long = Math.max(img.naturalWidth, img.naturalHeight);
    const scale = long < 1600 ? 1600 / long : long > 2400 ? 2400 / long : 1;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext('2d');
    ctx.filter = 'grayscale(1) contrast(1.35)';
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
}

const scriptCache = {};

function loadScript(src) {
    if (!scriptCache[src]) {
        scriptCache[src] = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = () => {
                delete scriptCache[src];
                reject(new Error('글자 인식 도구를 불러오지 못했어요. 인터넷 연결을 확인해 주세요.'));
            };
            document.head.appendChild(script);
        });
    }
    return scriptCache[src];
}

/** 사진 → 픽셀 데이터 (긴 변 maxSide) */
async function imageDataOf(file, maxSide) {
    const img = await loadImage(file);
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

/** 사진 찍은 날 (EXIF). 없거나 읽을 수 없으면 null */
async function photoDateOf(file) {
    try {
        return readExifDate(await file.slice(0, 262144).arrayBuffer());
    } catch (error) {
        return null;
    }
}

/**
 * 기기 안에서 인식.
 * 1) 신장·체중 측정기의 LED 숫자 화면이면 바로 판독 (빠름)
 * 2) 아니면 Tesseract.js(한국어+영어)로 글자를 읽음 — 결과지는 표가 많아 '한 단(4)'과 '흩어진 글자(11)' 두 방식으로 읽고 합침
 */
async function recognizeOnDevice(file, onProgress) {
    const led = readLedMeasurement(await imageDataOf(file, 900));
    const ledText = led.ledRows.length ? 'LED 화면 판독: ' + led.ledRows.map((r) => r.value).join(' / ') : '';
    if (led.height !== null && led.weight !== null) {
        onProgress(1);
        return Object.assign(led, { rawText: ledText });
    }
    const worker = await getOcrWorker();
    let pass = 0;
    ocrProgress = (p) => onProgress((pass + p) / 2);
    try {
        const image = await prepareForOcr(file);
        const texts = [];
        let parsed = null;
        for (const psm of ['4', '11']) {
            await worker.setParameters({ tessedit_pageseg_mode: psm });
            const result = await worker.recognize(image);
            texts.push(result.data.text);
            const p = parseMeasurement(result.data.text);
            parsed = parsed ? mergeParsed(parsed, p) : p;
            pass += 1;
            if (isComplete(parsed)) {
                break;
            }
        }
        onProgress(1);
        // LED에서 찾은 값이 있으면 그것을 우선
        return Object.assign(mergeParsed(led, parsed), { rawText: [ledText].concat(texts).filter(Boolean).join('\n---\n') });
    } finally {
        ocrProgress = () => {};
    }
}

/* 글자 인식 엔진은 띄우는 데 시간이 걸려서, 여러 장을 읽는 동안은 하나를 재사용하고 끝나면 닫음 */
let ocrWorker = null;
let ocrProgress = () => {};

async function getOcrWorker() {
    if (!ocrWorker) {
        await loadScript(TESSERACT_URL);
        ocrWorker = Tesseract.createWorker(['kor', 'eng'], 1, {
            logger: (m) => {
                if (m.status === 'recognizing text') {
                    ocrProgress(m.progress);
                }
            }
        });
        ocrWorker.catch(() => {
            ocrWorker = null;
        });
    }
    return ocrWorker;
}

async function releaseOcrWorker() {
    if (!ocrWorker) {
        return;
    }
    const pending = ocrWorker;
    ocrWorker = null;
    try {
        await (await pending).terminate();
    } catch (error) {
        // 이미 종료됐거나 만들다 실패한 경우
    }
}

/** Claude 비전으로 인식 (손글씨·기울어진 사진에 강함). 사용자의 API 키로 직접 호출 */
async function recognizeWithClaude(file, apiKey) {
    const nullable = (type, description) => ({ anyOf: [{ type: type }, { type: 'null' }], description: description });
    const dataUrl = await resizeImage(file, 1568, 0.85);
    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-beta': 'server-side-fallback-2026-07-01',
            'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
            model: CLAUDE_MODEL,
            max_tokens: 2000,
            fallbacks: 'default',
            output_config: {
                effort: 'low',
                format: {
                    type: 'json_schema',
                    schema: {
                        type: 'object',
                        properties: {
                            date: nullable('string', '측정일 YYYY-MM-DD. 생년월일·발급일이 아닌 측정/검진일'),
                            height_cm: nullable('number', '키(신장) cm'),
                            weight_kg: nullable('number', '몸무게(체중) kg')
                        },
                        required: ['date', 'height_cm', 'weight_kg'],
                        additionalProperties: false
                    }
                }
            },
            messages: [{
                role: 'user',
                content: [
                    { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: dataUrl.split(',')[1] } },
                    {
                        type: 'text',
                        text: '아이의 병원·보건소 기록(영유아건강검진 결과지, 진료 기록, 신장계 출력물 등) 사진입니다. ' +
                            '아이의 측정일, 키(cm), 몸무게(kg)를 찾아주세요. 백분위수나 표준 범위 숫자가 아니라 실제 측정값만 적고, ' +
                            '보이지 않거나 확실하지 않은 값은 null로 두세요.'
                    }
                ]
            }]
        })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(response.status === 401 ? 'API 키를 확인해 주세요.' : (body.error && body.error.message) || '인식 서버 오류 (' + response.status + ')');
    }
    if (body.stop_reason === 'refusal') {
        throw new Error('이 사진은 인식할 수 없어요.');
    }
    const textBlock = (body.content || []).find((b) => b.type === 'text');
    const out = textBlock ? JSON.parse(textBlock.text) : null;
    if (!out) {
        throw new Error('인식 결과를 읽지 못했어요.');
    }
    const level = (v) => (v === null || v === undefined ? 'none' : 'high');
    return {
        date: out.date,
        height: out.height_cm,
        weight: out.weight_kg,
        confidence: { date: level(out.date), height: level(out.height_cm), weight: level(out.weight_kg) }
    };
}

/* ---------- 토스트 ---------- */

let toastTimer = null;

function showToast(message) {
    const toast = $('[data-toast]');
    toast.textContent = message;
    clearTimeout(toastTimer);
    if (canAnimate()) {
        gsap.killTweensOf(toast);
        gsap.fromTo(toast, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.25 });
        gsap.to(toast, { opacity: 0, delay: 2.2, duration: 0.3 });
    } else {
        toast.style.opacity = '1';
        toastTimer = setTimeout(() => {
            toast.style.opacity = '0';
        }, 2500);
    }
}

/* ---------- 백업 ---------- */

function exportBackup() {
    const data = Object.assign({}, state, { settings: Object.assign({}, state.settings, { claudeApiKey: '' }) });
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'kirin-backup-' + todayIso() + '.json';
    link.click();
    URL.revokeObjectURL(link.href);
}

async function importBackup(file) {
    try {
        const data = JSON.parse(await file.text());
        if (!Array.isArray(data.children) || !Array.isArray(data.records)) {
            throw new Error('형식 오류');
        }
        if (window.confirm('지금 기록을 백업 파일 내용으로 바꿀까요?')) {
            const apiKey = state.settings.claudeApiKey;
            update((s) => {
                s.children = data.children;
                s.records = data.records;
                s.activeChildId = data.activeChildId || (data.children[0] && data.children[0].id) || null;
                s.settings = Object.assign({ ocrEngine: 'device' }, data.settings, { claudeApiKey: apiKey });
            });
            showToast('백업을 불러왔어요.');
        }
    } catch (error) {
        window.alert('백업 파일을 읽지 못했어요.');
    }
}

/* ---------- 이벤트 ---------- */

function handleClick(event) {
    const target = event.target.closest('[data-tab], [data-tab-link], [data-select-child], [data-add-child], [data-open-record], [data-close-sheet], [data-metric], [data-sex], [data-avatar], [data-color], [data-edit-record], [data-remove-record], [data-retake], [data-edit-child], [data-remove-child], [data-export], [data-batch-save]');
    if (!target) {
        return;
    }
    const data = target.dataset;
    if (data.tab) {
        switchTab(data.tab);
    } else if (data.tabLink) {
        event.preventDefault();
        switchTab(data.tabLink);
    } else if (data.selectChild) {
        update((s) => {
            s.activeChildId = data.selectChild;
        });
    } else if (target.hasAttribute('data-add-child')) {
        $('[data-child-sheet-title]').textContent = '아이 추가하기';
        mountChildForm($('[data-child-form-slot="sheet"]'), null, false);
        openSheet('child');
    } else if (data.openRecord) {
        openRecordSheet(data.openRecord, null);
    } else if (target.hasAttribute('data-close-sheet')) {
        closeSheet();
    } else if (data.metric) {
        chartMetric = data.metric;
        renderChartPanel(activeChild());
        drawVisibleCharts();
    } else if (data.sex) {
        pressInGroup(target, 'data-sex');
    } else if (data.avatar) {
        pressInGroup(target, 'data-avatar');
    } else if (data.color) {
        pressInGroup(target, 'data-color');
    } else if (data.editRecord) {
        openRecordSheet('manual', state.records.find((r) => r.id === data.editRecord));
    } else if (data.removeRecord) {
        if (window.confirm('이 기록을 지울까요?')) {
            update((s) => {
                s.records = s.records.filter((r) => r.id !== data.removeRecord);
            });
            showToast('기록을 지웠어요.');
        }
    } else if (target.hasAttribute('data-retake')) {
        setStep('pick');
    } else if (target.hasAttribute('data-edit-child')) {
        $('[data-child-sheet-title]').textContent = '아이 정보 수정';
        mountChildForm($('[data-child-form-slot="sheet"]'), activeChild(), false);
        openSheet('child');
    } else if (target.hasAttribute('data-remove-child')) {
        const child = activeChild();
        if (window.confirm(child.name + '의 모든 기록이 지워져요. 계속할까요?')) {
            update((s) => {
                s.children = s.children.filter((c) => c.id !== child.id);
                s.records = s.records.filter((r) => r.childId !== child.id);
                s.activeChildId = s.children[0] ? s.children[0].id : null;
            });
        }
    } else if (target.hasAttribute('data-export')) {
        exportBackup();
    } else if (target.hasAttribute('data-batch-save')) {
        saveBatch();
    }
}

function handleInput(event) {
    if (event.target.hasAttribute('data-batch-field')) {
        handleBatchInput(event.target);
    }
}

function handleChange(event) {
    const target = event.target;
    if (target.hasAttribute('data-photo-input')) {
        const files = Array.from(target.files);
        target.value = '';
        if (files.length > 1) {
            handlePhotos(files);
        } else {
            handlePhoto(files[0]);
        }
    } else if (target.hasAttribute('data-batch-check')) {
        handleBatchCheck(target);
    } else if (target.hasAttribute('data-ocr-engine')) {
        update((s) => {
            s.settings.ocrEngine = target.value;
        });
    } else if (target.hasAttribute('data-import')) {
        const file = target.files[0];
        target.value = '';
        if (file) {
            importBackup(file);
        }
    }
}

function handleSubmit(event) {
    const form = event.target;
    if (form.hasAttribute('data-child-form')) {
        event.preventDefault();
        submitChildForm(form);
    } else if (form.hasAttribute('data-record-form')) {
        event.preventDefault();
        submitRecordForm();
    } else if (form.hasAttribute('data-api-key-form')) {
        event.preventDefault();
        update((s) => {
            s.settings.claudeApiKey = $('[data-api-key]').value.trim();
        });
        showToast('API 키를 저장했어요.');
    }
}

function handleKeydown(event) {
    if (event.key === 'Escape' && $('.sheet-open')) {
        closeSheet();
        return;
    }
    trapFocus(event);
    // 탭 목록: 좌우 화살표로 이동 (WAI-ARIA Tabs 패턴)
    const tab = event.target.closest('[data-tab]');
    if (tab && (event.key === 'ArrowRight' || event.key === 'ArrowLeft' || event.key === 'Home' || event.key === 'End')) {
        event.preventDefault();
        const index = TABS.indexOf(tab.dataset.tab);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? TABS.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length;
        switchTab(TABS[next], true);
    }
    // 예상 키 카드 (role=link)
    if (event.key === 'Enter' && event.target.matches('[role="link"][data-tab-link]')) {
        switchTab(event.target.dataset.tabLink);
    }
}

function initMotion() {
    if (typeof gsap === 'undefined') {
        return;
    }
    const mm = gsap.matchMedia();
    mm.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.to('[data-bounce]', { y: -6, duration: 1.3, repeat: -1, yoyo: true, ease: 'sine.inOut', stagger: 0.2 });
        gsap.from('.home_hero > *, [data-stats] .stat', { y: 18, opacity: 0, duration: 0.45, stagger: 0.06, ease: 'power2.out', clearProps: 'all' });
    });
    mm.add('(prefers-reduced-motion: reduce)', () => {
        gsap.globalTimeline.pause();
        return () => gsap.globalTimeline.resume();
    });
}

function initApp() {
    state = loadState();
    render();
    document.addEventListener('click', handleClick);
    document.addEventListener('change', handleChange);
    document.addEventListener('input', handleInput);
    document.addEventListener('submit', handleSubmit);
    document.addEventListener('keydown', handleKeydown);
    let resizeTimer = null;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(drawVisibleCharts, 150);
    });
    if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(drawVisibleCharts);
    }
    initMotion();
}

if (typeof module !== 'undefined' && module.exports) {
    // 단위 테스트(node --test)용
    module.exports = {
        zScore, valueAtZ, percentile, normCdf, normInv, predictAdultHeight, ageInMonths, formatAge, rankText,
        bmiStatus, calcBmi, parseMeasurement, mergeParsed, isComplete, findDate, hasBatchim,
        readLedRows, readLedMeasurement, readExifDate
    };
} else {
    document.addEventListener('DOMContentLoaded', initApp);
}
