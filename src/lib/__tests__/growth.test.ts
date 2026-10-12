import { describe, expect, it } from 'vitest';
import { percentile, predictAdultHeight, valueAtZ, zScore, normInv, normCdf, ageInMonths } from '../growth';

describe('growth', () => {
  it('중앙값은 50백분위', () => {
    const m = valueAtZ('M', 'height', 60, 0)!;
    expect(percentile('M', 'height', 60, m)).toBeCloseTo(50, 1);
  });
  it('WHO 5세 남아 키 중앙값 ≈ 110cm', () => {
    expect(valueAtZ('M', 'height', 60, 0)!).toBeCloseTo(110.0, 0);
  });
  it('z ↔ 값 왕복', () => {
    const v = valueAtZ('F', 'weight', 30, 1.3)!;
    expect(zScore('F', 'weight', 30, v)).toBeCloseTo(1.3, 4);
  });
  it('정규분포 역함수', () => {
    expect(normCdf(normInv(0.97))).toBeCloseTo(0.97, 4);
  });
  it('예상 키: 50백분위 아이는 18세 중앙값 근처', () => {
    const v = valueAtZ('M', 'height', 84, 0)!;
    const p = predictAdultHeight('M', 84, v)!;
    expect(p.value).toBeCloseTo(valueAtZ('M', 'height', 216, 0)!, 1);
  });
  it('월령 계산', () => {
    expect(ageInMonths('2020-01-01', '2021-01-01')).toBeCloseTo(12, 0);
  });
});
