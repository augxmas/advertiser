import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import { randomUUID as uuidv4 } from 'crypto';
import pool from '../config/database';
import { sendEmail, getSystemVars } from '../services/email.service';
import { generateVerificationCode } from '../utils/id-generator';
import { uploadBizCert } from '../middleware/upload';
import crypto from 'crypto';

const router = Router();

function getClientIp(req: Request): string {
  return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '');
}

function hashEmail(email: string): string {
  return crypto.createHash('sha256').update(email.toLowerCase().trim()).digest('hex');
}

// 개발/테스트용 마스터 인증코드
// DEV_MASTER_CODE 가 설정되어 있고 운영 환경이 아닐 때만 동작한다.
function getMasterCode(): string | null {
  if (process.env.NODE_ENV === 'production') return null;
  const code = String(process.env.DEV_MASTER_CODE || '').trim();
  return code ? code : null;
}

function generateTempPassword(): string {
  const upper   = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lower   = 'abcdefghijklmnopqrstuvwxyz';
  const digits  = '0123456789';
  const special = '!@#$%^&*';
  const all     = upper + lower + digits + special;
  const rand    = (s: string) => s[Math.floor(Math.random() * s.length)];
  const pw: string[] = [rand(upper), rand(lower), rand(digits), rand(special)];
  for (let i = 0; i < 4; i++) pw.push(rand(all));
  for (let i = pw.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pw[i], pw[j]] = [pw[j], pw[i]];
  }
  return pw.join('');
}

// 이메일 인증코드 발송
router.post('/send-verification', async (req: Request, res: Response) => {
  const { email, contact_name } = req.body;
  if (!email) return res.status(400).json({ error: '이메일을 입력하세요.' });

  const code = generateVerificationCode();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await pool.execute(
    `INSERT INTO email_verifications (email, code, expires_at) VALUES (?, ?, ?)`,
    [email, code, expiresAt]
  );

  try {
    await sendEmail({
      templateKey: 'email_verification',
      to: email,
      vars: { contact_name: contact_name || '담당자', code },
    });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: '인증코드 발송 실패: ' + e.message });
  }
});

// 인증코드 확인
router.post('/verify-code', async (req: Request, res: Response) => {
  const { email, code } = req.body;
  if (!email || !code) return res.status(400).json({ error: '이메일과 인증코드를 입력하세요.' });

  // 마스터 코드는 발송된 코드와 무관하게 즉시 인증 처리한다.
  const masterCode = getMasterCode();
  if (masterCode && String(code).trim() === masterCode) {
    await pool.execute(
      `INSERT INTO email_verifications (email, code, verified, expires_at)
       VALUES (?, ?, 1, DATE_ADD(NOW(), INTERVAL 10 MINUTE))`,
      [email, masterCode]
    );
    console.log('[dev] 마스터 코드로 이메일 인증 통과:', email);
    return res.json({ ok: true, master: true });
  }

  const [rows] = await pool.execute<any[]>(
    `SELECT * FROM email_verifications
     WHERE email = ? AND code = ? AND verified = 0 AND expires_at > NOW()
     ORDER BY id DESC LIMIT 1`,
    [email, code]
  );
  if (!rows.length) return res.status(400).json({ error: '인증코드가 올바르지 않거나 만료되었습니다.' });

  await pool.execute(`UPDATE email_verifications SET verified = 1 WHERE id = ?`, [rows[0].id]);
  res.json({ ok: true });
});

// 광고주 회원가입
router.post('/register', uploadBizCert.single('biz_cert'), async (req: Request, res: Response) => {
  const {
    company_name, business_no, ceo_name, address1, address2, postal_code,
    contact_name, contact_mobile, contact_phone, contact_email,
    password, push_consent, email_consent, terms_consent, privacy_consent,
  } = req.body;
  const normalizedBusinessNo = String(business_no || '').replace(/\D/g, '');

  if (!/^\d{10}$/.test(normalizedBusinessNo)) {
    return res.status(400).json({ error: '사업자등록번호는 숫자 10자리로 입력하세요.' });
  }

  if (!terms_consent || !privacy_consent) {
    return res.status(400).json({ error: '이용약관 및 개인정보 동의가 필요합니다.' });
  }

  // 이메일 인증 확인
  const [verified] = await pool.execute<any[]>(
    `SELECT id FROM email_verifications WHERE email = ? AND verified = 1 ORDER BY id DESC LIMIT 1`,
    [contact_email]
  );
  if (!verified.length) return res.status(400).json({ error: '이메일 인증이 필요합니다.' });

  // 비밀번호 검증
  const pwPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
  if (!pwPattern.test(password)) {
    return res.status(400).json({ error: '비밀번호는 대소문자, 숫자, 특수문자를 포함한 8자리 이상이어야 합니다.' });
  }

  const emailHash = hashEmail(contact_email);

  // 중복 확인
  const [dup] = await pool.execute<any[]>(
    'SELECT id FROM advertisers WHERE email_hash = ? OR business_no = ?',
    [emailHash, normalizedBusinessNo]
  );
  if (dup.length) return res.status(400).json({ error: '이미 등록된 이메일 또는 사업자등록번호입니다.' });

  const passwordHash = await bcrypt.hash(password, 12);
  const bizCertPath = req.file ? req.file.path : null;
  const bizCertName = req.file ? req.file.originalname : null;

  const [result] = await pool.execute<any>(
    `INSERT INTO advertisers
     (company_name, business_no, ceo_name, address1, address2, postal_code,
      contact_name, contact_mobile, contact_phone, contact_email, email_hash, password_hash,
      push_consent, email_consent, terms_consent, privacy_consent, biz_cert_path, biz_cert_name, email_verified)
     VALUES (?,?,fn_encrypt(?),fn_encrypt(?),fn_encrypt(?),?,fn_encrypt(?),fn_encrypt(?),fn_encrypt(?),fn_encrypt(?),?,?,?,?,?,?,?,?,1)`,
    [
      company_name, normalizedBusinessNo, ceo_name, address1, address2 || '', postal_code,
      contact_name, contact_mobile, contact_phone || '', contact_email, emailHash, passwordHash,
      push_consent ? 1 : 0, email_consent ? 1 : 0, 1, 1,
      bizCertPath, bizCertName,
    ]
  );

  const advertiserId = result.insertId;

  // 광고주에게 접수 안내 메일
  try {
    await sendEmail({
      templateKey: 'registration_submitted',
      to: contact_email,
      vars: { contact_name, company_name },
      advertiserId,
    });
  } catch {}

  // Supervisor에게 알림
  try {
    await sendEmail({
      templateKey: 'registration_submitted_supervisor',
      to: process.env.SUPERVISOR_EMAIL || 'kimch@monorama.kr',
      vars: { company_name, business_no: normalizedBusinessNo, ceo_name, contact_name, contact_email, contact_mobile },
      advertiserId,
    });
  } catch {}

  res.json({ ok: true, message: '회원가입 신청이 완료되었습니다. 승인 후 로그인이 가능합니다.' });
});

// 광고주 로그인 (사업자등록번호 + 이메일 + 비밀번호)
router.post('/login', async (req: Request, res: Response) => {
  const { business_no, email, password } = req.body;
  if (!business_no || !email || !password)
    return res.status(400).json({ error: '사업자등록번호, 이메일, 비밀번호를 모두 입력하세요.' });

  const emailHash = hashEmail(email);
  const [rows] = await pool.execute<any[]>(
    `SELECT id, password_hash, status, company_name, business_no,
            password_reset_required,
            fn_decrypt(contact_name) AS contact_name,
            fn_decrypt(contact_email) AS contact_email,
            last_login_ip, last_login_at
     FROM advertisers WHERE email_hash = ?`,
    [emailHash]
  );

  if (!rows.length) return res.status(401).json({ error: '입력하신 정보가 올바르지 않습니다.' });
  const advertiser = rows[0];

  const normInput  = String(business_no).replace(/\D/g, '');
  const normStored = String(advertiser.business_no).replace(/\D/g, '');
  if (normInput !== normStored)
    return res.status(401).json({ error: '입력하신 정보가 올바르지 않습니다.' });

  const valid = await bcrypt.compare(password, advertiser.password_hash);
  if (!valid) return res.status(401).json({ error: '입력하신 정보가 올바르지 않습니다.' });

  if (advertiser.status === 'pending')    return res.status(403).json({ error: '관리자 승인 대기 중입니다.' });
  if (advertiser.status === 'rejected')   return res.status(403).json({ error: '가입이 취소된 계정입니다.' });
  if (advertiser.status === 'terminated') return res.status(403).json({ error: '종료된 계정입니다.' });

  const ip     = getClientIp(req);
  const prevIp = advertiser.last_login_ip;
  const prevAt = advertiser.last_login_at;

  await pool.execute(
    'UPDATE advertisers SET last_login_ip = ?, last_login_at = NOW() WHERE id = ?',
    [ip, advertiser.id]
  );
  await pool.execute(
    `INSERT INTO login_histories (user_type, user_id, login_ip, session_id) VALUES ('advertiser', ?, ?, ?)`,
    [String(advertiser.id), ip, req.sessionID]
  );

  (req.session as any).advertiser = {
    id:            advertiser.id,
    company_name:  advertiser.company_name,
    contact_name:  advertiser.contact_name,
    contact_email: advertiser.contact_email,
  };
  (req.session as any).lastActivity = Date.now();

  res.json({
    ok:            true,
    resetRequired: advertiser.password_reset_required === 1,
    contact_name:  advertiser.contact_name,
    prevIp,
    prevAt,
    message: '환영합니다. 많은 이용을 바랍니다.',
  });
});

// 비밀번호 분실 - 임시비밀번호 발급
router.post('/forgot-password', async (req: Request, res: Response) => {
  const { business_no, email } = req.body;
  if (!business_no || !email)
    return res.status(400).json({ error: '사업자등록번호와 이메일을 입력하세요.' });

  const emailHash = hashEmail(email);
  const [rows] = await pool.execute<any[]>(
    `SELECT id, business_no, status,
            fn_decrypt(contact_name) AS contact_name,
            fn_decrypt(contact_email) AS contact_email
     FROM advertisers WHERE email_hash = ?`,
    [emailHash]
  );

  // 계정이 없거나 사업자등록번호 불일치 시 동일 메시지로 보안 처리
  if (!rows.length) {
    return res.json({ ok: true, message: '입력하신 정보와 일치하는 계정이 있으면 임시비밀번호가 발송됩니다.' });
  }

  const adv = rows[0];
  const normInput  = String(business_no).replace(/\D/g, '');
  const normStored = String(adv.business_no).replace(/\D/g, '');
  if (normInput !== normStored) {
    return res.json({ ok: true, message: '입력하신 정보와 일치하는 계정이 있으면 임시비밀번호가 발송됩니다.' });
  }

  if (adv.status !== 'approved') {
    return res.status(403).json({ error: '승인된 계정만 비밀번호를 재설정할 수 있습니다.' });
  }

  const tempPw = generateTempPassword();
  const hash   = await bcrypt.hash(tempPw, 12);

  await pool.execute(
    'UPDATE advertisers SET password_hash = ?, password_reset_required = 1 WHERE id = ?',
    [hash, adv.id]
  );

  try {
    await sendEmail({
      templateKey: 'temp_password',
      to: adv.contact_email,
      vars: { contact_name: adv.contact_name, temp_password: tempPw },
      advertiserId: adv.id,
    });
  } catch (e: any) {
    return res.status(500).json({ error: '이메일 발송에 실패했습니다: ' + e.message });
  }

  res.json({ ok: true, message: '임시비밀번호가 이메일로 발송되었습니다.' });
});

// 비밀번호 재설정 (로그인 후 강제 변경)
router.post('/reset-password', async (req: Request, res: Response) => {
  const adv = (req.session as any).advertiser;
  if (!adv) return res.status(401).json({ error: '로그인이 필요합니다.' });

  const { current_password, new_password } = req.body;
  if (!current_password || !new_password)
    return res.status(400).json({ error: '현재 비밀번호와 새 비밀번호를 입력하세요.' });

  const pwPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
  if (!pwPattern.test(new_password))
    return res.status(400).json({ error: '새 비밀번호는 대소문자, 숫자, 특수문자를 포함한 8자리 이상이어야 합니다.' });

  const [rows] = await pool.execute<any[]>(
    'SELECT password_hash FROM advertisers WHERE id = ?',
    [adv.id]
  );
  if (!rows.length) return res.status(400).json({ error: '계정을 찾을 수 없습니다.' });

  const valid = await bcrypt.compare(current_password, rows[0].password_hash);
  if (!valid) return res.status(400).json({ error: '현재 비밀번호(임시비밀번호)가 올바르지 않습니다.' });

  const newHash = await bcrypt.hash(new_password, 12);
  await pool.execute(
    'UPDATE advertisers SET password_hash = ?, password_reset_required = 0 WHERE id = ?',
    [newHash, adv.id]
  );

  res.json({ ok: true, message: '비밀번호가 변경되었습니다.' });
});

// 프로필 조회
router.get('/profile', async (req: Request, res: Response, next: NextFunction) => {
  try {
  const adv = (req.session as any).advertiser;
  if (!adv) return res.status(401).json({ error: 'not_logged_in' });

  const [rows] = await pool.execute<any[]>(
    `SELECT company_name, business_no,
            fn_decrypt(ceo_name) AS ceo_name,
            fn_decrypt(address1) AS address1, fn_decrypt(address2) AS address2, postal_code,
            fn_decrypt(contact_name) AS contact_name,
            fn_decrypt(contact_mobile) AS contact_mobile,
            fn_decrypt(contact_phone) AS contact_phone,
            fn_decrypt(contact_email) AS contact_email,
            push_consent, email_consent
     FROM advertisers WHERE id = ?`,
    [adv.id]
  );
  if (!rows.length) return res.status(400).json({ error: '계정을 찾을 수 없습니다.' });

  res.json({ ok: true, profile: rows[0] });
  } catch (error) {
    next(error);
  }
});

// 프로필 수정
router.put('/profile', async (req: Request, res: Response, next: NextFunction) => {
  try {
  const adv = (req.session as any).advertiser;
  if (!adv) return res.status(401).json({ error: 'not_logged_in' });

  const { contact_name, contact_mobile, contact_phone, address1, address2, postal_code, push_consent, email_consent } = req.body;

  if (!contact_name || !contact_mobile || !address1 || !postal_code)
    return res.status(400).json({ error: '필수 정보를 모두 입력하세요.' });

  await pool.execute(
    `UPDATE advertisers SET
       contact_name   = fn_encrypt(?),
       contact_mobile = fn_encrypt(?),
       contact_phone  = fn_encrypt(?),
       address1       = fn_encrypt(?),
       address2       = fn_encrypt(?),
       postal_code    = ?,
       push_consent   = ?,
       email_consent  = ?
     WHERE id = ?`,
    [
      contact_name, contact_mobile, contact_phone || '',
      address1, address2 || '', postal_code,
      push_consent ? 1 : 0, email_consent ? 1 : 0,
      adv.id,
    ]
  );

  (req.session as any).advertiser.contact_name = contact_name;
  res.json({ ok: true, message: '프로필이 업데이트되었습니다.' });
  } catch (error) {
    next(error);
  }
});

// 로그아웃
router.post('/logout', async (req: Request, res: Response) => {
  const sessionId = req.sessionID;
  await pool.execute(
    `UPDATE login_histories SET logout_at = NOW() WHERE session_id = ? AND logout_at IS NULL`,
    [sessionId]
  );
  req.session.destroy(() => {});
  res.json({ ok: true });
});

// 세션 확인
router.get('/me', (req: Request, res: Response) => {
  const adv = (req.session as any).advertiser;
  if (!adv) return res.status(401).json({ error: 'not_logged_in' });
  res.json({ ok: true, user: adv });
});

// 세션 연장
router.post('/heartbeat', (req: Request, res: Response) => {
  if ((req.session as any).advertiser || (req.session as any).supervisor) {
    (req.session as any).lastActivity = Date.now();
    return res.json({ ok: true });
  }
  res.status(401).json({ error: 'not_logged_in' });
});

export default router;
