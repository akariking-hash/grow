import { useState } from 'react';
import { today, uid } from '../lib/store';
import type { Child, Sex } from '../lib/types';

const AVATARS = ['🐣', '🐻', '🐰', '🦊', '🐼', '🐯', '🐨', '🐸', '🦄', '🐬'];
const COLORS = ['#58cc02', '#1cb0f6', '#ff4b8b', '#ff9600', '#a560e8', '#00c2a8'];

export function ChildForm({ initial, onSave, onCancel }: { initial?: Child; onSave: (c: Child) => void; onCancel?: () => void }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [sex, setSex] = useState<Sex>(initial?.sex ?? 'M');
  const [birth, setBirth] = useState(initial?.birth ?? '');
  const [avatar, setAvatar] = useState(initial?.avatar ?? AVATARS[0]);
  const [color, setColor] = useState(initial?.color ?? COLORS[0]);
  const [father, setFather] = useState(initial?.fatherHeight?.toString() ?? '');
  const [mother, setMother] = useState(initial?.motherHeight?.toString() ?? '');
  const valid = name.trim() && birth;

  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        onSave({
          id: initial?.id ?? uid(),
          name: name.trim(),
          sex,
          birth,
          avatar,
          color,
          fatherHeight: Number(father) || undefined,
          motherHeight: Number(mother) || undefined,
        });
      }}
    >
      <label className="field">
        <span>이름(태명도 좋아요)</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="예) 하늘" maxLength={12} />
      </label>

      <div className="field">
        <span>성별</span>
        <div className="seg">
          <button type="button" className={sex === 'M' ? 'on boy' : ''} onClick={() => setSex('M')}>👦 남아</button>
          <button type="button" className={sex === 'F' ? 'on girl' : ''} onClick={() => setSex('F')}>👧 여아</button>
        </div>
      </div>

      <label className="field">
        <span>생년월일</span>
        <input type="date" value={birth} max={today()} onChange={(e) => setBirth(e.target.value)} />
      </label>

      <div className="field">
        <span>캐릭터</span>
        <div className="chips">
          {AVATARS.map((a) => (
            <button type="button" key={a} className={`emoji-chip ${a === avatar ? 'on' : ''}`} onClick={() => setAvatar(a)}>{a}</button>
          ))}
        </div>
      </div>

      <div className="field">
        <span>그래프 색</span>
        <div className="chips">
          {COLORS.map((c) => (
            <button type="button" key={c} aria-label={c} className={`color-chip ${c === color ? 'on' : ''}`} style={{ background: c }} onClick={() => setColor(c)} />
          ))}
        </div>
      </div>

      <details className="more">
        <summary>부모님 키 입력하기 (예상 키가 더 정확해져요)</summary>
        <div className="row2">
          <label className="field">
            <span>아빠 키 (cm)</span>
            <input inputMode="decimal" value={father} onChange={(e) => setFather(e.target.value)} placeholder="175" />
          </label>
          <label className="field">
            <span>엄마 키 (cm)</span>
            <input inputMode="decimal" value={mother} onChange={(e) => setMother(e.target.value)} placeholder="162" />
          </label>
        </div>
      </details>

      <div className="actions">
        {onCancel && <button type="button" className="btn ghost" onClick={onCancel}>취소</button>}
        <button className="btn primary" disabled={!valid}>{initial ? '저장하기' : '시작하기'}</button>
      </div>
    </form>
  );
}
