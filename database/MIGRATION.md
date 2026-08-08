# DB 이관 가이드

## 파일 구성

| 파일 | 용도 |
|------|------|
| `schema.sql` | 전체 DDL (테이블, 함수, 인덱스, 초기 설정값) |
| `backups/campaign-schema-YYYYMMDD-HHMMSS.sql` | 공개 저장소용 날짜별 스키마 백업 |

개인정보가 포함된 전체 DB 백업(`campaign-full-*.sql`)은 로컬과 운영 서버에만 보관하며 Git에서 제외합니다.

---

## A. 신규 서버에 DB 구축 (이관)

### 1. MariaDB 설치 확인
```bash
mariadb --version   # 10.5 이상 권장
```

### 2. DB 및 유저 생성 (root 권한)
```sql
CREATE DATABASE IF NOT EXISTS campaign
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'advertiser'@'localhost'
  IDENTIFIED BY 'your_db_password';

GRANT ALL PRIVILEGES ON campaign.* TO 'advertiser'@'localhost';
FLUSH PRIVILEGES;
```
> `.env` 의 `DB_USER` / `DB_PASSWORD` 와 동일한 값을 사용하세요.

### 3. 스키마 이관
공개용 스키마를 적용합니다.
```bash
mariadb -h localhost -u advertiser -p campaign < database/schema.sql
```

### 4. 검증
```sql
USE campaign;
SHOW TABLES;
SELECT COUNT(*) FROM advertisers;
SELECT COUNT(*) FROM campaigns;
SELECT fn_encrypt('test');   -- 암복호화 함수 동작 확인
```

---

## B. 빈 DB에 스키마만 설치 (개발 환경 / 클린 설치)

```bash
mariadb -h localhost -u advertiser -p campaign < database/schema.sql
```

초기 데이터 없이 스키마와 시스템 기본값(system_config)만 생성됩니다.

---

## C. 운영 DB 백업 방법

운영 DB 전체 백업에는 개인정보가 포함되므로 공개 저장소에 커밋하지 않습니다.

```bash
# Windows (MariaDB 설치 경로에 맞게 조정)
"C:\Program Files\MariaDB 12.2\bin\mysqldump.exe" \
  -h localhost -u advertiser -p \
  --default-character-set=utf8mb4 \
  --complete-insert --add-drop-table \
  --routines --triggers \
  --databases campaign > database/backups/campaign-full-YYYYMMDD-HHMMSS.sql

# Linux / macOS
mysqldump -h localhost -u advertiser -p \
  --default-character-set=utf8mb4 \
  --complete-insert --add-drop-table \
  --routines --triggers \
  --databases campaign > database/backups/campaign-full-YYYYMMDD-HHMMSS.sql
```

---

## D. 암복호화 키 변경 시 주의사항

`ENCRYPT_KEY` (`.env`) 와 `schema.sql` 의 `fn_encrypt` / `fn_decrypt` 함수 내
`SHA2('...', 256)` 인자는 **반드시 동일**해야 합니다.

키를 변경하면 기존에 암호화된 컬럼(이메일, 담당자명 등) 데이터를 읽을 수 없습니다.
기존 데이터가 있는 경우 반드시 재암호화 절차를 수행하세요.

---

## E. 환경 변수 설정

```bash
cp .env.example .env
# .env 를 열어 각 항목 입력
```

주요 체크 항목:
- `DB_HOST` / `DB_PORT` / `DB_NAME` / `DB_USER` / `DB_PASSWORD`
- `SESSION_SECRET` — 무작위 32자 이상 문자열
- `ENCRYPT_KEY` — 기존 DB와 **동일한 값** 유지
- `SMTP_*` — 이메일 발송 설정
- `SUPERVISOR_PASSWORD` — supervisor 로그인 비밀번호
