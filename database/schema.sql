-- ============================================================
-- 모노라마 광고 관리 시스템 - MariaDB Schema
-- DB: campaign
-- ============================================================
-- 실행 순서: schema.sql → (이관 시) dump.sql
-- 신규 설치 시 schema.sql 만 실행하면 초기 구조가 생성됩니다.
-- ============================================================

CREATE DATABASE IF NOT EXISTS campaign CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE campaign;

-- ============================================================
-- DB 유저 생성 (초기 설치 시에만 필요 - root 권한으로 실행)
-- .env 의 DB_USER / DB_PASSWORD 와 일치해야 합니다.
-- ============================================================
-- CREATE USER IF NOT EXISTS 'advertiser'@'localhost' IDENTIFIED BY 'your_password';
-- GRANT ALL PRIVILEGES ON campaign.* TO 'advertiser'@'localhost';
-- FLUSH PRIVILEGES;

-- ============================================================
-- 암복호화 함수 (AES-256 ECB + BASE64)
-- ENCRYPT_KEY 는 .env 의 ENCRYPT_KEY 와 동일하게 유지해야 합니다.
-- ============================================================
DROP FUNCTION IF EXISTS fn_encrypt;
DROP FUNCTION IF EXISTS fn_decrypt;

CREATE FUNCTION fn_encrypt(p_data TEXT)
RETURNS TEXT
CHARSET utf8mb4
DETERMINISTIC
RETURN IF(p_data IS NULL OR p_data = '', p_data,
          TO_BASE64(AES_ENCRYPT(p_data, SHA2('change_me_encrypt_key', 256))));

CREATE FUNCTION fn_decrypt(p_data TEXT)
RETURNS TEXT
CHARSET utf8mb4
DETERMINISTIC
RETURN IF(p_data IS NULL OR p_data = '', p_data,
          IF(p_data NOT REGEXP '^[A-Za-z0-9+/]+={0,2}$' OR CHAR_LENGTH(p_data) MOD 4 <> 0,
             p_data,
             COALESCE(
               CONVERT(AES_DECRYPT(FROM_BASE64(p_data), SHA2('change_me_encrypt_key', 256)) USING utf8mb4),
               p_data
             )));

-- ============================================================
-- 광고주 테이블
-- ============================================================
CREATE TABLE IF NOT EXISTS advertisers (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    company_name    VARCHAR(200) NOT NULL COMMENT '회사명',
    business_no     VARCHAR(10)  NOT NULL UNIQUE COMMENT '사업자등록번호(숫자 10자리)',
    ceo_name        TEXT         COMMENT '대표자명(암호화)',
    address1        VARCHAR(500) NOT NULL COMMENT '주소1(암호화)',
    address2        VARCHAR(500) COMMENT '주소2(암호화)',
    postal_code     VARCHAR(10)  NOT NULL COMMENT '우편번호',
    contact_name    TEXT         COMMENT '담당자명(암호화)',
    contact_mobile  TEXT         COMMENT '담당자 모바일(암호화)',
    contact_phone   TEXT         COMMENT '담당자 일반전화(암호화)',
    contact_email   TEXT         COMMENT '담당자 이메일(암호화)',
    email_hash      VARCHAR(64)  NOT NULL UNIQUE COMMENT '이메일 해시(로그인 조회용)',
    password_hash   VARCHAR(255) NOT NULL COMMENT '비밀번호(bcrypt)',
    push_consent    TINYINT(1)   NOT NULL DEFAULT 0 COMMENT 'Push 알림 동의',
    email_consent   TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '이메일 수신 동의',
    terms_consent   TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '이용약관 동의',
    privacy_consent TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '개인정보 동의',
    biz_cert_path   VARCHAR(500) COMMENT '사업자등록증명원 파일경로',
    biz_cert_name   VARCHAR(255) COMMENT '사업자등록증명원 원본파일명',
    status          ENUM('pending','approved','rejected','terminated') NOT NULL DEFAULT 'pending' COMMENT '상태',
    status_reason   TEXT         COMMENT '상태변경 사유',
    bank_account    TEXT         COMMENT '계좌번호(암호화)',
    email_verified              TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '이메일 인증여부',
    password_reset_required     TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '임시비밀번호 사용중(재설정 필요)',
    last_login_ip   VARCHAR(45)  COMMENT '마지막 로그인 IP',
    last_login_at   DATETIME     COMMENT '마지막 로그인 시각',
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB COMMENT='광고주';

-- ============================================================
-- 이메일 인증코드 테이블
-- ============================================================
CREATE TABLE IF NOT EXISTS email_verifications (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    email       VARCHAR(255) NOT NULL COMMENT '인증 대상 이메일',
    code        VARCHAR(6)   NOT NULL COMMENT '6자리 인증코드',
    verified    TINYINT(1)   NOT NULL DEFAULT 0,
    expires_at  DATETIME     NOT NULL,
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB COMMENT='이메일 인증코드';

-- ============================================================
-- 캠페인 일련번호 테이블
-- ============================================================
CREATE TABLE IF NOT EXISTS campaign_sequences (
    seq_date   DATE NOT NULL PRIMARY KEY,
    last_seq   INT  NOT NULL DEFAULT 0
) ENGINE=InnoDB COMMENT='캠페인 ID 일련번호';

-- ============================================================
-- 캠페인 테이블
-- ============================================================
CREATE TABLE IF NOT EXISTS campaigns (
    id              VARCHAR(12)   NOT NULL PRIMARY KEY COMMENT '캠페인ID (yymmdd_dddd)',
    advertiser_id   INT           NOT NULL,
    campaign_name   VARCHAR(300)  NOT NULL COMMENT '캠페인명',
    description     TEXT          COMMENT '캠페인 설명',
    -- 광고물 유형
    has_image       TINYINT(1)    NOT NULL DEFAULT 0,
    has_html        TINYINT(1)    NOT NULL DEFAULT 0,
    has_youtube     TINYINT(1)    NOT NULL DEFAULT 0,
    -- 광고물 URL/경로
    image_url       VARCHAR(1000) COMMENT '이미지 URL',
    image_path      VARCHAR(500)  COMMENT '이미지 파일 경로',
    image_filename  VARCHAR(255)  COMMENT '이미지 원본파일명',
    image_width     INT           COMMENT '이미지 가로(px)',
    image_height    INT           COMMENT '이미지 세로(px)',
    html_url        VARCHAR(1000) COMMENT 'HTML URL',
    html_path       VARCHAR(500)  COMMENT 'HTML 파일 경로',
    html_filename   VARCHAR(255)  COMMENT 'HTML 원본파일명',
    youtube_url     VARCHAR(1000) COMMENT 'YouTube URL',
    -- 광고 기간
    from_date       DATE          NOT NULL COMMENT '광고 시작일',
    to_date         DATE          NOT NULL COMMENT '광고 종료일',
    -- 광고료
    ad_days         INT           NOT NULL DEFAULT 0 COMMENT '광고일수',
    base_fee        DECIMAL(15,0) NOT NULL DEFAULT 0 COMMENT '기본 광고료',
    vat             DECIMAL(15,0) NOT NULL DEFAULT 0 COMMENT '부가세',
    total_fee       DECIMAL(15,0) NOT NULL DEFAULT 0 COMMENT '총 광고료',
    -- 상태
    status          ENUM('입금전','입금확인','광고중','광고종료','취소') NOT NULL DEFAULT '입금전',
    -- 견적서 발송 추적
    quotation_sent_at    DATETIME    COMMENT '견적서 발송 시각',
    quotation_token      VARCHAR(64) COMMENT '견적서 읽음 추적 토큰',
    quotation_read_at    DATETIME    COMMENT '견적서 읽음 시각',
    -- 입금 / 승인
    payment_confirmed_at DATETIME    COMMENT '입금 확인 시각',
    payment_confirmed_by VARCHAR(100) COMMENT '입금 확인자',
    approved_at          DATETIME    COMMENT '승인일(광고중 전환 시각)',
    approved_by          VARCHAR(100) COMMENT '승인자(supervisor 또는 batch)',
    -- 취소
    cancelled_at         DATETIME    COMMENT '취소일',
    cancelled_by         VARCHAR(100) COMMENT '취소자(supervisor, advertiser 또는 batch)',
    -- 기타
    files_backed_up      TINYINT(1)  NOT NULL DEFAULT 0 COMMENT '파일 백업 완료여부',
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (advertiser_id) REFERENCES advertisers(id)
) ENGINE=InnoDB COMMENT='캠페인';

-- ============================================================
-- 세션 테이블
-- ============================================================
CREATE TABLE IF NOT EXISTS sessions (
    session_id    VARCHAR(128) NOT NULL PRIMARY KEY,
    expires       INT UNSIGNED NOT NULL,
    data          MEDIUMTEXT,
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB COMMENT='세션';

-- ============================================================
-- 로그인 이력 테이블
-- ============================================================
CREATE TABLE IF NOT EXISTS login_histories (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    user_type   ENUM('advertiser','supervisor') NOT NULL,
    user_id     VARCHAR(100) NOT NULL COMMENT '광고주 id 또는 supervisor',
    login_ip    VARCHAR(45)  NOT NULL,
    login_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    logout_at   DATETIME     COMMENT '로그아웃 시각',
    session_id  VARCHAR(128) COMMENT '세션 ID'
) ENGINE=InnoDB COMMENT='로그인 이력';

-- ============================================================
-- 이메일 발송 이력 테이블
-- ============================================================
CREATE TABLE IF NOT EXISTS email_logs (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    template_key    VARCHAR(100) NOT NULL COMMENT '템플릿 키',
    to_email        VARCHAR(255) NOT NULL COMMENT '수신자',
    subject         VARCHAR(500) COMMENT '제목',
    campaign_id     VARCHAR(12)  COMMENT '관련 캠페인 ID',
    advertiser_id   INT          COMMENT '관련 광고주 ID',
    status          ENUM('sent','failed') NOT NULL DEFAULT 'sent',
    error_msg       TEXT         COMMENT '발송 실패 메세지',
    sent_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB COMMENT='이메일 발송 이력';

-- ============================================================
-- 이미지 자료실
-- ============================================================
CREATE TABLE IF NOT EXISTS image_library (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    advertiser_id   INT          NOT NULL,
    file_url        VARCHAR(500) NOT NULL,
    file_path       VARCHAR(500) NOT NULL,
    stored_name     VARCHAR(255) NOT NULL,
    original_name   VARCHAR(255) NOT NULL,
    mime_type       VARCHAR(100) NOT NULL,
    file_size       BIGINT       NOT NULL,
    width           INT          NOT NULL,
    height          INT          NOT NULL,
    description     TEXT,
    tags            VARCHAR(500),
    uploaded_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (advertiser_id) REFERENCES advertisers(id) ON DELETE CASCADE,
    INDEX idx_image_library_advertiser_date (advertiser_id, uploaded_at)
) ENGINE=InnoDB COMMENT='광고주 이미지 자료실';

CREATE TABLE IF NOT EXISTS notifications (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    advertiser_id   INT          NOT NULL,
    event_type      VARCHAR(50)  NOT NULL,
    title           VARCHAR(200) NOT NULL,
    message         VARCHAR(1000) NOT NULL,
    campaign_id     VARCHAR(12),
    is_read         TINYINT(1) NOT NULL DEFAULT 0,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    read_at         DATETIME,
    FOREIGN KEY (advertiser_id) REFERENCES advertisers(id) ON DELETE CASCADE,
    INDEX idx_notifications_advertiser_date (advertiser_id, created_at),
    INDEX idx_notifications_unread (advertiser_id, is_read)
) ENGINE=InnoDB COMMENT='광고주 실시간 알림';

CREATE TABLE IF NOT EXISTS supervisor_notifications (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    event_type      VARCHAR(50)   NOT NULL,
    title           VARCHAR(200)  NOT NULL,
    message         VARCHAR(1000) NOT NULL,
    campaign_id     VARCHAR(12),
    advertiser_id   INT,
    is_read         TINYINT(1) NOT NULL DEFAULT 0,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    read_at         DATETIME,
    INDEX idx_supervisor_notifications_date (created_at),
    INDEX idx_supervisor_notifications_unread (is_read)
) ENGINE=InnoDB COMMENT='Supervisor 실시간 알림';

-- ============================================================
-- 시스템 설정 테이블
-- ============================================================
CREATE TABLE IF NOT EXISTS system_config (
    config_key   VARCHAR(100) NOT NULL PRIMARY KEY,
    config_value TEXT         NOT NULL,
    description  VARCHAR(500),
    updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB COMMENT='시스템 설정';

-- ============================================================
-- 기본 시스템 설정 (신규 설치 시 삽입)
-- ============================================================
INSERT INTO system_config (config_key, config_value, description) VALUES
('company_name',     '(주)모노라마',          '회사명'),
('company_ceo',      '김창호',                '대표이사'),
('company_biz_no',   '277-86-00185',          '사업자등록번호'),
('company_bank',     '우리은행',              '은행명'),
('company_account',  '1005-802-852258',       '은행계좌번호'),
('tax_email',        'kimch@monorama.kr',     '세무담당자 이메일'),
('ad_price_per_day', '1000',                  '광고 유형별 1일 광고료(원)'),
('vat_rate',         '0.1',                   '부가세율'),
('supervisor_email', 'kimch@monorama.kr',     'Supervisor 이메일')
ON DUPLICATE KEY UPDATE config_value = VALUES(config_value);

-- ============================================================
-- 인덱스
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_advertisers_status   ON advertisers(status);
CREATE INDEX IF NOT EXISTS idx_advertisers_email    ON advertisers(email_hash);
CREATE INDEX IF NOT EXISTS idx_campaigns_advertiser ON campaigns(advertiser_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status     ON campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaigns_dates      ON campaigns(from_date, to_date);
CREATE INDEX IF NOT EXISTS idx_email_logs_campaign  ON email_logs(campaign_id);
CREATE INDEX IF NOT EXISTS idx_login_hist_user      ON login_histories(user_type, user_id);
