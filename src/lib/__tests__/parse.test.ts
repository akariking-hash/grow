import { describe, expect, it } from 'vitest';
import { isComplete, mergeParsed, parseMeasurement } from '../parseMeasurement';

const today = new Date('2026-10-12T12:00:00');

describe('parseMeasurement', () => {
  it('영유아건강검진 결과통보서', () => {
    const r = parseMeasurement(
      `영유아 건강검진 결과통보서\n성명 김하늘  생년월일 2021.03.04\n검진일 2026. 9. 21\n신장 112.3 cm (백분위수 48)\n체중 19.8 kg (백분위수 52)\n두위 50.1 cm`,
      today,
    );
    expect(r).toMatchObject({ height: 112.3, weight: 19.8, date: '2026-09-21' });
    expect(r.confidence.height).toBe('high');
  });

  it('진료 기록 영문 약어 + OCR 오인식', () => {
    const r = parseMeasurement('Date: 2026-08-02\nHt : 98,5 om   Wt : 15.2 kq', today);
    expect(r).toMatchObject({ height: 98.5, weight: 15.2, date: '2026-08-02' });
  });

  it('라벨 없이 단위만 있는 경우 낮은 신뢰도', () => {
    const r = parseMeasurement('26.05.10  87.4cm  12.1kg', today);
    expect(r).toMatchObject({ height: 87.4, weight: 12.1, date: '2026-05-10' });
    expect(r.confidence.height).toBe('low');
  });

  it('한국어 날짜와 키로', () => {
    const r = parseMeasurement('2026년 7월 3일 측정\n몸무게 22.4키로 키 120.8', today);
    expect(r).toMatchObject({ height: 120.8, weight: 22.4, date: '2026-07-03' });
  });

  it('미래 날짜와 범위 밖 숫자는 무시', () => {
    const r = parseMeasurement('2027.01.01 키 350 체중 0.5', today);
    expect(r.height).toBeUndefined();
    expect(r.weight).toBeUndefined();
    expect(r.date).toBeUndefined();
  });

  it('표 칸이 따로 인식된 경우(라벨과 값이 다른 줄)', () => {
    const r = parseMeasurement('검진일: 2026. 09. 21\n\n신장\n\n112.3 cm\n\n백분위수 48\n\n체중\n\n19.8 kg\n\n백분위수 52', today);
    expect(r).toMatchObject({ height: 112.3, weight: 19.8 });
    expect(isComplete(r)).toBe(true);
  });

  it('깨진 숫자는 버리고 다른 인식 결과와 합침', () => {
    const a = parseMeasurement('검진일: 2026. 09. 21\n신장 112.3 cm 백분위수 48\n체중 19.818 、백분위수 52', today);
    expect(a.weight).not.toBe(19.81);
    const b = parseMeasurement('체중\n\n19.8 kg', today);
    const m = mergeParsed(a, b);
    expect(m).toMatchObject({ height: 112.3, weight: 19.8, date: '2026-09-21' });
  });
});
