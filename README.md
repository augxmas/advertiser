# 모노라마 광고 관리 시스템

## 설치 및 실행

### 1. 패키지 설치
```bash
npm install
```

### 2. MariaDB 설정
MariaDB에 campaign 데이터베이스와 advertiser 계정을 생성합니다:

```sql
-- root 계정으로 실행
CREATE DATABASE IF NOT EXISTS campaign CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'advertiser'@'localhost' IDENTIFIED BY 'Adv2rt!ser';
GRANT ALL PRIVILEGES ON campaign.* TO 'advertiser'@'localhost';
FLUSH PRIVILEGES;
```

### 3. 스키마 생성
```bash
mysql -u advertiser -p'Adv2rt!ser' campaign < database/schema.sql
```

### 4. 개발 서버 실행
```bash
npm run dev
```

### 5. 접속
- 광고주: http://localhost:3000
- 관리자: http://localhost:3000/admin

## 계정 정보
- 관리자: supervisor / sup2rv!sor

## 배치 실행
```bash
# 수동 실행
npm run batch

# crontab 자동 등록 (Linux/Mac)
chmod +x batch/setup-crontab.sh
./batch/setup-crontab.sh
```

## 광고료 계산
- 광고물 유형별(이미지/HTML/YouTube) 각 1,000원/일
- 부가세 10% 별도
- 예) 이미지+YouTube, 30일: 2 × 30 × 1,000 = 60,000원 + 부가세 6,000원 = 66,000원

## 캠페인 ID 형식
- yymmdd_dddd (예: 260518_0001)

## 암호화
- 이름, 이메일, 연락처, 계좌번호: MariaDB fn_encrypt/fn_decrypt 함수 (AES-256 + BASE64)
- 비밀번호: bcrypt (cost factor 12)

## 이메일 발송 시나리오
- email-templates.json에 모든 템플릿 정의
- {{변수명}} 형식으로 치환
