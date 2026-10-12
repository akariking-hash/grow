// WHO LMS 테이블(일 단위 0–5세 + 월 단위 5–19세)을 앱에서 쓰는 월 단위 표로 변환합니다.
// 사용법: node scripts/build-who-lms.mjs <@pedi-growth/core 의 dist/data 경로>
// 원본: WHO Child Growth Standards(2006), WHO Reference 2007.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
if (!dir) throw new Error('data 디렉터리 경로를 넘겨주세요');
const load = (f) => JSON.parse(readFileSync(join(dir, `${f}.json`), 'utf8'));
const r = (x, n) => Number(x.toFixed(n));

function monthly(dayTable, monthTable, maxMonth) {
    const rows = [];
    const byDay = new Map(dayTable.map((d) => [d.age, d]));
    for (let m = 0; m <= 60; m++) {
        const d = byDay.get(Math.round(m * 30.4375));
        rows.push([m, r(d.L, 4), r(d.M, 4), r(d.S, 5)]);
    }
    for (const d of monthTable ?? []) {
        if (d.age > 60 && d.age <= maxMonth) rows.push([d.age, r(d.L, 4), r(d.M, 4), r(d.S, 5)]);
    }
    return rows;
}

const out = {};
for (const sex of ['boys', 'girls']) {
    out[sex] = {
        height: monthly(load(`lhfa-${sex}-0-5`), load(`hfa-${sex}-5-19`), 228),
        weight: monthly(load(`wfa-${sex}-0-5`), load(`wfa-${sex}-5-10`), 120),
        bmi: monthly(load(`bfa-${sex}-0-5`), load(`bfa-${sex}-5-19`), 228),
    };
}
writeFileSync(
    new URL('../resource/js/lms-data.js', import.meta.url),
    `/* WHO 성장 기준 LMS 표 (scripts/build-who-lms.mjs 로 생성, 직접 수정 금지) — [개월, L, M, S] */\nconst LMS_DATA = ${JSON.stringify(out)};\n`,
);
console.log('ok', Object.fromEntries(Object.entries(out.boys).map(([k, v]) => [k, v.length])));
