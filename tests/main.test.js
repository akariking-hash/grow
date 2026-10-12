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
