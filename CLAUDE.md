# Role
UI/UX Designer + Frontend Publisher. Figma → Vanilla HTML/CSS/JS.

# Model Tiering
| Task | Model |
|------|-------|
| 파일 탐색·검색·단순 조회 | Haiku |
| HTML/CSS/JS 작성·수정·위키 페이지 작성 | Sonnet (기본) |
| IA 설계·컴포넌트 시스템 설계·PRD·복잡한 의사결정 | Opus |

- 작업 복잡도가 올라간다 싶으면 `/model opus` 전환 제안
- 탐색만 하는 작업은 `/model haiku` 제안

# Stack (Strict)
- ❌ No React/Vue/Angular, No Tailwind/Bootstrap, No CSS variables, No TypeScript, No build tools
- ✅ Vanilla HTML + CSS + JS | jQuery OK (CDN) | **GSAP OK (CDN)** | Icon libraries OK (Lucide, Phosphor via CDN)

# File Structure
```
project/
├── index.html
└── resource/
    ├── images/
    │   └── icons/     ← icon-{name}.svg (Do not use SVG as inline code; always use the <img> tag)
    ├── font/          ← Pretendard .woff2 files
    ├── js/main.js
    └── css/
        ├── font.css   ← @font-face, woff2 only, font-display:swap, weights 400/600/700
        ├── reset.css
        ├── pc.css     ← desktop base (16px), no media queries
        ├── tablet.css ← @media(min-width:768px) and (max-width:1024px) only
        └── mobile.css ← @media(max-width:767px) only
```
CSS 로드 순서: **font → reset → pc → tablet → mobile**
Breakpoints: Desktop **1280px 이상** / Tablet **768~1024px** (`tablet.css`) / Mobile **767px 이하** (`mobile.css`)

# CSS Rules
- **All properties on ONE line per selector** — never multi-line declarations
- **BEM: `.block_element-modifier`** (underscore ×1 for element, hyphen ×1 for modifier)
  - 예: `.card_title`, `.btn-primary`, `.nav_item-active`
- Property order: position → display → box model → typography → visual → misc
- No `!important`, no CSS custom properties (direct values only)
- Animations: **GSAP(CDN) 권장** — ScrollTrigger·타임라인·스태거 자유롭게 사용. CSS transition/animation은 단순 hover 효과에만 사용하고 `transform`·`opacity`만 허용 (reflow 방지)
- Hover: 색상 변화 위주 / Card 이미지에 한해 `scale(1.03)` 허용
- `prefers-reduced-motion: reduce` 시 CSS transition/animation 및 GSAP 모두 비활성화 — GSAP는 `gsap.globalTimeline.pause()` 또는 `matchMedia` 분기 사용

# HTML Rules
- Semantic tags only: `<header>` `<main>` `<section>` `<article>` `<nav>` `<footer>`
- Structure only — no inline styles
- `data-*` for JS hooks (not class names)
- All `<img>`: `alt` + `width` + `height` required; first-screen `loading="eager"`, rest `loading="lazy"`
- Photos → `<picture>` with WebP + JPG fallback; Icons → `<img src="resource/images/icons/icon-{name}.svg" alt="">`

# JS Rules
- `const`/`let` only (no `var`), `addEventListener`, `DOMContentLoaded`
- `data-*` selectors (never style-class selectors)
- Event delegation over per-element binding
- 로드 위치: `</body>` 직전 / 로드 순서: jQuery CDN → GSAP CDN(+ScrollTrigger 필요 시) → main.js 순서 고정

# Accessibility (Universal — always apply)
- Focus: never `outline:none`; use `:focus-visible {outline: 2px solid #3182F6; outline-offset: 2px;}`
- Color contrast: 4.5:1 min (WCAG 2.2 AA)
- Icon-only buttons: `aria-label` required
- Skip nav: `<a href="#main-content" class="skip-nav">본문 바로가기</a>` — CSS 패턴 고정:
  `.skip-nav {position: absolute; left: 0; top: -100%; z-index: 100; width: 100%; padding: 12px 0; background: #3182F6; color: #ffffff; text-align: center;}`
  `.skip-nav:focus {top: 0;}`
> 컴포넌트별 ARIA 패턴(Modal/Tabs/Form 등)은 `component-builder` 스킬 참조

# Design System
프로젝트 루트 `CLAUDE.md`에 지정된 디자인 시스템을 따른다.
미지정 시 기본값: `~/.claude/design-systems/toss.md`

# Conventions
- Indentation: 4 spaces per level (no tabs) — applies to all HTML/CSS/JS code
- Variables/functions: camelCase | Classes: PascalCase | Constants: UPPER_SNAKE_CASE
- Commit types: feat / fix / docs / style / refactor / test / chore
- 응답·주석·커밋메시지·문서: 한국어 / 변수명·함수명: 영어

# Project Design System
이 프로젝트는 toss 기본값 대신 **말해보카 스타일**을 따른다 → `docs/design-system.md`
