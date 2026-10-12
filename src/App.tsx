import { useState } from 'react';
import { AddRecord } from './components/AddRecord';
import { ChildForm } from './components/ChildForm';
import { GrowthChart } from './components/GrowthChart';
import { Mascot, Speech } from './components/Mascot';
import {
  ageInMonths,
  bmi,
  bmiStatus,
  formatAge,
  METRIC_LABEL,
  METRIC_UNIT,
  percentile,
  predictAdultHeight,
  rankText,
  valueOf,
  type Metric,
} from './lib/growth';
import { recordsOf, today, useAppState, type Store } from './lib/store';
import type { Child, GrowthRecord } from './lib/types';

type Tab = 'home' | 'chart' | 'records' | 'family' | 'settings';
type Sheet = { kind: 'add'; mode: 'photo' | 'manual'; editing?: GrowthRecord } | { kind: 'child'; editing?: Child } | null;

export default function App() {
  const store = useAppState();
  const { state } = store;
  const [tab, setTab] = useState<Tab>('home');
  const [sheet, setSheet] = useState<Sheet>(null);
  const child = state.children.find((c) => c.id === state.activeChildId) ?? state.children[0];

  if (!child) {
    return (
      <div className="app onboarding">
        <div className="hero">
          <Mascot mood="wow" size={150} />
          <h1>안녕하세요!<br />저는 <span className="hl">키린</span>이에요</h1>
          <p>병원에서 잰 키·몸무게를 사진 한 장으로 기록하고<br />또래 친구들과 비교해 드릴게요.</p>
        </div>
        <div className="card">
          <h2 className="card-title">우리 아이를 소개해 주세요</h2>
          <ChildForm onSave={store.saveChild} />
        </div>
      </div>
    );
  }

  const records = recordsOf(state, child.id);

  return (
    <div className="app">
      <header className="topbar">
        <div className="kids">
          {state.children.map((c) => (
            <button key={c.id} className={`kid ${c.id === child.id ? 'on' : ''}`} style={{ '--kid': c.color } as React.CSSProperties} onClick={() => store.setActive(c.id)}>
              <span className="kid-ava">{c.avatar}</span>
              <span className="kid-name">{c.name}</span>
            </button>
          ))}
          <button className="kid add" onClick={() => setSheet({ kind: 'child' })} aria-label="아이 추가">
            <span className="kid-ava">＋</span>
          </button>
        </div>
      </header>

      <main className="content">
        {tab === 'home' && <Home child={child} records={records} onAdd={(mode) => setSheet({ kind: 'add', mode })} onGo={setTab} />}
        {tab === 'chart' && <ChartTab child={child} records={records} />}
        {tab === 'records' && (
          <RecordsTab child={child} records={records} onEdit={(r) => setSheet({ kind: 'add', mode: 'manual', editing: r })} onRemove={store.removeRecord} />
        )}
        {tab === 'family' && <FamilyTab store={store} />}
        {tab === 'settings' && <SettingsTab store={store} child={child} onEditChild={() => setSheet({ kind: 'child', editing: child })} />}
      </main>

      <nav className="tabbar">
        {(
          [
            ['home', '🏠', '홈'],
            ['chart', '📈', '그래프'],
            ['records', '📋', '기록'],
            ['family', '👨‍👩‍👧', '형제비교'],
            ['settings', '⚙️', '설정'],
          ] as const
        ).map(([k, ico, label]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            <span className="tab-ico">{ico}</span>
            <span>{label}</span>
          </button>
        ))}
      </nav>

      {sheet?.kind === 'add' && (
        <AddRecord
          key={sheet.editing?.id ?? sheet.mode}
          child={child}
          settings={state.settings}
          mode={sheet.mode}
          editing={sheet.editing}
          onClose={() => setSheet(null)}
          onSave={(r) => {
            store.saveRecord(r);
            setSheet(null);
            setTab('home');
          }}
        />
      )}
      {sheet?.kind === 'child' && (
        <div className="sheet-backdrop" onClick={() => setSheet(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <button className="sheet-close" onClick={() => setSheet(null)} aria-label="닫기">✕</button>
            <h2 className="card-title">{sheet.editing ? '아이 정보 수정' : '아이 추가하기'}</h2>
            <ChildForm
              initial={sheet.editing}
              onCancel={() => setSheet(null)}
              onSave={(c) => {
                store.saveChild(c);
                setSheet(null);
                if (!sheet.editing) setTab('home');
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- 홈 ---------------- */

function latestOf(records: GrowthRecord[], key: 'height' | 'weight') {
  return [...records].reverse().find((r) => r[key] != null);
}

function Home({ child, records, onAdd, onGo }: { child: Child; records: GrowthRecord[]; onAdd: (m: 'photo' | 'manual') => void; onGo: (t: Tab) => void }) {
  const nowAge = ageInMonths(child.birth, today());
  const lh = latestOf(records, 'height');
  const lw = latestOf(records, 'weight');
  const hPct = lh ? percentile(child.sex, 'height', ageInMonths(child.birth, lh.date), lh.height!) : null;
  const wPct = lw ? percentile(child.sex, 'weight', ageInMonths(child.birth, lw.date), lw.weight!) : null;
  const both = [...records].reverse().find((r) => r.height && r.weight);
  const bmiVal = both ? bmi(both.height!, both.weight!) : null;
  const bmiPct = both ? percentile(child.sex, 'bmi', ageInMonths(child.birth, both.date), bmiVal!) : null;
  const pred = lh ? predictAdultHeight(child.sex, ageInMonths(child.birth, lh.date), lh.height!, { father: child.fatherHeight, mother: child.motherHeight }) : null;
  const prev = lh ? [...records].reverse().find((r) => r.height != null && r.date < lh.date) : undefined;
  const josa = hasBatchim(child.name) ? '이는' : '는';

  return (
    <>
      <section className="greet">
        <div>
          <p className="greet-sub">{child.avatar} {formatAge(nowAge)}</p>
          <h1 className="greet-title">{child.name}{josa} 쑥쑥 크는 중!</h1>
        </div>
      </section>

      <Speech mood={records.length ? (hPct != null && hPct >= 50 ? 'wow' : 'happy') : 'think'}>
        {!records.length && <>아직 기록이 없어요. 병원 다녀오셨다면 <b>결과지 사진</b>부터 올려볼까요?</>}
        {records.length > 0 && hPct != null && (
          <>
            또래 친구 100명이 줄을 서면 {child.name}{hasBatchim(child.name) ? '이' : ''}는 키 큰 순서로 <b>앞에서 {Math.max(1, Math.round(100 - hPct))}번째</b>쯤이에요!
            {prev && lh && (
              <> 지난번보다 <b>{(lh.height! - prev.height!).toFixed(1)}cm</b> 컸어요 🎉</>
            )}
          </>
        )}
        {records.length > 0 && hPct == null && <>키 기록을 추가하면 또래와 비교해 드릴게요!</>}
      </Speech>

      <button className="btn primary huge" onClick={() => onAdd('photo')}>
        <span>📸</span> 병원 기록 사진으로 추가
      </button>
      <button className="btn secondary" onClick={() => onAdd('manual')}>✏️ 직접 입력하기</button>

      {records.length > 0 && (
        <div className="stats">
          <StatCard label="키" value={lh?.height} unit="cm" pct={hPct} date={lh?.date} tone="blue" />
          <StatCard label="몸무게" value={lw?.weight} unit="kg" pct={wPct} date={lw?.date} tone="orange" />
          <div className="stat card tone-green">
            <p className="stat-label">BMI(비만도)</p>
            {bmiVal ? (
              <>
                <p className="stat-value">{bmiVal.toFixed(1)}</p>
                {bmiPct != null && (
                  <p className={`pill ${bmiStatus(bmiPct).tone}`}>{bmiStatus(bmiPct).label}</p>
                )}
              </>
            ) : (
              <p className="stat-empty">키·몸무게를 함께 기록하면 알려드려요</p>
            )}
          </div>
          <div className="stat card tone-purple" onClick={() => onGo('chart')}>
            <p className="stat-label">예상 성인 키</p>
            {pred ? (
              <>
                <p className="stat-value">{pred.value.toFixed(0)}<small>cm</small></p>
                <p className="stat-sub">{pred.range[0].toFixed(0)}~{pred.range[1].toFixed(0)}cm 사이</p>
              </>
            ) : (
              <p className="stat-empty">만 2세부터 예측할 수 있어요</p>
            )}
          </div>
        </div>
      )}

      {records.length > 0 && (
        <div className="card">
          <div className="card-head">
            <h2 className="card-title">키 성장 그래프</h2>
            <button className="link" onClick={() => onGo('chart')}>자세히 ›</button>
          </div>
          <GrowthChart child={child} records={records} metric="height" />
        </div>
      )}
    </>
  );
}

function StatCard({ label, value, unit, pct, date, tone }: { label: string; value?: number; unit: string; pct: number | null; date?: string; tone: string }) {
  return (
    <div className={`stat card tone-${tone}`}>
      <p className="stat-label">{label}</p>
      {value != null ? (
        <>
          <p className="stat-value">{value}<small>{unit}</small></p>
          {pct != null ? <p className="stat-sub">{rankText(pct)} · {pct.toFixed(0)}백분위</p> : <p className="stat-sub">비교 범위 밖 나이</p>}
          {pct != null && <PctBar pct={pct} />}
          <p className="stat-date">{date?.replaceAll('-', '.')}</p>
        </>
      ) : (
        <p className="stat-empty">기록 없음</p>
      )}
    </div>
  );
}

function PctBar({ pct }: { pct: number }) {
  return (
    <div className="pctbar" aria-hidden>
      <div className="pctbar-dot" style={{ left: `${Math.min(97, Math.max(3, pct))}%` }} />
    </div>
  );
}

/* ---------------- 그래프 ---------------- */

function ChartTab({ child, records }: { child: Child; records: GrowthRecord[] }) {
  const [metric, setMetric] = useState<Metric>('height');
  const rows = records.filter((r) => valueOf(r, metric) != null).reverse();
  const lh = latestOf(records, 'height');
  const pred = lh ? predictAdultHeight(child.sex, ageInMonths(child.birth, lh.date), lh.height!, { father: child.fatherHeight, mother: child.motherHeight }) : null;

  return (
    <>
      <div className="seg big">
        {(['height', 'weight', 'bmi'] as Metric[]).map((m) => (
          <button key={m} className={metric === m ? 'on' : ''} onClick={() => setMetric(m)}>{METRIC_LABEL[m]}</button>
        ))}
      </div>
      <div className="card">
        <GrowthChart child={child} records={records} metric={metric} />
        <div className="legend">
          <span><i className="lg band-0" />3~97</span>
          <span><i className="lg band-1" />10~90</span>
          <span><i className="lg band-2" />25~75 백분위</span>
          <span><i className="lg median" />50(평균)</span>
        </div>
        {metric === 'weight' && <p className="hint">만 10세 이후 몸무게는 국제 기준이 없어 BMI로 확인해 주세요.</p>}
      </div>

      {metric === 'height' && pred && (
        <div className="card predict">
          <Speech mood="wow" size={64}>
            지금처럼 자라면 어른이 됐을 때 <b>{pred.value.toFixed(1)}cm</b> 정도 될 것 같아요!
          </Speech>
          <ul className="predict-list">
            <li><span>현재 백분위 유지 시</span><b>{pred.byPercentile.toFixed(1)}cm</b></li>
            <li>
              <span>부모 키 기준 (중간부모키)</span>
              <b>{pred.midParental ? `${pred.midParental.toFixed(1)}cm` : '설정에서 입력'}</b>
            </li>
          </ul>
          <p className="hint">통계적 추정이라 실제와 ±5cm 이상 다를 수 있어요. 성장이 걱정되면 소아청소년과 전문의와 상담하세요.</p>
        </div>
      )}

      <div className="card">
        <h2 className="card-title">측정값</h2>
        {rows.length === 0 && <p className="empty">아직 기록이 없어요</p>}
        <table className="tbl">
          <tbody>
            {rows.map((r) => {
              const v = valueOf(r, metric)!;
              const age = ageInMonths(child.birth, r.date);
              const p = percentile(child.sex, metric, age, v);
              return (
                <tr key={r.id}>
                  <td>{r.date.replaceAll('-', '.')}<small>{formatAge(age)}</small></td>
                  <td className="num">{v.toFixed(1)}{METRIC_UNIT[metric]}</td>
                  <td className="num muted">{p != null ? `${p.toFixed(0)}%ile` : '-'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ---------------- 기록 ---------------- */

function RecordsTab({ child, records, onEdit, onRemove }: { child: Child; records: GrowthRecord[]; onEdit: (r: GrowthRecord) => void; onRemove: (id: string) => void }) {
  if (!records.length) {
    return (
      <div className="empty-state">
        <Mascot mood="sleep" size={120} />
        <p>아직 기록이 없어요.<br />홈에서 첫 기록을 추가해 보세요!</p>
      </div>
    );
  }
  return (
    <div className="timeline">
      {[...records].reverse().map((r) => (
        <div key={r.id} className="tl-item card">
          {r.thumb ? <img src={r.thumb} alt="" className="tl-thumb" /> : <div className="tl-thumb ph">{r.source === 'photo' ? '📸' : '✏️'}</div>}
          <div className="tl-body" onClick={() => onEdit(r)}>
            <p className="tl-date">{r.date.replaceAll('-', '.')} <small>{formatAge(ageInMonths(child.birth, r.date))}</small></p>
            <p className="tl-vals">
              {r.height != null && <span>📏 {r.height}cm</span>}
              {r.weight != null && <span>⚖️ {r.weight}kg</span>}
            </p>
            {r.memo && <p className="tl-memo">{r.memo}</p>}
          </div>
          <button
            className="icon-btn"
            aria-label="삭제"
            onClick={() => {
              if (confirm('이 기록을 지울까요?')) onRemove(r.id);
            }}
          >
            🗑️
          </button>
        </div>
      ))}
    </div>
  );
}

/* ---------------- 형제자매 비교 ---------------- */

function FamilyTab({ store }: { store: Store }) {
  const { state } = store;
  if (state.children.length < 2) {
    return (
      <div className="empty-state">
        <Mascot mood="think" size={120} />
        <p>아이가 두 명 이상이면<br />같은 나이 때 성장을 나란히 비교해 드려요!</p>
        <p className="hint">위쪽 ＋ 버튼으로 아이를 추가하세요.</p>
      </div>
    );
  }
  return (
    <>
      <Speech mood="happy" size={64}>백분위로 비교하면 나이가 달라도 <b>또래 대비 위치</b>를 나란히 볼 수 있어요.</Speech>
      {state.children.map((c) => {
        const recs = recordsOf(state, c.id);
        const lh = latestOf(recs, 'height');
        const lw = latestOf(recs, 'weight');
        const hp = lh ? percentile(c.sex, 'height', ageInMonths(c.birth, lh.date), lh.height!) : null;
        const wp = lw ? percentile(c.sex, 'weight', ageInMonths(c.birth, lw.date), lw.weight!) : null;
        return (
          <div className="card sib" key={c.id} style={{ '--kid': c.color } as React.CSSProperties}>
            <div className="sib-head">
              <span className="kid-ava big">{c.avatar}</span>
              <div>
                <p className="sib-name">{c.name}</p>
                <p className="muted">{formatAge(ageInMonths(c.birth, today()))} · {c.sex === 'M' ? '남아' : '여아'}</p>
              </div>
            </div>
            <SibBar label="키" pct={hp} value={lh?.height ? `${lh.height}cm` : undefined} />
            <SibBar label="몸무게" pct={wp} value={lw?.weight ? `${lw.weight}kg` : undefined} />
          </div>
        );
      })}
      <SameAgeTable store={store} />
    </>
  );
}

function SibBar({ label, pct, value }: { label: string; pct: number | null; value?: string }) {
  return (
    <div className="sibbar">
      <span className="sibbar-label">{label}</span>
      <div className="sibbar-track">
        {pct != null && <div className="sibbar-fill" style={{ width: `${Math.max(3, pct)}%` }} />}
      </div>
      <span className="sibbar-val">{pct != null ? `${pct.toFixed(0)}%ile` : '-'}<small>{value ?? ''}</small></span>
    </div>
  );
}

function SameAgeTable({ store }: { store: Store }) {
  const { state } = store;
  const ages = [12, 24, 36, 48, 60, 72, 84, 96, 108, 120];
  const nearest = (c: Child, m: number) => {
    const recs = recordsOf(state, c.id).filter((r) => r.height != null);
    let best: GrowthRecord | undefined;
    let gap = 3; // ±3개월 이내 기록만
    for (const r of recs) {
      const g = Math.abs(ageInMonths(c.birth, r.date) - m);
      if (g <= gap) {
        gap = g;
        best = r;
      }
    }
    return best;
  };
  const rows = ages.filter((m) => state.children.filter((c) => nearest(c, m)).length >= 2);
  if (!rows.length) return null;
  return (
    <div className="card">
      <h2 className="card-title">같은 나이 때 키</h2>
      <table className="tbl">
        <thead>
          <tr>
            <th />
            {state.children.map((c) => <th key={c.id}>{c.avatar} {c.name}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => (
            <tr key={m}>
              <td>{formatAge(m)}</td>
              {state.children.map((c) => {
                const r = nearest(c, m);
                return <td key={c.id} className="num">{r ? `${r.height}cm` : '-'}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------- 설정 ---------------- */

function SettingsTab({ store, child, onEditChild }: { store: Store; child: Child; onEditChild: () => void }) {
  const { state, updateSettings } = store;
  const [key, setKey] = useState(state.settings.claudeApiKey ?? '');

  return (
    <>
      <div className="card">
        <h2 className="card-title">{child.avatar} {child.name}</h2>
        <p className="muted">{child.birth.replaceAll('-', '.')} 출생 · {child.sex === 'M' ? '남아' : '여아'}</p>
        <div className="actions">
          <button className="btn secondary" onClick={onEditChild}>정보 수정</button>
          <button
            className="btn danger"
            onClick={() => {
              if (confirm(`${child.name}의 모든 기록이 지워져요. 계속할까요?`)) store.removeChild(child.id);
            }}
          >
            삭제
          </button>
        </div>
      </div>

      <div className="card">
        <h2 className="card-title">사진 인식 방식</h2>
        <div className="radio-list">
          <label className={state.settings.ocrEngine === 'device' ? 'on' : ''}>
            <input type="radio" checked={state.settings.ocrEngine === 'device'} onChange={() => updateSettings({ ocrEngine: 'device' })} />
            <div>
              <b>기기에서 인식 (기본)</b>
              <p>사진이 밖으로 나가지 않아요. 인쇄된 결과지에 잘 맞아요.</p>
            </div>
          </label>
          <label className={state.settings.ocrEngine === 'claude' ? 'on' : ''}>
            <input type="radio" checked={state.settings.ocrEngine === 'claude'} onChange={() => updateSettings({ ocrEngine: 'claude' })} />
            <div>
              <b>Claude AI로 인식</b>
              <p>손글씨, 기울어진 사진도 잘 읽어요. Anthropic API 키가 필요하고 사진이 Anthropic으로 전송돼요.</p>
            </div>
          </label>
        </div>
        {state.settings.ocrEngine === 'claude' && (
          <div className="field">
            <span>Anthropic API 키</span>
            <div className="row-inline">
              <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="sk-ant-..." autoComplete="off" />
              <button className="btn small" onClick={() => updateSettings({ claudeApiKey: key.trim() || undefined })}>저장</button>
            </div>
            <p className="hint">키는 이 기기에만 저장돼요. 정식 출시 땐 서버를 거쳐 호출하도록 바꿔야 해요.</p>
          </div>
        )}
      </div>

      <div className="card">
        <h2 className="card-title">데이터</h2>
        <div className="actions">
          <button
            className="btn secondary"
            onClick={() => {
              const blob = new Blob([JSON.stringify({ ...state, settings: { ...state.settings, claudeApiKey: undefined } }, null, 2)], { type: 'application/json' });
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = `키린-백업-${today()}.json`;
              a.click();
              URL.revokeObjectURL(a.href);
            }}
          >
            백업 내보내기
          </button>
          <label className="btn secondary">
            불러오기
            <input
              type="file"
              accept="application/json"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                try {
                  const data = JSON.parse(await f.text());
                  if (!Array.isArray(data.children) || !Array.isArray(data.records)) throw new Error();
                  if (confirm('지금 기록을 백업 파일 내용으로 바꿀까요?')) store.replaceAll({ ...data, settings: { ...data.settings, claudeApiKey: state.settings.claudeApiKey } });
                } catch {
                  alert('백업 파일을 읽지 못했어요.');
                }
              }}
            />
          </label>
        </div>
      </div>

      <div className="card about">
        <h2 className="card-title">기준 데이터 안내</h2>
        <p>
          백분위는 <b>WHO 아동 성장 표준(2006, 0~5세)</b>과 <b>WHO 성장 참조치(2007, 5~19세)</b>의 LMS 값으로 계산해요.
          질병관리청 2017 소아청소년 성장도표도 만 3세 미만은 WHO 표준을 그대로 써요.
        </p>
        <p className="hint">이 앱은 건강 관리 참고용이며 의학적 진단을 대신하지 않아요.</p>
      </div>
    </>
  );
}

function hasBatchim(name: string): boolean {
  const ch = name.charCodeAt(name.length - 1);
  if (ch < 0xac00 || ch > 0xd7a3) return false;
  return (ch - 0xac00) % 28 !== 0;
}
