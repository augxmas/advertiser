import { Router, Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import { randomUUID as uuidv4 } from 'crypto';
import ExcelJS from 'exceljs';
import pool from '../config/database';
import { requireAdvertiser } from '../middleware/auth';
import { uploadAdFiles } from '../middleware/upload';
import { sendEmail } from '../services/email.service';
import { calculateFee, adTypeLabel, backupCampaignFiles, buildQuotationVars } from '../services/campaign.service';
import { generateCampaignId } from '../utils/id-generator';
import { createNotification, createSupervisorNotification } from '../services/notification.service';

const router = Router();
const asyncHandler = (handler: (req: Request, res: Response) => Promise<any>) =>
  (req: Request, res: Response, next: NextFunction) => Promise.resolve(handler(req, res)).catch(next);

async function copyLibraryImage(libraryImageId: unknown, advertiserId: number, campaignDir: string, publicDir: string) {
  if (!libraryImageId) return null;
  const [rows] = await pool.execute<any[]>(
    `SELECT file_path, stored_name, original_name, width, height
     FROM image_library WHERE id = ? AND advertiser_id = ?`,
    [String(libraryImageId), advertiserId]
  );
  if (!rows.length || !fs.existsSync(rows[0].file_path)) return null;
  const extension = path.extname(rows[0].stored_name || rows[0].file_path).toLowerCase();
  const storedName = `${uuidv4()}${extension}`;
  const destination = path.join(campaignDir, storedName);
  fs.copyFileSync(rows[0].file_path, destination);
  return {
    url: `${publicDir}/${storedName}`,
    path: destination,
    filename: rows[0].original_name,
    width: rows[0].width,
    height: rows[0].height,
  };
}

// 광고료 미리보기 (견적 계산)
router.post('/preview-fee', requireAdvertiser, (req: Request, res: Response) => {
  const { has_image, has_html, has_youtube, from_date, to_date } = req.body;
  if (!from_date || !to_date) return res.status(400).json({ error: '광고 기간을 입력하세요.' });
  if (new Date(to_date) < new Date(from_date)) {
    return res.status(400).json({ error: '종료일은 시작일보다 이후여야 합니다.' });
  }
  const adTypes = {
    hasImage:   !!has_image,
    hasHtml:    !!has_html,
    hasYoutube: !!has_youtube,
  };
  if (!adTypes.hasImage && !adTypes.hasHtml && !adTypes.hasYoutube) {
    return res.status(400).json({ error: '광고물 유형을 하나 이상 선택하세요.' });
  }
  const fee = calculateFee(adTypes, from_date, to_date);
  res.json({ ok: true, ...fee });
});

// 캠페인 목록 조회
router.get('/', requireAdvertiser, asyncHandler(async (req: Request, res: Response) => {
  const adv = (req.session as any).advertiser;
  const { campaign_name, ad_type, from_date, to_date, status, page = 1, size = 10 } = req.query;

  let where = 'WHERE c.advertiser_id = ?';
  const params: any[] = [adv.id];

  if (campaign_name) { where += ' AND c.campaign_name LIKE ?'; params.push(`%${campaign_name}%`); }
  if (ad_type === 'image')   { where += ' AND c.has_image = 1'; }
  if (ad_type === 'html')    { where += ' AND c.has_html = 1'; }
  if (ad_type === 'youtube') { where += ' AND c.has_youtube = 1'; }
  if (from_date) { where += ' AND c.from_date >= ?'; params.push(from_date); }
  if (to_date)   { where += ' AND c.to_date <= ?';   params.push(to_date); }
  if (status)    { where += ' AND c.status = ?';     params.push(status); }

  const pageNum  = Math.max(1, parseInt(String(page)) || 1);
  const pageSize = Math.min(1000, Math.max(1, parseInt(String(size)) || 10));
  const offset   = (pageNum - 1) * pageSize;

  const [countRows] = await pool.execute<any[]>(
    `SELECT COUNT(*) AS total FROM campaigns c ${where}`, params
  );
  const total = countRows[0].total;

  const [rows] = await pool.execute<any[]>(
    `SELECT c.* FROM campaigns c ${where}
     ORDER BY c.created_at DESC LIMIT ${pageSize} OFFSET ${offset}`,
    params
  );

  res.json({ ok: true, data: rows, total, page: pageNum, size: pageSize });
}));

// 캠페인 상세
router.get('/:id', requireAdvertiser, async (req: Request, res: Response) => {
  const adv = (req.session as any).advertiser;
  const [rows] = await pool.execute<any[]>(
    'SELECT * FROM campaigns WHERE id = ? AND advertiser_id = ?',
    [req.params.id, adv.id]
  );
  if (!rows.length) return res.status(404).json({ error: '캠페인을 찾을 수 없습니다.' });
  res.json({ ok: true, data: rows[0] });
});

// 캠페인 등록
router.post('/', requireAdvertiser,
  uploadAdFiles.fields([
    { name: 'image_file', maxCount: 1 },
    { name: 'html_file',  maxCount: 1 },
  ]),
  asyncHandler(async (req: Request, res: Response) => {
    const adv = (req.session as any).advertiser;
    const {
      campaign_name, description,
      has_image, has_html, has_youtube,
      image_url, library_image_id, html_url, youtube_url,
      from_date, to_date,
      image_width, image_height,
    } = req.body;

    if (!campaign_name || !from_date || !to_date) {
      return res.status(400).json({ error: '필수 항목을 입력하세요.' });
    }
    if (new Date(to_date) < new Date(from_date)) {
      return res.status(400).json({ error: '종료일은 시작일보다 이후여야 합니다.' });
    }

    const adTypes = {
      hasImage:   !!has_image,
      hasHtml:    !!has_html,
      hasYoutube: !!has_youtube,
    };
    if (!adTypes.hasImage && !adTypes.hasHtml && !adTypes.hasYoutube) {
      return res.status(400).json({ error: '광고물 유형을 하나 이상 선택하세요.' });
    }

    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    const imageFile   = files?.image_file?.[0];
    const htmlFile    = files?.html_file?.[0];

    // 광고물 검증
    if (adTypes.hasImage && !image_url && !library_image_id && !imageFile) {
      return res.status(400).json({ error: '자료실에서 광고 이미지를 선택하세요.' });
    }
    if (adTypes.hasHtml && !html_url && !htmlFile) {
      return res.status(400).json({ error: 'HTML URL 또는 파일을 입력하세요.' });
    }
    if (adTypes.hasYoutube && !youtube_url) {
      return res.status(400).json({ error: 'YouTube URL을 입력하세요.' });
    }

    const fee = calculateFee(adTypes, from_date, to_date);
    const campaignId = await generateCampaignId();

    // 파일을 캠페인 ID 디렉토리로 이동
    let imagePath = null, imageFilename = null;
    let htmlPath  = null, htmlFilename  = null;
    let finalImageUrl = image_url || null;
    let finalHtmlUrl  = html_url  || null;
    let imgW = image_width  ? parseInt(String(image_width))  : null;
    let imgH = image_height ? parseInt(String(image_height)) : null;

    const campaignDir = path.join(process.cwd(), 'uploads', 'active', String(adv.id), campaignId);
    fs.mkdirSync(campaignDir, { recursive: true });

    if (library_image_id) {
      const selected = await copyLibraryImage(
        library_image_id, adv.id, campaignDir, `/uploads/active/${adv.id}/${campaignId}`
      );
      if (!selected) return res.status(400).json({ error: '선택한 자료실 이미지를 찾을 수 없습니다.' });
      imagePath = selected.path;
      imageFilename = selected.filename;
      finalImageUrl = selected.url;
      imgW = selected.width;
      imgH = selected.height;
    } else if (imageFile) {
      const dest = path.join(campaignDir, imageFile.filename);
      fs.renameSync(imageFile.path, dest);
      imagePath = dest;
      imageFilename = imageFile.originalname;
      finalImageUrl = `/uploads/active/${adv.id}/${campaignId}/${imageFile.filename}`;
    }
    if (htmlFile) {
      const dest = path.join(campaignDir, htmlFile.filename);
      fs.renameSync(htmlFile.path, dest);
      htmlPath = dest;
      htmlFilename = htmlFile.originalname;
      finalHtmlUrl = `/uploads/active/${adv.id}/${campaignId}/${htmlFile.filename}`;
    }

    const quotationToken = uuidv4();

    await pool.execute(
      `INSERT INTO campaigns
       (id, advertiser_id, campaign_name, description,
        has_image, has_html, has_youtube,
        image_url, image_path, image_filename, image_width, image_height,
        html_url, html_path, html_filename,
        youtube_url, from_date, to_date,
        ad_days, base_fee, vat, total_fee, quotation_token, quotation_sent_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())`,
      [
        campaignId, adv.id, campaign_name, description || '',
        adTypes.hasImage ? 1 : 0, adTypes.hasHtml ? 1 : 0, adTypes.hasYoutube ? 1 : 0,
        finalImageUrl, imagePath, imageFilename, imgW, imgH,
        finalHtmlUrl, htmlPath, htmlFilename,
        youtube_url || null, from_date, to_date,
        fee.days, fee.baseFee, fee.vat, fee.totalFee, quotationToken,
      ]
    );

    // 광고주 정보 조회 (복호화)
    const [advRows] = await pool.execute<any[]>(
      `SELECT company_name,
              fn_decrypt(contact_name) AS contact_name,
              fn_decrypt(contact_email) AS contact_email
       FROM advertisers WHERE id = ?`,
      [adv.id]
    );
    const advertiser = advRows[0];
    const campaign   = { id: campaignId, campaign_name, has_image: adTypes.hasImage ? 1 : 0, has_html: adTypes.hasHtml ? 1 : 0, has_youtube: adTypes.hasYoutube ? 1 : 0, from_date, to_date, ad_days: fee.days, base_fee: fee.baseFee, vat: fee.vat, total_fee: fee.totalFee };
    const vars = buildQuotationVars(campaign, advertiser, quotationToken);

    try {
      await createNotification({
        advertiserId: Number(adv.id), eventType: 'campaign_registered', campaignId,
        title: '캠페인이 등록되었습니다',
        message: `${campaign_name} 캠페인이 등록되어 견적서를 발송했습니다.`,
      });
    } catch (error) { console.error('알림 생성 실패:', error); }
    try {
      await createSupervisorNotification({
        eventType: 'campaign_registered', campaignId, advertiserId: Number(adv.id),
        title: '새 캠페인이 등록되었습니다',
        message: `${advertiser.company_name}의 ${campaign_name} 캠페인이 등록되었습니다.`,
      });
    } catch (error) { console.error('Supervisor 알림 생성 실패:', error); }

    // 이메일 발송은 등록 응답을 지연시키지 않도록 백그라운드에서 처리
    void Promise.allSettled([
      sendEmail({ templateKey: 'quotation_advertiser', to: advertiser.contact_email, vars, campaignId, advertiserId: adv.id }),
      sendEmail({ templateKey: 'quotation_supervisor', to: process.env.SUPERVISOR_EMAIL || 'kimch@monorama.kr', vars, campaignId, advertiserId: adv.id }),
    ]).then(results => results.forEach(result => {
      if (result.status === 'rejected') console.error('캠페인 등록 이메일 발송 실패:', result.reason);
    }));

    res.json({ ok: true, campaignId, fee, message: '견적서를 담당자의 이메일로 발송합니다.' });
  })
);

// 캠페인 수정
router.put('/:id', requireAdvertiser,
  uploadAdFiles.fields([
    { name: 'image_file', maxCount: 1 },
    { name: 'html_file',  maxCount: 1 },
  ]),
  async (req: Request, res: Response) => {
    const adv = (req.session as any).advertiser;
    const [rows] = await pool.execute<any[]>(
      'SELECT * FROM campaigns WHERE id = ? AND advertiser_id = ?',
      [req.params.id, adv.id]
    );
    if (!rows.length) return res.status(404).json({ error: '캠페인을 찾을 수 없습니다.' });
    const existing = rows[0];

    if (existing.status !== '입금전') {
      return res.status(400).json({ error: '입금전 상태의 캠페인만 수정 가능합니다.' });
    }
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (new Date(existing.from_date) <= today) {
      return res.status(400).json({ error: '캠페인 시작일이 지난 캠페인은 수정할 수 없습니다.' });
    }

    const {
      campaign_name, description,
      has_image, has_html, has_youtube,
      image_url, library_image_id, html_url, youtube_url,
      from_date, to_date,
      image_width, image_height,
    } = req.body;

    if (new Date(to_date) < new Date(from_date)) {
      return res.status(400).json({ error: '종료일은 시작일보다 이후여야 합니다.' });
    }

    const adTypes = { hasImage: !!has_image, hasHtml: !!has_html, hasYoutube: !!has_youtube };
    if (!adTypes.hasImage && !adTypes.hasHtml && !adTypes.hasYoutube) {
      return res.status(400).json({ error: '광고물 유형을 하나 이상 선택하세요.' });
    }

    const fee = calculateFee(adTypes, from_date, to_date);
    const prevTotal = existing.total_fee;

    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    const imageFile = files?.image_file?.[0];
    const htmlFile  = files?.html_file?.[0];

    const campaignDir = path.join(process.cwd(), 'uploads', 'active', String(adv.id), existing.id);
    fs.mkdirSync(campaignDir, { recursive: true });

    let finalImageUrl = image_url || existing.image_url;
    let imagePath     = existing.image_path;
    let imageFilename = existing.image_filename;
    let imgW = image_width  ? parseInt(String(image_width))  : (existing.image_width  || null);
    let imgH = image_height ? parseInt(String(image_height)) : (existing.image_height || null);
    let finalHtmlUrl  = html_url  || existing.html_url;
    let htmlPath      = existing.html_path;
    let htmlFilename  = existing.html_filename;

    if (library_image_id) {
      const selected = await copyLibraryImage(
        library_image_id, adv.id, campaignDir, `/uploads/active/${adv.id}/${existing.id}`
      );
      if (!selected) return res.status(400).json({ error: '선택한 자료실 이미지를 찾을 수 없습니다.' });
      imagePath = selected.path;
      imageFilename = selected.filename;
      finalImageUrl = selected.url;
      imgW = selected.width;
      imgH = selected.height;
    } else if (imageFile) {
      const dest = path.join(campaignDir, imageFile.filename);
      fs.renameSync(imageFile.path, dest);
      imagePath     = dest;
      imageFilename = imageFile.originalname;
      finalImageUrl = `/uploads/active/${adv.id}/${existing.id}/${imageFile.filename}`;
    }
    if (htmlFile) {
      const dest = path.join(campaignDir, htmlFile.filename);
      fs.renameSync(htmlFile.path, dest);
      htmlPath     = dest;
      htmlFilename = htmlFile.originalname;
      finalHtmlUrl = `/uploads/active/${adv.id}/${existing.id}/${htmlFile.filename}`;
    }

    const newQuotationToken = uuidv4();

    await pool.execute(
      `UPDATE campaigns SET
       campaign_name=?, description=?,
       has_image=?, has_html=?, has_youtube=?,
       image_url=?, image_path=?, image_filename=?, image_width=?, image_height=?,
       html_url=?, html_path=?, html_filename=?,
       youtube_url=?, from_date=?, to_date=?,
       ad_days=?, base_fee=?, vat=?, total_fee=?,
       quotation_token=?, quotation_read_at=NULL, quotation_sent_at=NOW()
       WHERE id=?`,
      [
        campaign_name, description || '',
        adTypes.hasImage ? 1 : 0, adTypes.hasHtml ? 1 : 0, adTypes.hasYoutube ? 1 : 0,
        finalImageUrl, imagePath, imageFilename, imgW, imgH,
        finalHtmlUrl, htmlPath, htmlFilename,
        youtube_url || null, from_date, to_date,
        fee.days, fee.baseFee, fee.vat, fee.totalFee,
        newQuotationToken,
        existing.id,
      ]
    );

    const [advRows] = await pool.execute<any[]>(
      `SELECT company_name, fn_decrypt(contact_name) AS contact_name, fn_decrypt(contact_email) AS contact_email FROM advertisers WHERE id = ?`,
      [adv.id]
    );
    const advertiser = advRows[0];
    const updatedCampaign = { id: existing.id, campaign_name, has_image: adTypes.hasImage ? 1 : 0, has_html: adTypes.hasHtml ? 1 : 0, has_youtube: adTypes.hasYoutube ? 1 : 0, from_date, to_date, ad_days: fee.days, base_fee: fee.baseFee, vat: fee.vat, total_fee: fee.totalFee };
    const vars = buildQuotationVars(updatedCampaign, advertiser, newQuotationToken);

    const feeChanged = Number(prevTotal) !== fee.totalFee;
    const templateAdv = feeChanged ? 'quotation_updated_advertiser' : 'quotation_advertiser';
    const templateSup = feeChanged ? 'quotation_updated_supervisor' : 'quotation_supervisor';

    try { await sendEmail({ templateKey: templateAdv, to: advertiser.contact_email, vars, campaignId: existing.id, advertiserId: adv.id }); } catch {}
    try { await sendEmail({ templateKey: templateSup, to: process.env.SUPERVISOR_EMAIL || 'kimch@monorama.kr', vars, campaignId: existing.id, advertiserId: adv.id }); } catch {}

    res.json({ ok: true, fee, message: feeChanged ? '견적서가 재발송되었습니다.' : '캠페인이 수정되었습니다.' });
  }
);

// 캠페인 취소
router.delete('/:id', requireAdvertiser, async (req: Request, res: Response) => {
  const adv = (req.session as any).advertiser;
  const [rows] = await pool.execute<any[]>(
    'SELECT * FROM campaigns WHERE id = ? AND advertiser_id = ?',
    [req.params.id, adv.id]
  );
  if (!rows.length) return res.status(404).json({ error: '캠페인을 찾을 수 없습니다.' });
  const campaign = rows[0];

  if (!['입금전'].includes(campaign.status)) {
    return res.status(400).json({ error: '입금전 상태의 캠페인만 취소할 수 있습니다.' });
  }

  await pool.execute('UPDATE campaigns SET status = ?, files_backed_up = 0 WHERE id = ?', ['취소', campaign.id]);

  backupCampaignFiles(campaign.id, adv.id);
  await pool.execute('UPDATE campaigns SET files_backed_up = 1 WHERE id = ?', [campaign.id]);

  const [advRows] = await pool.execute<any[]>(
    `SELECT company_name, fn_decrypt(contact_name) AS contact_name, fn_decrypt(contact_email) AS contact_email FROM advertisers WHERE id = ?`,
    [adv.id]
  );
  const advertiser = advRows[0];

  try {
    await sendEmail({
      templateKey: 'campaign_cancelled_advertiser',
      to: advertiser.contact_email,
      vars: { contact_name: advertiser.contact_name, campaign_id: campaign.id, campaign_name: campaign.campaign_name, supervisor_email: process.env.SUPERVISOR_EMAIL || 'kimch@monorama.kr' },
      campaignId: campaign.id, advertiserId: adv.id,
    });
  } catch {}
  try {
    await sendEmail({
      templateKey: 'campaign_cancelled_supervisor',
      to: process.env.SUPERVISOR_EMAIL || 'kimch@monorama.kr',
      vars: { company_name: advertiser.company_name, campaign_id: campaign.id, campaign_name: campaign.campaign_name, cancelled_at: new Date().toLocaleString('ko-KR') },
      campaignId: campaign.id, advertiserId: adv.id,
    });
  } catch {}

  res.json({ ok: true });
});

// Excel 다운로드 (조회조건 전체)
router.get('/excel/download', requireAdvertiser, async (req: Request, res: Response) => {
  const adv = (req.session as any).advertiser;
  const { campaign_name, ad_type, from_date, to_date, status } = req.query;

  let where = 'WHERE c.advertiser_id = ?';
  const params: any[] = [adv.id];
  if (campaign_name) { where += ' AND c.campaign_name LIKE ?'; params.push(`%${campaign_name}%`); }
  if (ad_type === 'image')   { where += ' AND c.has_image = 1'; }
  if (ad_type === 'html')    { where += ' AND c.has_html = 1'; }
  if (ad_type === 'youtube') { where += ' AND c.has_youtube = 1'; }
  if (from_date) { where += ' AND c.from_date >= ?'; params.push(from_date); }
  if (to_date)   { where += ' AND c.to_date <= ?';   params.push(to_date); }
  if (status)    { where += ' AND c.status = ?';     params.push(status); }

  const [rows] = await pool.execute<any[]>(
    `SELECT c.* FROM campaigns c ${where} ORDER BY c.created_at DESC`, params
  );

  const wb  = new ExcelJS.Workbook();
  const ws  = wb.addWorksheet('캠페인 목록');
  ws.columns = [
    { header: '캠페인명',    key: 'campaign_name', width: 30 },
    { header: '이미지',      key: 'has_image',     width: 8  },
    { header: 'HTML',        key: 'has_html',      width: 8  },
    { header: 'YouTube',     key: 'has_youtube',   width: 10 },
    { header: '시작일',      key: 'from_date',     width: 12 },
    { header: '종료일',      key: 'to_date',       width: 12 },
    { header: '광고료(원)',  key: 'total_fee',     width: 14 },
    { header: '상태',        key: 'status',        width: 10 },
  ];
  ws.getRow(1).font = { bold: true };
  for (const r of rows) {
    ws.addRow({
      campaign_name: r.campaign_name,
      has_image:     r.has_image  ? 'O' : '',
      has_html:      r.has_html   ? 'O' : '',
      has_youtube:   r.has_youtube? 'O' : '',
      from_date:     r.from_date instanceof Date ? r.from_date.toISOString().slice(0, 10) : (typeof r.from_date === 'string' ? r.from_date.split('T')[0] : r.from_date),
      to_date:       r.to_date   instanceof Date ? r.to_date.toISOString().slice(0, 10)   : (typeof r.to_date   === 'string' ? r.to_date.split('T')[0]   : r.to_date),
      total_fee:     r.total_fee,
      status:        r.status,
    });
  }

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="campaigns.xlsx"');
  await wb.xlsx.write(res);
  res.end();
});

// 견적서 읽음 추적
router.get('/track/:token', async (req: Request, res: Response) => {
  await pool.execute(
    'UPDATE campaigns SET quotation_read_at = NOW() WHERE quotation_token = ? AND quotation_read_at IS NULL',
    [req.params.token]
  );
  // 1x1 투명 GIF
  const pixel = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
  res.setHeader('Content-Type', 'image/gif');
  res.send(pixel);
});

export default router;
