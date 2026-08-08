/**
 * 캠페인 상태 자동 업데이트 배치
 *
 * 실행 규칙 (매일 1회):
 *  1. 입금확인 + from_date <= today  → 광고중
 *  2. 광고중   + to_date   <  today  → 광고종료  (파일 백업)
 *  3. 입금전   + from_date <= today  → 취소       (파일 백업, 이메일)
 *
 * crontab 등록 예시:
 *   0 1 * * * /usr/bin/ts-node /home/user/advertiser/batch/campaign-status.ts >> /var/log/ad-batch.log 2>&1
 */

import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import pool from '../src/config/database';
import { sendEmail } from '../src/services/email.service';
import { backupCampaignFiles } from '../src/services/campaign.service';
import { createNotification } from '../src/services/notification.service';

async function log(msg: string) {
  const ts = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  console.log(`[${ts}] ${msg}`);
}

async function run() {
  await log('=== 캠페인 상태 배치 시작 ===');

  // ── 1. 입금확인 → 광고중 (from_date 도달) ─────────────────
  const [toActive] = await pool.execute<any[]>(
    `SELECT c.id, c.advertiser_id, c.campaign_name, c.from_date, c.to_date,
            fn_decrypt(a.contact_name) AS contact_name,
            fn_decrypt(a.contact_email) AS contact_email,
            a.company_name
     FROM campaigns c
     JOIN advertisers a ON c.advertiser_id = a.id
     WHERE c.status = '입금확인' AND c.from_date <= CURDATE()`
  );
  for (const row of toActive) {
    await pool.execute(
      `UPDATE campaigns SET status = '광고중', approved_at = NOW(), approved_by = 'batch' WHERE id = ?`,
      [row.id]
    );
    await log(`[광고중 전환] ${row.id} - ${row.campaign_name}`);
    try {
      await createNotification({ advertiserId: Number(row.advertiser_id), eventType: 'campaign_started', campaignId: row.id,
        title: '광고가 시작되었습니다', message: `${row.campaign_name} 캠페인의 광고가 시작되었습니다.` });
    } catch (e: any) { await log(`  알림 생성 실패: ${e.message}`); }
    try {
      await sendEmail({
        templateKey: 'campaign_started_advertiser',
        to: row.contact_email,
        vars: {
          contact_name:  row.contact_name,
          company_name:  row.company_name,
          campaign_name: row.campaign_name,
          campaign_id:   row.id,
          from_date:     row.from_date?.split('T')[0] || row.from_date,
          to_date:       row.to_date?.split('T')[0]   || row.to_date,
        },
        campaignId:   row.id,
        advertiserId: row.advertiser_id,
      });
    } catch (e: any) { await log(`  이메일 발송 실패: ${e.message}`); }
  }
  await log(`입금확인→광고중 처리: ${toActive.length}건`);

  // ── 2. 광고중 → 광고종료 (to_date 경과) ──────────────────
  const [toEnded] = await pool.execute<any[]>(
    `SELECT c.id, c.advertiser_id, c.campaign_name, c.from_date, c.to_date,
            fn_decrypt(a.contact_name) AS contact_name,
            fn_decrypt(a.contact_email) AS contact_email,
            a.company_name
     FROM campaigns c
     JOIN advertisers a ON c.advertiser_id = a.id
     WHERE c.status = '광고중' AND c.to_date < CURDATE()`
  );
  for (const row of toEnded) {
    await pool.execute(`UPDATE campaigns SET status = '광고종료' WHERE id = ?`, [row.id]);
    backupCampaignFiles(row.id, row.advertiser_id);
    await pool.execute(`UPDATE campaigns SET files_backed_up = 1 WHERE id = ?`, [row.id]);
    await log(`[광고종료 전환] ${row.id} - ${row.campaign_name}`);
    try {
      await createNotification({ advertiserId: Number(row.advertiser_id), eventType: 'campaign_ended', campaignId: row.id,
        title: '광고가 종료되었습니다', message: `${row.campaign_name} 캠페인의 광고가 종료되었습니다.` });
    } catch (e: any) { await log(`  알림 생성 실패: ${e.message}`); }
    try {
      await sendEmail({
        templateKey: 'campaign_ended_advertiser',
        to: row.contact_email,
        vars: {
          contact_name:  row.contact_name,
          company_name:  row.company_name,
          campaign_name: row.campaign_name,
          campaign_id:   row.id,
        },
        campaignId:   row.id,
        advertiserId: row.advertiser_id,
      });
    } catch (e: any) { await log(`  이메일 발송 실패: ${e.message}`); }
  }
  await log(`광고중→광고종료 처리: ${toEnded.length}건`);

  // ── 3. 입금전 → 취소 (from_date 도달했으나 입금 미확인) ─
  const [toCancelled] = await pool.execute<any[]>(
    `SELECT c.id, c.advertiser_id, c.campaign_name, c.from_date,
            fn_decrypt(a.contact_name) AS contact_name,
            fn_decrypt(a.contact_email) AS contact_email,
            a.company_name
     FROM campaigns c
     JOIN advertisers a ON c.advertiser_id = a.id
     WHERE c.status = '입금전' AND c.from_date <= CURDATE()`
  );
  for (const row of toCancelled) {
    await pool.execute(
      `UPDATE campaigns SET status = '취소', cancelled_at = NOW(), cancelled_by = 'batch' WHERE id = ?`,
      [row.id]
    );
    backupCampaignFiles(row.id, row.advertiser_id);
    await pool.execute(`UPDATE campaigns SET files_backed_up = 1 WHERE id = ?`, [row.id]);
    await log(`[자동취소] ${row.id} - ${row.campaign_name} (입금 미확인)`);
    try {
      await createNotification({ advertiserId: Number(row.advertiser_id), eventType: 'campaign_cancelled', campaignId: row.id,
        title: '캠페인이 자동 취소되었습니다', message: `${row.campaign_name} 캠페인이 입금 미확인으로 취소되었습니다.` });
    } catch (e: any) { await log(`  알림 생성 실패: ${e.message}`); }
    try {
      await sendEmail({
        templateKey: 'campaign_cancelled_advertiser',
        to: row.contact_email,
        vars: {
          contact_name:  row.contact_name,
          campaign_id:   row.id,
          campaign_name: row.campaign_name,
          supervisor_email: process.env.SUPERVISOR_EMAIL || 'kimch@monorama.kr',
        },
        campaignId:   row.id,
        advertiserId: row.advertiser_id,
      });
      await sendEmail({
        templateKey: 'campaign_cancelled_supervisor',
        to: process.env.SUPERVISOR_EMAIL || 'kimch@monorama.kr',
        vars: {
          company_name:  row.company_name,
          campaign_id:   row.id,
          campaign_name: row.campaign_name,
          cancelled_at:  new Date().toLocaleString('ko-KR'),
        },
        campaignId:   row.id,
        advertiserId: row.advertiser_id,
      });
    } catch (e: any) { await log(`  이메일 발송 실패: ${e.message}`); }
  }
  await log(`입금전→취소 처리: ${toCancelled.length}건`);

  await log('=== 캠페인 상태 배치 완료 ===\n');
  process.exit(0);
}

run().catch(async e => {
  await log(`[오류] ${e.message}`);
  process.exit(1);
});
