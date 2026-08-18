/**
 * ⚠️ 개발/테스트 전용 시드 스크립트 — 운영 DB에서 실행 금지
 *
 * 로그인 화면을 테스트할 광고주 계정을 하나 만든다.
 * 회원가입(이메일 인증 → 관리자 승인)을 거치지 않고 바로
 * status='approved' 상태의 계정을 넣는다.
 *
 *   실행:  node scripts/seed-dev-advertiser.js
 *
 * 생성되는 계정
 *   사업자등록번호  123-45-67890
 *   이메일          test@monorama.kr
 *   비밀번호        Test1234!
 *
 * ─────────────────────────────────────────────────────────────
 * 나중에 실제 데이터를 넣기 시작하면 이 계정과 파일을 함께 지운다.
 *
 *   DELETE FROM advertisers WHERE business_no = '1234567890';
 *   rm scripts/seed-dev-advertiser.js
 * ─────────────────────────────────────────────────────────────
 *
 * 비밀번호 해시는 앱과 같은 bcrypt 모듈로, email_hash 는
 * src/routes/auth.ts 의 hashEmail() 과 같은 방식(sha256)으로 만든다.
 * 둘 중 하나라도 방식이 어긋나면 로그인이 되지 않는다.
 */
require('dotenv').config();
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const mysql = require('mysql2/promise');

const ACCOUNT = {
  company_name: '(주)테스트광고주',
  business_no: '1234567890',          // 숫자 10자리 (화면 표기: 123-45-67890)
  ceo_name: '홍길동',
  address1: '서울특별시 강남구 영동대로71길 16',
  address2: '3층',
  postal_code: '06187',
  contact_name: '김테스트',
  contact_mobile: '010-1234-5678',
  contact_phone: '02-1234-5678',
  contact_email: 'test@monorama.kr',
  password: 'Test1234!',              // 대소문자 + 숫자 + 특수문자 8자 이상
};

const hashEmail = email => crypto.createHash('sha256').update(email.toLowerCase().trim()).digest('hex');

(async () => {
  const pool = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    database: process.env.DB_NAME || 'campaign',
    user: process.env.DB_USER || 'advertiser',
    password: process.env.DB_PASSWORD || '',
    charset: 'utf8mb4',
  });

  const emailHash = hashEmail(ACCOUNT.contact_email);
  const passwordHash = await bcrypt.hash(ACCOUNT.password, 10);

  // 여러 번 실행해도 계정이 늘어나지 않도록 기존 것을 지우고 다시 넣는다.
  const [existing] = await pool.execute(
    'SELECT id FROM advertisers WHERE email_hash = ? OR business_no = ?',
    [emailHash, ACCOUNT.business_no]
  );
  if (existing.length) {
    await pool.execute('DELETE FROM advertisers WHERE email_hash = ? OR business_no = ?', [emailHash, ACCOUNT.business_no]);
    console.log(`[seed] 기존 테스트 계정 ${existing.length}건 삭제`);
  }

  const [result] = await pool.execute(
    `INSERT INTO advertisers
       (company_name, business_no, ceo_name, address1, address2, postal_code,
        contact_name, contact_mobile, contact_phone, contact_email, email_hash, password_hash,
        push_consent, email_consent, terms_consent, privacy_consent,
        status, email_verified)
     VALUES (?,?,fn_encrypt(?),fn_encrypt(?),fn_encrypt(?),?,
             fn_encrypt(?),fn_encrypt(?),fn_encrypt(?),fn_encrypt(?),?,?,
             1,1,1,1,
             'approved',1)`,
    [
      ACCOUNT.company_name, ACCOUNT.business_no, ACCOUNT.ceo_name,
      ACCOUNT.address1, ACCOUNT.address2, ACCOUNT.postal_code,
      ACCOUNT.contact_name, ACCOUNT.contact_mobile, ACCOUNT.contact_phone,
      ACCOUNT.contact_email, emailHash, passwordHash,
    ]
  );

  console.log(`[seed] 광고주 계정 생성 완료 (id=${result.insertId})`);
  console.log('');
  console.log('  사업자등록번호  123-45-67890');
  console.log(`  이메일          ${ACCOUNT.contact_email}`);
  console.log(`  비밀번호        ${ACCOUNT.password}`);
  console.log('');
  await pool.end();
})().catch(error => {
  console.error('[seed] 실패:', error.message);
  process.exit(1);
});
