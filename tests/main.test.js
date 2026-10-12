// 실행: npm test
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// 브라우저처럼 lms-data.js 를 전역 스크립트로 먼저 불러온 뒤 main.js 의 순수 함수만 가져옴
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../resource/js/lms-data.js'), 'utf8'));
const app = require('../resource/js/main.js');

const today = new Date('2026-10-12T12:00:00');
const close = (a, b, eps) => assert.ok(Math.abs(a - b) < eps, a + ' ≈ ' + b);

test('중앙값은 50백분위, WHO 5세 남아 키 중앙값 ≈ 110cm', () => {
    const median = app.valueAtZ('M', 'height', 60, 0);
    close(median, 110.0, 0.5);
    close(app.percentile('M', 'height', 60, median), 50, 0.1);
});

test('z ↔ 값 왕복, 정규분포 역함수', () => {
    const v = app.valueAtZ('F', 'weight', 30, 1.3);
    close(app.zScore('F', 'weight', 30, v), 1.3, 1e-4);
    close(app.normCdf(app.normInv(0.97)), 0.97, 1e-4);
});

test('예상 키: 50백분위 아이는 18세 중앙값 근처, 2세 미만은 예측 안 함', () => {
    const v = app.valueAtZ('M', 'height', 84, 0);
    close(app.predictAdultHeight('M', 84, v).value, app.valueAtZ('M', 'height', 216, 0), 0.1);
    assert.equal(app.predictAdultHeight('M', 18, 80), null);
});

test('월령·나이 표기·조사', () => {
    close(app.ageInMonths('2020-01-01', '2021-01-01'), 12, 0.1);
    assert.equal(app.formatAge(67), '5세 7개월');
    assert.equal(app.hasBatchim('하늘'), true);
    assert.equal(app.hasBatchim('바다'), false);
});

test('기록지: 영유아건강검진 결과통보서', () => {
    const r = app.parseMeasurement('영유아 건강검진 결과통보서\n성명 김하늘  생년월일 2021.03.04\n검진일 2026. 9. 21\n신장 112.3 cm (백분위수 48)\n체중 19.8 kg (백분위수 52)\n두위 50.1 cm', today);
    assert.deepEqual([r.height, r.weight, r.date], [112.3, 19.8, '2026-09-21']);
    assert.equal(r.confidence.height, 'high');
});

test('기록지: 영문 약어 + OCR 오인식', () => {
    const r = app.parseMeasurement('Date: 2026-08-02\nHt : 98,5 om   Wt : 15.2 kq', today);
    assert.deepEqual([r.height, r.weight, r.date], [98.5, 15.2, '2026-08-02']);
});

test('기록지: 라벨 없이 단위만 있으면 낮은 신뢰도', () => {
    const r = app.parseMeasurement('26.05.10  87.4cm  12.1kg', today);
    assert.deepEqual([r.height, r.weight, r.date], [87.4, 12.1, '2026-05-10']);
    assert.equal(r.confidence.height, 'low');
});

test('기록지: 한국어 날짜와 "키로"', () => {
    const r = app.parseMeasurement('2026년 7월 3일 측정\n몸무게 22.4키로 키 120.8', today);
    assert.deepEqual([r.height, r.weight, r.date], [120.8, 22.4, '2026-07-03']);
});

test('기록지: 미래 날짜·범위 밖 숫자는 무시', () => {
    const r = app.parseMeasurement('2027.01.01 키 350 체중 0.5', today);
    assert.deepEqual([r.height, r.weight, r.date], [null, null, null]);
});

test('기록지: 표 칸이 따로 인식돼 라벨과 값이 다른 줄', () => {
    const r = app.parseMeasurement('검진일: 2026. 09. 21\n\n신장\n\n112.3 cm\n\n백분위수 48\n\n체중\n\n19.8 kg\n\n백분위수 52', today);
    assert.deepEqual([r.height, r.weight], [112.3, 19.8]);
    assert.equal(app.isComplete(r), true);
});

test('기록지: 깨진 숫자는 버리고 다른 인식 결과와 합침', () => {
    const a = app.parseMeasurement('검진일: 2026. 09. 21\n신장 112.3 cm 백분위수 48\n체중 19.818 、백분위수 52', today);
    assert.notEqual(a.weight, 19.81);
    const merged = app.mergeParsed(a, app.parseMeasurement('체중\n\n19.8 kg', today));
    assert.deepEqual([merged.height, merged.weight, merged.date], [112.3, 19.8, '2026-09-21']);
});

test('기록지: 측정 범위 표기(90~200Cm)는 측정값이 아님', () => {
    const r = app.parseMeasurement('JENIX 신장·체중 자동측정기\n측정 범위\n신 장 : 90~200Cm (최소눈금 0.1Cm)\n체 중 : 10~200Kg (최소눈금 0.1Kg)', today);
    assert.deepEqual([r.height, r.weight], [null, null]);
});

/* ---------- LED 숫자 판독 ---------- */

// 세그먼트 a~g 를 그린 가짜 LED 화면 (켜진 칸은 밝은 초록, 꺼진 칸은 어두운 초록, 배경은 회색)
const DIGIT_SEGMENTS = ['abcdef', 'bc', 'abged', 'abgcd', 'fgbc', 'afgcd', 'afgedc', 'abc', 'abcdefg', 'abcdfg'];

function drawLed(rowsText, options) {
    const opts = Object.assign({ color: [40, 235, 60], slant: 0.15, digitH: 60 }, options);
    const dh = opts.digitH;
    const dw = Math.round(dh * 0.55);
    const t = Math.max(3, Math.round(dh * 0.12));
    const width = 420;
    const height = 120 + rowsText.length * (dh + 30);
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i += 1) {
        data.set([150, 150, 155, 255], i * 4);
    }
    const fill = (x0, y0, x1, y1, rgb, yTop) => {
        for (let y = y0; y < y1; y += 1) {
            const shift = Math.round(opts.slant * (yTop + dh - y));
            for (let x = x0; x < x1; x += 1) {
                data.set([rgb[0], rgb[1], rgb[2], 255], (y * width + x + shift) * 4);
            }
        }
    };
    rowsText.forEach((text, row) => {
        const top = 60 + row * (dh + 30);
        fill(40, top - 8, 380, top + dh + 8, [5, 30, 25], top);
        const chars = text.padStart(4, ' ').replace('.', '');
        chars.split('').forEach((ch, i) => {
            const left = 70 + i * (dw + 22);
            const zones = {
                a: [left + t, top, left + dw - t, top + t], d: [left + t, top + dh - t, left + dw - t, top + dh],
                g: [left + t, top + (dh - t) / 2, left + dw - t, top + (dh + t) / 2],
                f: [left, top + t, left + t, top + dh / 2 - t / 2], b: [left + dw - t, top + t, left + dw, top + dh / 2 - t / 2],
                e: [left, top + dh / 2 + t / 2, left + t, top + dh - t], c: [left + dw - t, top + dh / 2 + t / 2, left + dw, top + dh - t]
            };
            const on = ch === ' ' ? '' : DIGIT_SEGMENTS[Number(ch)];
            Object.keys(zones).forEach((seg) => {
                const z = zones[seg].map(Math.round);
                fill(z[0], z[1], z[2], z[3], on.includes(seg) ? opts.color : [10, 70, 30], top);
            });
        });
    });
    return { width: width, height: height, data: data };
}

test('LED: 신장·체중 자동측정기 화면 (H 129.3 / W 29.6 / R 17.7)', () => {
    const r = app.readLedMeasurement(drawLed(['129.3', '29.6', '17.7']));
    assert.deepEqual([r.height, r.weight], [129.3, 29.6]);
    assert.equal(r.confidence.height, 'high');
});

test('LED: 모든 숫자 0~9 판독', () => {
    const rows = app.readLedRows(drawLed(['123.4', '567.8', '90.1'], { slant: 0 }));
    assert.deepEqual(rows.map((x) => x.value), [123.4, 567.8, 90.1]);
});

test('LED: 빨간 LED, 작은 글씨', () => {
    const r = app.readLedMeasurement(drawLed(['98.7', '15.2'], { color: [240, 40, 30], digitH: 34 }));
    assert.deepEqual([r.height, r.weight], [98.7, 15.2]);
});

test('LED: LED가 없는 사진은 아무것도 찾지 않음', () => {
    const blank = drawLed([]);
    assert.deepEqual(app.readLedRows(blank), []);
});

/* ---------- 사진 찍은 날짜 (EXIF) ---------- */

function jpegWithExif(dateText, littleEndian) {
    // TIFF: IFD0(ExifIFD 포인터 1개) → Exif IFD(DateTimeOriginal 1개) → 날짜 문자열
    const ascii = Buffer.from(dateText + '\0', 'ascii');
    const tiff = Buffer.alloc(8 + 18 + 18 + ascii.length);
    const w16 = (v, o) => (littleEndian ? tiff.writeUInt16LE(v, o) : tiff.writeUInt16BE(v, o));
    const w32 = (v, o) => (littleEndian ? tiff.writeUInt32LE(v, o) : tiff.writeUInt32BE(v, o));
    tiff.write(littleEndian ? 'II' : 'MM', 0, 'ascii');
    w16(42, 2);
    w32(8, 4);
    w16(1, 8); w16(0x8769, 10); w16(4, 12); w32(1, 14); w32(26, 18); w32(0, 22);
    w16(1, 26); w16(0x9003, 28); w16(2, 30); w32(ascii.length, 32); w32(44, 36); w32(0, 40);
    ascii.copy(tiff, 44);
    const app1Body = Buffer.concat([Buffer.from('Exif\0\0', 'ascii'), tiff]);
    const header = Buffer.from([0xff, 0xd8, 0xff, 0xe1, (app1Body.length + 2) >> 8, (app1Body.length + 2) & 0xff]);
    const bytes = Buffer.concat([header, app1Body, Buffer.from([0xff, 0xd9])]);
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length);
}

test('EXIF: 사진 찍은 날짜 읽기 (아이폰 빅엔디언·안드로이드 리틀엔디언)', () => {
    assert.equal(app.readExifDate(jpegWithExif('2026:09:21 10:31:05', false)), '2026-09-21');
    assert.equal(app.readExifDate(jpegWithExif('2025:01:02 08:00:00', true)), '2025-01-02');
});

test('EXIF: 날짜가 없거나 JPEG가 아니면 null', () => {
    assert.equal(app.readExifDate(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer), null);
    assert.equal(app.readExifDate(jpegWithExif('0000:00:00 00:00:00', true)), null);
});
