import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import path from 'path';
import fs from 'fs';
import ExcelJS from 'exceljs';
import crypto from 'crypto';
import pool from '../config/database';
import { requireSupervisor } from '../middleware/auth';
import { sendEmail, getSystemVars } from '../services/email.service';
import { adTypeLabel, backupCampaignFiles, buildQuotationVars } from '../services/campaign.service';
import { createNotification } from '../services/notification.service';

const router = Router();
const asyncHandler = (handler: (req: Request, res: Response) => Promise<any>) =>
  (req: Request, res: Response, next: NextFunction) => Promise.resolve(handler(req, res)).catch(next);

function getClientIp(req: Request): string {
  return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '');
}

function contentDisposition(type: 'inline' | 'attachment', filename: string): string {
  const safeName = String(filename || 'business-registration')
    .replace(/[\r\n]/g, '')
    .replace(/["\\]/g, '_');
  const asciiName = safeName.replace(/[^\x20-\x7E]/g, '_');
  return `${type}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`;
}

function bizCertContentType(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case '.pdf': return 'application/pdf';
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.gif': return 'image/gif';
    case '.webp': return 'image/webp';
    default: return 'application/octet-stream';
  }
}

// ── Supervisor 로그인 ──────────────────────────────────────
router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
 try {
  const { username, password } = req.body;

  // 관리자 계정은 .env 값과 직접 대조한다. 환경변수가 비어 있으면
  // 빈 아이디·빈 비밀번호가 그대로 일치해 로그인이 통과되므로,
  // 값이 설정되지 않은 경우에는 인증 자체를 거부한다.
  const adminUsername = process.env.SUPERVISOR_USERNAME;
  const adminPassword = process.env.SUPERVISOR_PASSWORD;
  if (!adminUsername || !adminPassword) {
    console.error('[admin] SUPERVISOR_USERNAME / SUPERVISOR_PASSWORD 가 설정되지 않아 로그인을 거부했습니다.');
    return res.status(503).json({ error: '관리자 계정이 설정되지 않았습니다. 서버 관리자에게 문의하세요.' });
  }

  if (typeof username !== 'string' || typeof password !== 'string') {
    return res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
  }
  if (username !== adminUsername || password !== adminPassword) {
    return res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
  }

  const ip = getClientIp(req);
  const prevIp = (req.session as any).supervisorLastIp;
  const prevAt = (req.session as any).supervisorLastAt;

  await pool.execute(
    `INSERT INTO login_histories (user_type, user_id, login_ip, session_id) VALUES ('supervisor', ?, ?, ?)`,
    [username, ip, req.sessionID]
  );

  (req.session as any).supervisor       = { username };
  (req.session as any).supervisorLastIp = ip;
  (req.session as any).supervisorLastAt = new Date().toISOString();
  (req.session as any).lastActivity     = Date.now();

  res.json({ ok: true, prevIp, prevAt, message: '환영합니다. 많은 이용을 바랍니다.' });
 } catch (error) {
  next(error);
 }
});

// ── Supervisor 로그아웃 ────────────────────────────────────
router.post('/logout', async (req: Request, res: Response) => {
  await pool.execute(
    'UPDATE login_histories SET logout_at = NOW() WHERE session_id = ? AND logout_at IS NULL',
    [req.sessionID]
  );
  req.session.destroy(() => {});
  res.json({ ok: true });
});

// ── Supervisor 세션 확인 ───────────────────────────────────
router.get('/me', (req: Request, res: Response) => {
  const sv = (req.session as any).supervisor;
  if (!sv) return res.status(401).json({ error: 'not_logged_in' });
  res.json({ ok: true, user: sv });
});

// ── 현황 통계 ─────────────────────────────────────────────
router.get('/stats', requireSupervisor, async (_req: Request, res: Response) => {
  // 1. 상태별 캠페인 개수 + 전체
  const [statusRows] = await pool.execute<any[]>(
    `SELECT status, COUNT(*) AS cnt FROM campaigns GROUP BY status`
  );
  const statusMap: Record<string, number> = {};
  let total = 0;
  for (const r of statusRows) { statusMap[r.status] = Number(r.cnt); total += Number(r.cnt); }

  // 2. 전체 광고비 vs 실제 입금된 광고비
  //    전체: 취소 제외 total_fee 합산
  //    입금: 입금확인·광고중·광고종료 total_fee 합산
  const [feeRows] = await pool.execute<any[]>(
    `SELECT
       SUM(CASE WHEN status <> '취소' THEN total_fee ELSE 0 END) AS total_fee,
       SUM(CASE WHEN status IN ('입금확인','광고중','광고종료') THEN total_fee ELSE 0 END) AS paid_fee
     FROM campaigns`
  );
  const totalFee = Number(feeRows[0].total_fee) || 0;
  const paidFee  = Number(feeRows[0].paid_fee)  || 0;

  // 3-a. 매출 상위 5 광고주 (입금확인·광고중·광고종료 기준, 해당 캠페인 건수도 동일 조건)
  const [topRevRows] = await pool.execute<any[]>(
    `SELECT a.company_name,
            SUM(CASE WHEN c.status IN ('입금확인','광고중','광고종료') THEN c.total_fee ELSE 0 END) AS revenue,
            SUM(CASE WHEN c.status IN ('입금확인','광고중','광고종료') THEN 1 ELSE 0 END) AS campaign_count
     FROM advertisers a
     INNER JOIN campaigns c ON c.advertiser_id = a.id
     GROUP BY a.id, a.company_name
     HAVING revenue > 0
     ORDER BY revenue DESC
     LIMIT 5`
  );

  // 3-b. 캠페인 등록 상위 5 광고주 (취소 제외한 전체 등록 건수 기준)
  const [topCntRows] = await pool.execute<any[]>(
    `SELECT a.company_name,
            COUNT(c.id) AS campaign_count,
            SUM(CASE WHEN c.status IN ('입금확인','광고중','광고종료') THEN c.total_fee ELSE 0 END) AS revenue
     FROM advertisers a
     INNER JOIN campaigns c ON c.advertiser_id = a.id
     WHERE c.status <> '취소'
     GROUP BY a.id, a.company_name
     HAVING campaign_count > 0
     ORDER BY campaign_count DESC
     LIMIT 5`
  );

  res.json({
    ok: true,
    statusMap, total,
    totalFee, paidFee,
    topRevenue: topRevRows.map(r => ({ company_name: r.company_name, revenue: Number(r.revenue), campaign_count: Number(r.campaign_count) })),
    topCount:   topCntRows.map(r => ({ company_name: r.company_name, campaign_count: Number(r.campaign_count), revenue: Number(r.revenue) })),
  });
});

// ── 캠페인 목록 (전체) ────────────────────────────────────
router.get('/campaigns', requireSupervisor, asyncHandler(async (req: Request, res: Response) => {
  const {
    advertiser, campaign_name, status,
    reg_from, reg_to, from_date, to_date,
    page = 1, size = 10,
  } = req.query;

  let where = 'WHERE 1=1';
  const params: any[] = [];

  if (advertiser)     { where += ' AND a.company_name LIKE ?';            params.push(`%${advertiser}%`); }
  if (campaign_name)  { where += ' AND c.campaign_name LIKE ?';           params.push(`%${campaign_name}%`); }
  if (status)         { where += ' AND c.status = ?';                     params.push(status); }
  if (reg_from)       { where += ' AND DATE(c.created_at) >= ?';          params.push(reg_from); }
  if (reg_to)         { where += ' AND DATE(c.created_at) <= ?';          params.push(reg_to); }
  if (from_date)      { where += ' AND c.from_date >= ?';                 params.push(from_date); }
  if (to_date)        { where += ' AND c.to_date <= ?';                   params.push(to_date); }

  const pageNum  = Math.max(1, parseInt(String(page)) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(String(size)) || 10));
  const offset   = (pageNum - 1) * pageSize;

  const [countRows] = await pool.execute<any[]>(
    `SELECT COUNT(*) AS total
     FROM campaigns c
     JOIN advertisers a ON c.advertiser_id = a.id
     ${where}`,
    params
  );
  const total = countRows[0].total;

  const [rows] = await pool.execute<any[]>(
    `SELECT c.*,
            a.company_name,
            a.status AS advertiser_status,
            a.biz_cert_path, a.biz_cert_name,
            fn_decrypt(a.contact_name) AS contact_name,
            fn_decrypt(a.contact_email) AS contact_email,
            CASE WHEN c.quotation_read_at IS NOT NULL THEN 1 ELSE 0 END AS quotation_read
     FROM campaigns c
     JOIN advertisers a ON c.advertiser_id = a.id
     ${where}
     ORDER BY c.created_at DESC
     LIMIT ${pageSize} OFFSET ${offset}`,
    params
  );

  res.json({ ok: true, data: rows, total, page: pageNum, size: pageSize });
}));

// ── 캠페인 상세 ───────────────────────────────────────────
router.get('/campaigns/:id', requireSupervisor, async (req: Request, res: Response) => {
  const [rows] = await pool.execute<any[]>(
    `SELECT c.*,
            a.company_name, a.business_no,
            fn_decrypt(a.ceo_name) AS ceo_name,
            fn_decrypt(a.contact_name) AS contact_name,
            fn_decrypt(a.contact_email) AS contact_email,
            fn_decrypt(a.contact_mobile) AS contact_mobile,
            fn_decrypt(a.address1) AS address1, fn_decrypt(a.address2) AS address2, a.postal_code,
            a.biz_cert_path, a.biz_cert_name,
            a.status AS advertiser_status
     FROM campaigns c
     JOIN advertisers a ON c.advertiser_id = a.id
     WHERE c.id = ?`,
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: '캠페인을 찾을 수 없습니다.' });
  res.json({ ok: true, data: rows[0] });
});

// ── 입금 확인 ─────────────────────────────────────────────
router.put('/campaigns/:id/payment', requireSupervisor, async (req: Request, res: Response) => {
  const sv = (req.session as any).supervisor;
  const [rows] = await pool.execute<any[]>(
    `SELECT c.*, a.company_name,
            fn_decrypt(a.contact_name) AS contact_name,
            fn_decrypt(a.contact_email) AS contact_email
     FROM campaigns c JOIN advertisers a ON c.advertiser_id = a.id
     WHERE c.id = ?`,
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: '캠페인을 찾을 수 없습니다.' });
  const campaign  = rows[0];

  if (campaign.status !== '입금전') {
    return res.status(400).json({ error: '입금전 상태의 캠페인만 입금확인 처리할 수 있습니다.' });
  }

  const now      = new Date();
  const fromDate = new Date(campaign.from_date);
  const newStatus = now >= fromDate ? '광고중' : '입금확인';

  if (newStatus === '광고중') {
    await pool.execute(
      'UPDATE campaigns SET status = ?, payment_confirmed_at = NOW(), payment_confirmed_by = ?, approved_at = NOW(), approved_by = ? WHERE id = ?',
      [newStatus, sv.username, sv.username, campaign.id]
    );
  } else {
    await pool.execute(
      'UPDATE campaigns SET status = ?, payment_confirmed_at = NOW(), payment_confirmed_by = ? WHERE id = ?',
      [newStatus, sv.username, campaign.id]
    );
  }

  const fmtDate = (d: any) =>
    d instanceof Date ? d.toISOString().split('T')[0] : String(d || '').split('T')[0];

  const vars = {
    contact_name:  campaign.contact_name,
    company_name:  campaign.company_name,
    campaign_name: campaign.campaign_name,
    campaign_id:   campaign.id,
    from_date:     fmtDate(campaign.from_date),
    to_date:       fmtDate(campaign.to_date),
  };

  try {
    await createNotification({
      advertiserId: Number(campaign.advertiser_id), eventType: 'payment_confirmed', campaignId: campaign.id,
      title: `입금 확인 - ${campaign.campaign_name}`, message: `${campaign.campaign_name} 캠페인의 입금이 확인되었습니다.`,
    });
  } catch (error) { console.error('알림 생성 실패:', error); }
  void sendEmail({ templateKey: 'payment_confirmed_advertiser', to: campaign.contact_email, vars, campaignId: campaign.id })
    .catch(error => console.error('입금확인 이메일 발송 실패:', error));

  if (newStatus === '광고중') {
    try {
      await createNotification({
        advertiserId: Number(campaign.advertiser_id), eventType: 'campaign_approved', campaignId: campaign.id,
        title: '캠페인이 승인되었습니다', message: `${campaign.campaign_name} 캠페인이 승인되어 광고가 시작되었습니다.`,
      });
    } catch (error) { console.error('알림 생성 실패:', error); }
    void sendEmail({ templateKey: 'campaign_started_advertiser', to: campaign.contact_email, vars, campaignId: campaign.id })
      .catch(error => console.error('광고시작 이메일 발송 실패:', error));
  }

  res.json({ ok: true, newStatus });
});

// ── 캠페인 승인 (입금확인 → 광고중) ──────────────────────
router.put('/campaigns/:id/approve', requireSupervisor, async (req: Request, res: Response) => {
  const sv = (req.session as any).supervisor;
  const [rows] = await pool.execute<any[]>(
    `SELECT c.*, a.company_name,
            fn_decrypt(a.contact_name) AS contact_name,
            fn_decrypt(a.contact_email) AS contact_email
     FROM campaigns c JOIN advertisers a ON c.advertiser_id = a.id
     WHERE c.id = ?`,
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: '캠페인을 찾을 수 없습니다.' });
  const campaign = rows[0];

  if (campaign.status !== '입금확인') {
    return res.status(400).json({ error: '입금확인 상태의 캠페인만 승인 처리할 수 있습니다.' });
  }

  await pool.execute(
    'UPDATE campaigns SET status = ?, approved_at = NOW(), approved_by = ? WHERE id = ?',
    ['광고중', sv.username, campaign.id]
  );

  const fmtDate = (d: any) =>
    d instanceof Date ? d.toISOString().split('T')[0] : String(d || '').split('T')[0];

  const vars = {
    contact_name:  campaign.contact_name,
    company_name:  campaign.company_name,
    campaign_name: campaign.campaign_name,
    campaign_id:   campaign.id,
    from_date:     fmtDate(campaign.from_date),
    to_date:       fmtDate(campaign.to_date),
  };
  try {
    await createNotification({
      advertiserId: Number(campaign.advertiser_id), eventType: 'campaign_approved', campaignId: campaign.id,
      title: '캠페인이 승인되었습니다', message: `${campaign.campaign_name} 캠페인이 승인되어 광고중 상태로 변경되었습니다.`,
    });
  } catch (error) { console.error('알림 생성 실패:', error); }
  void sendEmail({ templateKey: 'campaign_started_advertiser', to: campaign.contact_email, vars, campaignId: campaign.id })
    .catch(error => console.error('캠페인 승인 이메일 발송 실패:', error));

  res.json({ ok: true, newStatus: '광고중' });
});

// ── 캠페인 취소 (supervisor) ──────────────────────────────
router.put('/campaigns/:id/cancel', requireSupervisor, async (req: Request, res: Response) => {
  const sv = (req.session as any).supervisor;
  const [rows] = await pool.execute<any[]>(
    `SELECT c.*, a.company_name,
            fn_decrypt(a.contact_name) AS contact_name,
            fn_decrypt(a.contact_email) AS contact_email
     FROM campaigns c JOIN advertisers a ON c.advertiser_id = a.id
     WHERE c.id = ?`,
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: '캠페인을 찾을 수 없습니다.' });
  const campaign = rows[0];

  if (['취소', '광고종료'].includes(campaign.status)) {
    return res.status(400).json({ error: '이미 취소되었거나 종료된 캠페인입니다.' });
  }

  await pool.execute(
    'UPDATE campaigns SET status = ?, cancelled_at = NOW(), cancelled_by = ? WHERE id = ?',
    ['취소', sv.username, campaign.id]
  );

  const vars = {
    contact_name:     campaign.contact_name,
    campaign_id:      campaign.id,
    campaign_name:    campaign.campaign_name,
    supervisor_email: process.env.SUPERVISOR_EMAIL || 'kimch@monorama.kr',
  };
  try {
    await createNotification({
      advertiserId: Number(campaign.advertiser_id), eventType: 'campaign_cancelled', campaignId: campaign.id,
      title: '캠페인이 취소되었습니다', message: `${campaign.campaign_name} 캠페인이 취소 처리되었습니다.`,
    });
  } catch (error) { console.error('알림 생성 실패:', error); }
  void sendEmail({ templateKey: 'campaign_cancelled_advertiser', to: campaign.contact_email, vars, campaignId: campaign.id })
    .catch(error => console.error('캠페인 취소 이메일 발송 실패:', error));

  res.json({ ok: true });
});

// ── 광고주 승인/취소/종료 ─────────────────────────────────
router.put('/advertisers/:id', requireSupervisor, async (req: Request, res: Response) => {
  const advertiserId = Number(req.params.id);
  const companyName = String(req.body.company_name || '').trim();
  const businessNo = String(req.body.business_no || '').replace(/\D/g, '');
  const contactName = String(req.body.contact_name || '').trim();
  const contactEmail = String(req.body.contact_email || '').trim().toLowerCase();
  const contactMobile = String(req.body.contact_mobile || '').trim();

  if (!Number.isInteger(advertiserId) || advertiserId <= 0) {
    return res.status(400).json({ error: '잘못된 광고주 ID입니다.' });
  }
  if (!companyName || !businessNo || !contactName || !contactEmail || !contactMobile) {
    return res.status(400).json({ error: '필수 항목을 모두 입력하세요.' });
  }
  if (!/^\d{10}$/.test(businessNo)) {
    return res.status(400).json({ error: '사업자등록번호는 숫자 10자리로 입력하세요.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
    return res.status(400).json({ error: '이메일 형식이 올바르지 않습니다.' });
  }

  const emailHash = crypto.createHash('sha256').update(contactEmail).digest('hex');
  const [existing] = await pool.execute<any[]>(
    'SELECT id FROM advertisers WHERE id = ?',
    [advertiserId]
  );
  if (!existing.length) return res.status(404).json({ error: '광고주를 찾을 수 없습니다.' });

  const [duplicates] = await pool.execute<any[]>(
    'SELECT id FROM advertisers WHERE id <> ? AND (business_no = ? OR email_hash = ?) LIMIT 1',
    [advertiserId, businessNo, emailHash]
  );
  if (duplicates.length) {
    return res.status(409).json({ error: '이미 등록된 사업자번호 또는 이메일입니다.' });
  }

  await pool.execute(
    `UPDATE advertisers SET
       company_name = ?, business_no = ?,
       contact_name = fn_encrypt(?), contact_email = fn_encrypt(?),
       contact_mobile = fn_encrypt(?), email_hash = ?, updated_at = NOW()
     WHERE id = ?`,
    [companyName, businessNo, contactName, contactEmail, contactMobile, emailHash, advertiserId]
  );
  res.json({ ok: true, message: '광고주 정보가 수정되었습니다.' });
});

router.put('/advertisers/:id/status', requireSupervisor, async (req: Request, res: Response) => {
  const { status, reason } = req.body;
  if (!['approved', 'rejected', 'terminated'].includes(status)) {
    return res.status(400).json({ error: '유효하지 않은 상태입니다.' });
  }
  if ((status === 'rejected' || status === 'terminated') && !reason) {
    return res.status(400).json({ error: '사유를 입력하세요.' });
  }

  const [rows] = await pool.execute<any[]>(
    `SELECT id, company_name, fn_decrypt(contact_name) AS contact_name, fn_decrypt(contact_email) AS contact_email FROM advertisers WHERE id = ?`,
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: '광고주를 찾을 수 없습니다.' });
  const advertiser = rows[0];

  await pool.execute(
    'UPDATE advertisers SET status = ?, status_reason = ?, updated_at = NOW() WHERE id = ?',
    [status, reason || null, advertiser.id]
  );

  const sysVars = getSystemVars();
  const vars = {
    contact_name:     advertiser.contact_name,
    company_name:     advertiser.company_name,
    reason:           reason || '',
    supervisor_email: process.env.SUPERVISOR_EMAIL || 'kimch@monorama.kr',
    login_url:        sysVars.login_url,
  };

  const templateMap: Record<string, string> = {
    approved:   'registration_approved',
    rejected:   'registration_rejected',
    terminated: 'registration_terminated',
  };

  try { await sendEmail({ templateKey: templateMap[status], to: advertiser.contact_email, vars, advertiserId: advertiser.id }); } catch {}

  res.json({ ok: true });
});

// ── 광고주 목록 ────────────────────────────────────────────
router.get('/advertisers', requireSupervisor, asyncHandler(async (req: Request, res: Response) => {
  const { company_name, status, page = 1, size = 10 } = req.query;
  let where = 'WHERE 1=1';
  const params: any[] = [];
  if (company_name) { where += ' AND company_name LIKE ?'; params.push(`%${company_name}%`); }
  if (status)       { where += ' AND status = ?';          params.push(status); }

  const pageNum  = Math.max(1, parseInt(String(page)) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(String(size)) || 10));
  const offset   = (pageNum - 1) * pageSize;

  const [countRows] = await pool.execute<any[]>(`SELECT COUNT(*) AS total FROM advertisers ${where}`, params);
  const [rows] = await pool.execute<any[]>(
    `SELECT id, company_name, business_no, status, biz_cert_path, biz_cert_name,
            fn_decrypt(contact_name) AS contact_name,
            fn_decrypt(contact_email) AS contact_email,
            fn_decrypt(contact_mobile) AS contact_mobile,
            created_at
     FROM advertisers ${where}
     ORDER BY created_at DESC LIMIT ${pageSize} OFFSET ${offset}`,
    params
  );

  res.json({ ok: true, data: rows, total: countRows[0].total, page: pageNum, size: pageSize });
}));

// ── 사업자등록증 다운로드 ──────────────────────────────────
router.get('/advertisers/excel/download', requireSupervisor, async (req: Request, res: Response) => {
  const { company_name, status } = req.query;
  let where = 'WHERE 1=1';
  const params: any[] = [];
  if (company_name) { where += ' AND company_name LIKE ?'; params.push(`%${company_name}%`); }
  if (status)       { where += ' AND status = ?';          params.push(status); }

  const [rows] = await pool.execute<any[]>(
    `SELECT company_name, business_no, status, biz_cert_name,
            fn_decrypt(contact_name) AS contact_name,
            fn_decrypt(contact_email) AS contact_email,
            fn_decrypt(contact_mobile) AS contact_mobile,
            created_at
     FROM advertisers ${where}
     ORDER BY created_at DESC`,
    params
  );

  const statusLabels: Record<string, string> = {
    pending: '심사중', approved: '승인', rejected: '취소', terminated: '종료',
  };
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('광고주 목록');
  ws.columns = [
    { header: '회사명',       key: 'company_name',   width: 25 },
    { header: '사업자번호',   key: 'business_no',    width: 16 },
    { header: '담당자',       key: 'contact_name',   width: 15 },
    { header: '이메일',       key: 'contact_email',  width: 30 },
    { header: '연락처',       key: 'contact_mobile', width: 18 },
    { header: '사업자등록증', key: 'biz_cert_name',  width: 28 },
    { header: '인증상태',     key: 'status_label',   width: 12 },
    { header: '가입일',       key: 'created_at',     width: 14 },
  ];
  ws.getRow(1).font = { bold: true };
  for (const row of rows) {
    ws.addRow({
      ...row,
      business_no: String(row.business_no || '').replace(/(\d{3})(\d{2})(\d{5})/, '$1-$2-$3'),
      status_label: statusLabels[row.status] || row.status,
      created_at: row.created_at instanceof Date
        ? row.created_at.toISOString().slice(0, 10)
        : (typeof row.created_at === 'string' ? row.created_at.split('T')[0] : row.created_at),
    });
  }

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="admin_advertisers.xlsx"');
  await wb.xlsx.write(res);
  res.end();
});

router.get('/advertisers/:id/biz-cert', requireSupervisor, async (req: Request, res: Response) => {
  const [rows] = await pool.execute<any[]>(
    'SELECT biz_cert_path, biz_cert_name FROM advertisers WHERE id = ?',
    [req.params.id]
  );
  if (!rows.length || !rows[0].biz_cert_path) {
    return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
  }
  const filePath = rows[0].biz_cert_path;
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: '파일이 존재하지 않습니다.' });
  const filename = rows[0].biz_cert_name || path.basename(filePath);
  const disposition = req.query.inline === '1' ? 'inline' : 'attachment';
  res.setHeader('Content-Type', bizCertContentType(filePath));
  res.setHeader('Content-Disposition', contentDisposition(disposition, filename));
  res.sendFile(path.resolve(filePath));
});

// ── Excel 다운로드 (전체 조회 결과) ───────────────────────
router.get('/campaigns/excel/download', requireSupervisor, async (req: Request, res: Response) => {
  const { advertiser, campaign_name, status, reg_from, reg_to, from_date, to_date } = req.query;

  let where = 'WHERE 1=1';
  const params: any[] = [];
  if (advertiser)    { where += ' AND a.company_name LIKE ?';   params.push(`%${advertiser}%`); }
  if (campaign_name) { where += ' AND c.campaign_name LIKE ?';  params.push(`%${campaign_name}%`); }
  if (status)        { where += ' AND c.status = ?';            params.push(status); }
  if (reg_from)      { where += ' AND DATE(c.created_at) >= ?'; params.push(reg_from); }
  if (reg_to)        { where += ' AND DATE(c.created_at) <= ?'; params.push(reg_to); }
  if (from_date)     { where += ' AND c.from_date >= ?';        params.push(from_date); }
  if (to_date)       { where += ' AND c.to_date <= ?';          params.push(to_date); }

  const [rows] = await pool.execute<any[]>(
    `SELECT c.*,
            a.company_name,
            fn_decrypt(a.contact_name) AS contact_name,
            fn_decrypt(a.contact_email) AS contact_email,
            CASE WHEN c.quotation_read_at IS NOT NULL THEN '읽음' ELSE '미읽음' END AS quotation_read_label,
            a.status AS advertiser_status
     FROM campaigns c
     JOIN advertisers a ON c.advertiser_id = a.id
     ${where}
     ORDER BY c.created_at DESC`,
    params
  );

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('캠페인 목록');
  ws.columns = [
    { header: '광고주',       key: 'company_name',  width: 25 },
    { header: '캠페인 ID',    key: 'id',            width: 14 },
    { header: '캠페인명',     key: 'campaign_name', width: 30 },
    { header: '이미지',       key: 'has_image',     width: 8  },
    { header: 'HTML',         key: 'has_html',      width: 8  },
    { header: 'YouTube',      key: 'has_youtube',   width: 10 },
    { header: '시작일',       key: 'from_date',     width: 12 },
    { header: '종료일',       key: 'to_date',       width: 12 },
    { header: '광고료(원)',   key: 'total_fee',     width: 14 },
    { header: '견적서수신',   key: 'quotation_read_label', width: 10 },
    { header: '광고주상태',   key: 'advertiser_status', width: 12 },
    { header: '캠페인상태',   key: 'status',        width: 10 },
  ];
  ws.getRow(1).font = { bold: true };
  for (const r of rows) {
    ws.addRow({
      company_name:  r.company_name,
      id:            r.id,
      campaign_name: r.campaign_name,
      has_image:     r.has_image   ? 'O' : '',
      has_html:      r.has_html    ? 'O' : '',
      has_youtube:   r.has_youtube ? 'O' : '',
      from_date:     r.from_date instanceof Date ? r.from_date.toISOString().slice(0,10) : (typeof r.from_date === 'string' ? r.from_date.split('T')[0] : r.from_date),
      to_date:       r.to_date   instanceof Date ? r.to_date.toISOString().slice(0,10)   : (typeof r.to_date   === 'string' ? r.to_date.split('T')[0]   : r.to_date),
      total_fee:     r.total_fee,
      quotation_read_label: r.quotation_read_label,
      advertiser_status: r.advertiser_status,
      status:        r.status,
    });
  }

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="admin_campaigns.xlsx"');
  await wb.xlsx.write(res);
  res.end();
});

export default router;
