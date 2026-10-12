export type Mood = 'happy' | 'wow' | 'think' | 'sleep';

/** 마스코트 '키린' — 키가 쑥쑥 자라는 아기 기린 */
export function Mascot({ mood = 'happy', size = 120 }: { mood?: Mood; size?: number }) {
  const eye =
    mood === 'sleep' ? (
      <>
        <path d="M44 62 q5 4 10 0" stroke="#3b2a1a" strokeWidth="3" fill="none" strokeLinecap="round" />
        <path d="M70 62 q5 4 10 0" stroke="#3b2a1a" strokeWidth="3" fill="none" strokeLinecap="round" />
      </>
    ) : mood === 'happy' ? (
      <>
        <path d="M44 64 q5 -7 10 0" stroke="#3b2a1a" strokeWidth="3.5" fill="none" strokeLinecap="round" />
        <path d="M70 64 q5 -7 10 0" stroke="#3b2a1a" strokeWidth="3.5" fill="none" strokeLinecap="round" />
      </>
    ) : (
      <>
        <circle cx="49" cy="62" r={mood === 'wow' ? 6 : 5} fill="#3b2a1a" />
        <circle cx="75" cy="62" r={mood === 'wow' ? 6 : 5} fill="#3b2a1a" />
        <circle cx="51" cy="60" r="1.8" fill="#fff" />
        <circle cx="77" cy="60" r="1.8" fill="#fff" />
      </>
    );
  const mouth =
    mood === 'wow' ? (
      <ellipse cx="62" cy="84" rx="5" ry="6" fill="#7a3b2e" />
    ) : mood === 'think' ? (
      <path d="M56 85 q6 -3 12 0" stroke="#7a3b2e" strokeWidth="3" fill="none" strokeLinecap="round" />
    ) : (
      <path d="M54 81 q8 9 16 0" stroke="#7a3b2e" strokeWidth="3" fill="#ff8e8e" strokeLinecap="round" />
    );
  return (
    <svg width={size} height={size} viewBox="0 0 124 124" aria-hidden className={`mascot mascot-${mood}`}>
      {/* 뿔 */}
      <line x1="46" y1="22" x2="44" y2="10" stroke="#e0a43a" strokeWidth="5" strokeLinecap="round" />
      <line x1="78" y1="22" x2="80" y2="10" stroke="#e0a43a" strokeWidth="5" strokeLinecap="round" />
      <circle cx="44" cy="9" r="6" fill="#b5651d" />
      <circle cx="80" cy="9" r="6" fill="#b5651d" />
      {/* 귀 */}
      <ellipse cx="22" cy="40" rx="13" ry="7" fill="#ffc94d" transform="rotate(-25 22 40)" />
      <ellipse cx="102" cy="40" rx="13" ry="7" fill="#ffc94d" transform="rotate(25 102 40)" />
      {/* 얼굴 */}
      <path d="M62 18 C94 18 102 44 102 66 C102 98 84 112 62 112 C40 112 22 98 22 66 C22 44 30 18 62 18 Z" fill="#ffd166" />
      <circle cx="40" cy="36" r="6" fill="#f4a93b" opacity=".7" />
      <circle cx="86" cy="42" r="7" fill="#f4a93b" opacity=".7" />
      <circle cx="30" cy="80" r="5" fill="#f4a93b" opacity=".6" />
      {/* 주둥이 */}
      <ellipse cx="62" cy="88" rx="26" ry="19" fill="#fff1c9" />
      <circle cx="54" cy="81" r="2.2" fill="#b5651d" />
      <circle cx="70" cy="81" r="2.2" fill="#b5651d" />
      {eye}
      {mouth}
      <ellipse cx="36" cy="76" rx="7" ry="4.5" fill="#ff9aa2" opacity=".75" />
      <ellipse cx="88" cy="76" rx="7" ry="4.5" fill="#ff9aa2" opacity=".75" />
    </svg>
  );
}

export function Speech({ children, mood = 'happy', size = 84 }: { children: React.ReactNode; mood?: Mood; size?: number }) {
  return (
    <div className="speech-row">
      <Mascot mood={mood} size={size} />
      <div className="bubble">{children}</div>
    </div>
  );
}
