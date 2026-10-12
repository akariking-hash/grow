import { useRef, useState } from 'react';
import { recognizeOnDevice, recognizeWithClaude, resizeImage, type OcrResult } from '../lib/ocr';
import { today, uid } from '../lib/store';
import type { Child, GrowthRecord, Settings } from '../lib/types';
import { Mascot, Speech } from './Mascot';

type Step = 'pick' | 'reading' | 'confirm';

export function AddRecord({
  child,
  settings,
  mode,
  editing,
  onSave,
  onClose,
}: {
  child: Child;
  settings: Settings;
  mode: 'photo' | 'manual';
  editing?: GrowthRecord;
  onSave: (r: GrowthRecord) => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState<Step>(mode === 'photo' && !editing ? 'pick' : 'confirm');
  const [progress, setProgress] = useState(0);
  const [preview, setPreview] = useState<string | undefined>(editing?.thumb);
  const [thumb, setThumb] = useState<string | undefined>(editing?.thumb);
  const [ocr, setOcr] = useState<OcrResult>();
  const [error, setError] = useState<string>();
  const [date, setDate] = useState(editing?.date ?? today());
  const [height, setHeight] = useState(editing?.height?.toString() ?? '');
  const [weight, setWeight] = useState(editing?.weight?.toString() ?? '');
  const [memo, setMemo] = useState(editing?.memo ?? '');
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  async function handleFile(file?: File) {
    if (!file) return;
    setError(undefined);
    setStep('reading');
    setProgress(0);
    try {
      const [prev, small] = await Promise.all([resizeImage(file, 900, 0.8), resizeImage(file, 240, 0.6)]);
      setPreview(prev);
      setThumb(small);
      const useClaude = settings.ocrEngine === 'claude' && settings.claudeApiKey;
      const result = useClaude ? await recognizeWithClaude(file, settings.claudeApiKey!) : await recognizeOnDevice(file, setProgress);
      setOcr(result);
      if (result.date) setDate(result.date);
      if (result.height) setHeight(String(result.height));
      if (result.weight) setWeight(String(result.weight));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setStep('confirm');
  }

  const h = Number(height);
  const w = Number(weight);
  const valid = !!date && date >= child.birth && ((h > 30 && h < 220) || (w > 1 && w < 200));
  const found = ocr && (ocr.height || ocr.weight);
  const tag = (k: 'height' | 'weight' | 'date') =>
    ocr && ocr.confidence[k] !== 'none' ? (
      <em className={`tag ${ocr.confidence[k]}`}>{ocr.confidence[k] === 'high' ? '자동 인식' : '확인 필요'}</em>
    ) : null;

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal>
        <button className="sheet-close" onClick={onClose} aria-label="닫기">✕</button>

        {step === 'pick' && (
          <>
            <Speech mood="wow">
              병원에서 받은 <b>검진 결과지</b>나 <b>진료 기록</b>을 찍어주세요.
              <br />키랑 몸무게는 제가 읽어볼게요!
            </Speech>
            <div className="pick-grid">
              <button className="pick" onClick={() => cameraRef.current?.click()}>
                <span className="pick-ico">📸</span>사진 찍기
              </button>
              <button className="pick" onClick={() => galleryRef.current?.click()}>
                <span className="pick-ico">🖼️</span>앨범에서 고르기
              </button>
            </div>
            <ul className="tips">
              <li>숫자가 또렷하게 보이도록 밝은 곳에서 찍어주세요</li>
              <li>종이가 화면에 꽉 차면 더 잘 읽어요</li>
              <li>사진은 {settings.ocrEngine === 'claude' && settings.claudeApiKey ? 'Claude로 보내 인식하고' : '이 기기 안에서만 인식하고'}, 작은 썸네일만 저장돼요</li>
            </ul>
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => handleFile(e.target.files?.[0])} />
            <input ref={galleryRef} type="file" accept="image/*" hidden onChange={(e) => handleFile(e.target.files?.[0])} />
          </>
        )}

        {step === 'reading' && (
          <div className="reading">
            {preview && <img src={preview} alt="" className="reading-img" />}
            <div className="scanline" />
            <Mascot mood="think" size={96} />
            <p className="reading-text">기록지를 꼼꼼히 읽는 중이에요…</p>
            <div className="progress"><div style={{ width: `${Math.round(progress * 100)}%` }} /></div>
            <p className="hint">처음 한 번은 글자 인식 데이터를 받느라 조금 걸려요</p>
          </div>
        )}

        {step === 'confirm' && (
          <form
            className="form"
            onSubmit={(e) => {
              e.preventDefault();
              if (!valid) return;
              onSave({
                id: editing?.id ?? uid(),
                childId: child.id,
                date,
                height: h > 0 ? h : undefined,
                weight: w > 0 ? w : undefined,
                memo: memo.trim() || undefined,
                source: editing?.source ?? (mode === 'photo' ? 'photo' : 'manual'),
                thumb,
              });
            }}
          >
            {mode === 'photo' && !editing && (
              <Speech mood={found ? 'happy' : 'think'} size={72}>
                {error ? (
                  <>앗, 사진을 읽지 못했어요. 😢<br /><small>{error}</small><br />직접 입력해 주시겠어요?</>
                ) : found ? (
                  <>찾았어요! 숫자가 맞는지 <b>한 번만 확인</b>해 주세요.</>
                ) : (
                  <>숫자를 잘 못 찾았어요. 아래에 직접 적어주세요!</>
                )}
              </Speech>
            )}
            {preview && <img src={preview} alt="업로드한 기록지" className="confirm-img" />}

            <label className="field">
              <span>측정일 {tag('date')}</span>
              <input type="date" value={date} min={child.birth} max={today()} onChange={(e) => setDate(e.target.value)} />
            </label>
            <div className="row2">
              <label className="field big">
                <span>키 (cm) {tag('height')}</span>
                <input inputMode="decimal" value={height} onChange={(e) => setHeight(e.target.value)} placeholder="0.0" />
              </label>
              <label className="field big">
                <span>몸무게 (kg) {tag('weight')}</span>
                <input inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="0.0" />
              </label>
            </div>
            <label className="field">
              <span>메모</span>
              <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="예) 4차 영유아검진, ○○소아과" maxLength={40} />
            </label>
            {ocr?.rawText && (
              <details className="more">
                <summary>인식된 글자 보기</summary>
                <pre className="raw">{ocr.rawText.trim()}</pre>
              </details>
            )}
            <div className="actions">
              {mode === 'photo' && !editing && (
                <button type="button" className="btn ghost" onClick={() => setStep('pick')}>다시 찍기</button>
              )}
              <button className="btn primary" disabled={!valid}>기록 저장</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
