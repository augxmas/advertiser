# 모노라마 광고 관리 시스템 — 개발 이력

> 프로젝트: monorama-advertiser  
> 저장소: https://github.com/augxmas/monorama-advertiser  
> 스택: TypeScript · Node.js · Express · MariaDB

---

## 1. 캠페인 날짜 자동 기록 (supervisor)

**요청**: supervisor에서 캠페인의 입금확인일·승인일·취소일을 관리할 수 있도록 해 달라.

**구현 내용**

- MariaDB `campaigns` 테이블에 4개 컬럼 추가
  - `approved_at` (승인일), `approved_by` (승인자)
  - `cancelled_at` (취소일), `cancelled_by` (취소자)
- 날짜는 사용자가 직접 입력하는 것이 아니라, 해당 의사결정 버튼 클릭 시 자동으로 `NOW()` 기록
  - **입금 확인** 버튼 → `payment_confirmed_at / by` 기록
  - **광고 승인** 버튼 → `approved_at / by` 기록
  - **캠페인 취소** 버튼 → `cancelled_at / by` 기록
- 배치(`batch/campaign-status.ts`)에서 자동 전환 시에도 동일하게 기록
- 관리자 캠페인 Grid에 입금확인일·승인일·취소일 컬럼 추가 (읽기 전용 표시)
- 캠페인 상세 overlay에서도 해당 일시 표시

**수정 파일**

| 파일 | 변경 내용 |
|------|-----------|
| `database/schema.sql` | 컬럼 4개 추가 마이그레이션 |
| `src/routes/admin.ts` | `PUT /campaigns/:id/payment`, `/approve`, `/cancel` 엔드포인트 수정 |
| `batch/campaign-status.ts` | 배치 전환 시 날짜 자동 기록 |
| `public/admin/dashboard.html` | Grid 컬럼 추가, 버튼 연결 |

---

## 2. 광고주 대시보드 개선

**요청**: 상단 상태별 카드 숫자 클릭 시 캠페인 목록 필터링, 이미지·HTML·YouTube 컬럼에 미리보기 버튼, 조회 조건에 상태 값 추가.

**구현 내용**

- 상태별 통계 카드(전체·입금전·입금확인·광고중·광고종료·취소) 클릭 시 목록 자동 필터링
  - 카드에 hover 효과, 활성 카드에 테두리 강조
- 이미지·HTML·YouTube 컬럼에 미리보기 버튼 추가
  - 이미지: 🔍 버튼 클릭 → overlay 팝업 (width·height 반영)
  - HTML: 🔍 버튼 클릭 → iframe overlay
  - YouTube: ▶ 버튼 클릭 → embed overlay
  - URL을 `encodeURIComponent`로 감싸 onclick 속성 주입 오류 방지
- 검색 toolbar에 **상태** select 추가
- 초기화 버튼 클릭 시 상태 필터도 함께 초기화

**수정 파일**

| 파일 | 변경 내용 |
|------|-----------|
| `src/routes/campaign.ts` | GET 캠페인 목록 / 엑셀 다운로드에 `status` 쿼리 파라미터 추가 |
| `public/dashboard.html` | stat-card 클릭 필터, 미리보기 버튼, 상태 select |

---

## 3. 견적서 이메일 개선

**요청**: 견적서에 주소·업태·업종 포함, 관리자 Grid에 견적서 확인 상태 컬럼 추가, 광고주 Grid에서는 제거.

**구현 내용**

- 견적서 이메일에 회사 정보 항목 추가
  - 주소: `서울특별시 강서구 마곡중앙로 143 B동 339호`
  - 업태: `서비스`
  - 업종: `컴퓨터 프로그램 개발 및 공급`
- 관리자(supervisor) 캠페인 Grid에 **견적서 수신** 컬럼 추가
  - `미발송` / `미확인` / `✓확인` 3단계 상태 표시
- 광고주(advertiser) 캠페인 Grid에서 견적서 확인 컬럼 제거
- `.env`에 `COMPANY_ADDRESS`, `COMPANY_BIZ_TYPE`, `COMPANY_BIZ_CATEGORY` 추가

**수정 파일**

| 파일 | 변경 내용 |
|------|-----------|
| `src/services/campaign.service.ts` | `buildQuotationVars`에 주소·업태·업종 변수 추가 |
| `email-templates.json` | `quotation_advertiser`, `quotation_updated_advertiser` 템플릿에 항목 추가 |
| `.env` | 회사 정보 3개 환경변수 추가 |
| `public/admin/dashboard.html` | 견적서 수신 컬럼 추가 |
| `public/dashboard.html` | 견적서 확인 컬럼 제거 |

---

## 4. 관리자 통계 쿼리 수정

**요청**: 광고비 현황·광고 매출 상위 5·캠페인 등록 상위 5가 실제 데이터와 맞지 않음.

**원인 분석**

- `LEFT JOIN` 사용으로 캠페인 0건인 광고주도 랭킹에 포함됨
- 매출 쿼리의 `campaign_count`가 취소 캠페인을 포함하여 집계됨

**수정 내용**

- `LEFT JOIN` → `INNER JOIN` 으로 변경
- `HAVING revenue > 0` / `HAVING campaign_count > 0` 조건 추가
- 취소 캠페인 제외: `WHERE c.status <> '취소'`
- 매출 합산: `SUM(CASE WHEN c.status IN ('입금확인','광고중','광고종료') THEN c.total_fee ELSE 0 END)`

**수정 파일**

| 파일 | 변경 내용 |
|------|-----------|
| `src/routes/admin.ts` | 매출 상위 5·캠페인 등록 상위 5 쿼리 수정 |

---

## 5. 관리자 캠페인 Grid 미디어 컬럼 개선

**요청**: 이미지·HTML·YouTube 컬럼에 미리보기 버튼과 URL 표시, URL 복사 아이콘 추가.

**구현 내용**

- 각 컬럼 너비 200px로 확장
- 셀 구성: `[미리보기 버튼] [URL 텍스트(28자 truncate)] [📋 복사 아이콘]`
  - 이미지: 🔍 버튼, width·height 반영 팝업
  - HTML: 🔍 버튼, iframe 팝업
  - YouTube: ▶(빨간색) 버튼, embed 팝업
- 복사 아이콘 클릭 시 `navigator.clipboard.writeText()` + 토스트 알림
- `event.stopPropagation()`으로 Row 더블클릭 이벤트와 충돌 방지

**수정 파일**

| 파일 | 변경 내용 |
|------|-----------|
| `public/admin/dashboard.html` | 이미지·HTML·YouTube 컬럼 렌더러 전면 교체 |

---

## 6. 엑셀 다운로드 버그 수정

**증상**: 엑셀 다운로드 클릭 시 `TypeError: r.from_date?.split is not a function` 오류 발생.

**원인**: MariaDB `DATE` 컬럼이 JS `Date` 객체로 반환되는데 `.split()`을 문자열로 간주하여 호출.

**수정 내용**

```ts
// 수정 전
from_date: r.from_date?.split('T')[0] || r.from_date

// 수정 후
from_date: r.from_date instanceof Date
  ? r.from_date.toISOString().slice(0, 10)
  : (typeof r.from_date === 'string' ? r.from_date.split('T')[0] : r.from_date)
```

**수정 파일**

| 파일 | 변경 내용 |
|------|-----------|
| `src/routes/admin.ts` | 엑셀 날짜 포맷 처리 분기 추가 |

---

## 7. Favicon 추가

**요청**: 시스템에 적용할 favicon 이미지를 만들고 적용해 달라.

**구현 내용**

- 디자인: 파란색(`#2563eb`) 둥근 정사각형 배경 + 흰색 굵은 **M** (모노라마 이니셜)
- 외부 라이브러리 없이 순수 Node.js(`zlib` 내장)로 PNG·ICO 생성
  - `scripts/gen-favicon.js`: 두꺼운 선 픽셀 렌더러 + CRC32 + PNG 인코더 + ICO 패커
- 생성 파일: `public/favicon.svg`, `public/favicon.png`, `public/favicon.ico`
- 5개 HTML 파일 전체에 `<link>` 태그 적용
  - SVG(modern) → PNG(fallback) → ICO(legacy) 순서로 선언

**수정 파일**

| 파일 | 변경 내용 |
|------|-----------|
| `public/favicon.svg` | 신규 생성 |
| `public/favicon.png` | 신규 생성 (스크립트로 생성) |
| `public/favicon.ico` | 신규 생성 (스크립트로 생성) |
| `scripts/gen-favicon.js` | 신규 생성 |
| `public/index.html` 외 4개 | favicon link 태그 추가 |

---

## 8. GitHub 저장소 생성 및 초기 Push

**요청**: GitHub에 repository를 만들고 지금까지의 작업을 commit & push.

**작업 내용**

- GitHub REST API로 비공개 저장소 생성: `augxmas/monorama-advertiser`
- `.gitignore` 작성
  - 제외 항목: `.env`, `node_modules/`, `dist/`, `uploads/`, `.claude/`
  - 포함 항목: `.env.example`
- 33개 파일, 9,443줄 초기 커밋

---

## 9. DB 이관 패키지

**요청**: advertise 인스턴스를 다른 DB에 이관할 수 있게 준비하여 형상관리에 올려 달라.

**구현 내용**

- `database/schema.sql` 정리 및 개선
  - 기존 `ALTER TABLE` 패치를 원본 `CREATE TABLE`에 통합
  - `CREATE INDEX IF NOT EXISTS`로 멱등성 확보
  - 최종 컬럼 구조(approved_at/by, cancelled_at/by 포함) 반영
- `database/dump.sql` 생성
  - `mysqldump`로 현재 운영 DB 전체 스냅샷 (스키마 + 데이터 + 함수 포함, 26KB)
- `database/MIGRATION.md` 작성
  - A. 신규 서버 이관 절차 (DB 생성 → dump 적용 → 검증)
  - B. 클린 설치 절차 (schema.sql만 적용)
  - C. dump.sql 갱신 방법 (Windows/Linux 명령어)
  - D. 암복호화 키 변경 시 주의사항
- `.env.example` 작성 (민감정보 없는 환경변수 템플릿)

**신규 파일**

| 파일 | 내용 |
|------|------|
| `database/schema.sql` | 완전한 DDL (개선) |
| `database/dump.sql` | 운영 DB 전체 스냅샷 |
| `database/MIGRATION.md` | 이관 절차 가이드 |
| `.env.example` | 환경변수 템플릿 |

---

## 10. npm 보안 취약점 패치

**요청**: `npm audit fix` 실행.

**취약점 현황 (수정 전)**

| 패키지 | 버전 | 취약점 |
|--------|------|--------|
| `nodemailer` | 6.9.9 | SMTP command injection, DoS, 도메인 오해석 (4건) |
| `tar` | 6.2.1 (via bcrypt) | 경로탐색, 파일 덮어쓰기, 심링크 악용 (6건) |
| 합계 | | **17건** (high 14, moderate 2, low 1) |

**해결 방법**

- `nodemailer` 6.9.9 → **8.0.7** 업그레이드 (TypeScript 컴파일 오류 없음 확인)
- `bcrypt` 5.1.1 → **6.0.0** 업그레이드
  - v6에서 `@mapbox/node-pre-gyp` → `node-gyp-build`로 교체
  - tar 의존성 자체가 제거되어 관련 취약점 일괄 해소
- 수정 후 취약점: **0건**

---

## 부록: 캠페인 상태 흐름

```
입금전
  │
  ├─[입금확인 버튼 / 배치] → 입금확인
  │                              │
  │                              ├─[광고 승인 버튼] → 광고중
  │                              │                       │
  │                              │              [기간 만료 / 배치] → 광고종료
  │                              │
  └─[기간 초과 / 배치] ──────────┴─[취소 버튼] → 취소
```

## 부록: 주요 파일 구조

```
advertiser/
├── src/
│   ├── server.ts
│   ├── routes/
│   │   ├── admin.ts       # supervisor API
│   │   ├── campaign.ts    # advertiser 캠페인 API
│   │   └── auth.ts
│   ├── services/
│   │   ├── campaign.service.ts   # 견적서, 가격 계산
│   │   └── email.service.ts      # 이메일 발송 (nodemailer)
│   ├── middleware/
│   │   ├── auth.ts        # requireSupervisor / requireAdvertiser
│   │   └── upload.ts      # multer 파일 업로드
│   └── config/
│       └── database.ts    # mysql2 connection pool
├── batch/
│   └── campaign-status.ts # 캠페인 상태 자동 전환 배치
├── public/
│   ├── index.html         # 광고주 로그인
│   ├── register.html      # 광고주 회원가입
│   ├── dashboard.html     # 광고주 대시보드 (broadsheet-app)
│   ├── profile.html       # 광고주 내 정보 수정 (broadsheet-app)
│   ├── admin/
│   │   ├── index.html     # supervisor 로그인
│   │   └── dashboard.html # supervisor 대시보드
│   ├── css/common.css        # 구 스킨 — supervisor 화면
│   ├── css/broadsheet.css    # 공개·진입 페이지 (home·index·register·404·500)
│   ├── css/broadsheet-app.css # 로그인 이후 업무 화면 (dashboard·profile)
│   │                          # ↑ 두 broadsheet 파일은 같은 페이지에서 함께 쓰지 않는다
│   ├── js/
│   │   ├── grid.js        # DataGrid 컴포넌트
│   │   ├── alert.js       # MxAlert 토스트/모달
│   │   └── session.js
│   └── favicon.svg / .png / .ico
├── database/
│   ├── schema.sql         # DDL (테이블·함수·인덱스)
│   ├── dump.sql           # 운영 DB 스냅샷 (이관용)
│   └── MIGRATION.md       # 이관 절차 가이드
├── scripts/
│   └── gen-favicon.js     # favicon PNG/ICO 생성기
├── email-templates.json   # 이메일 템플릿 (견적서·승인·취소 등)
├── .env.example           # 환경변수 템플릿
└── package.json
```
