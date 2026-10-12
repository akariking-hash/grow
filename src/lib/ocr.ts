import { isComplete, mergeParsed, parseMeasurement, type ParsedMeasurement } from './parseMeasurement';

export interface OcrResult extends ParsedMeasurement {
  rawText?: string;
  engine: 'device' | 'claude';
}

/** 사진을 긴 변 maxSide 픽셀 JPEG로 줄입니다. */
export async function resizeImage(file: Blob, maxSide: number, quality = 0.85): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', quality);
}

/** 기기 안에서 처리 (Tesseract.js, 한국어+영어). 사진이 외부로 나가지 않습니다. */
export async function recognizeOnDevice(file: Blob, onProgress?: (p: number) => void): Promise<OcrResult> {
  const { createWorker } = await import('tesseract.js');
  const base = `${import.meta.env.BASE_URL}ocr`;
  const worker = await createWorker(['kor', 'eng'], 1, {
    workerPath: `${base}/worker.min.js`,
    corePath: `${base}/core`,
    langPath: `${base}/lang`,
    logger: (m) => {
      if (m.status === 'recognizing text') onProgress?.(m.progress);
    },
  });
  try {
    const image = await prepareForOcr(file);
    // 결과지는 표 형태가 많아서 '한 단(4)'과 '흩어진 글자(11)' 두 방식으로 읽고 합칩니다.
    let parsed: ParsedMeasurement | undefined;
    const texts: string[] = [];
    for (const psm of ['4', '11']) {
      await worker.setParameters({ tessedit_pageseg_mode: psm as never });
      const { data } = await worker.recognize(image);
      texts.push(data.text);
      const p = parseMeasurement(data.text);
      parsed = parsed ? mergeParsed(parsed, p) : p;
      if (isComplete(parsed)) break;
    }
    return { ...parsed!, rawText: texts.join('\n---\n'), engine: 'device' };
  } finally {
    await worker.terminate();
  }
}

/** 흑백 변환 + 작은 사진은 확대 (Tesseract는 글자 높이 20px 이상에서 잘 읽음) */
async function prepareForOcr(file: Blob): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const long = Math.max(bitmap.width, bitmap.height);
  const scale = long < 1600 ? 1600 / long : long > 2400 ? 2400 / long : 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.filter = 'grayscale(1) contrast(1.35)';
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/png');
}

/** Claude 비전으로 인식 (손글씨·사진 기울어짐에 강함). 사용자의 API 키가 필요합니다. */
export async function recognizeWithClaude(file: Blob, apiKey: string): Promise<OcrResult> {
  const [{ default: Anthropic }, { betaZodOutputFormat }, { z }] = await Promise.all([
    import('@anthropic-ai/sdk'),
    import('@anthropic-ai/sdk/helpers/beta/zod'),
    import('zod'),
  ]);
  const schema = z.object({
    date: z.string().nullable().describe('측정일 YYYY-MM-DD. 생년월일이나 발급일이 아닌 측정/검진일'),
    height_cm: z.number().nullable().describe('키(신장) cm'),
    weight_kg: z.number().nullable().describe('몸무게(체중) kg'),
  });
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const dataUrl = await resizeImage(file, 1568);
  const response = await client.beta.messages.parse({
    model: 'claude-opus-5-5',
    max_tokens: 2000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: betaZodOutputFormat(schema) },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: dataUrl.split(',')[1] } },
          {
            type: 'text',
            text:
              '아이의 병원·보건소 기록(영유아건강검진 결과지, 진료 기록, 신장계 출력물 등) 사진입니다. ' +
              '아이의 측정일, 키(cm), 몸무게(kg)를 찾아주세요. 백분위수나 표준 범위 숫자가 아니라 실제 측정값만 적고, ' +
              '보이지 않거나 확실하지 않은 값은 null로 두세요.',
          },
        ],
      },
    ],
  });
  if (response.stop_reason === 'refusal') throw new Error('이 사진은 인식할 수 없어요.');
  const out = response.parsed_output;
  if (!out) throw new Error('인식 결과를 읽지 못했어요.');
  const level = (v: unknown) => (v == null ? 'none' : 'high') as 'none' | 'high';
  return {
    engine: 'claude',
    date: out.date ?? undefined,
    height: out.height_cm ?? undefined,
    weight: out.weight_kg ?? undefined,
    confidence: { date: level(out.date), height: level(out.height_cm), weight: level(out.weight_kg) },
  };
}
