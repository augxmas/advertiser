import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import pool from '../config/database';
dotenv.config();

const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST || 'smtp.worksmobile.com',
  port:   parseInt(process.env.SMTP_PORT || '465'),
  secure: true,
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  },
});

const templatesPath = path.join(process.cwd(), 'email-templates.json');
let templates: Record<string, { subject: string; body: string }> = {};

function loadTemplates() {
  try {
    const raw = fs.readFileSync(templatesPath, 'utf-8');
    templates = JSON.parse(raw).templates;
  } catch {
    templates = {};
  }
}
loadTemplates();

function replacePlaceholders(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

const SEAL_PATH = path.join(process.cwd(), 'public', 'images', 'seal.png');
const QUOTATION_TEMPLATES = new Set(['quotation_advertiser', 'quotation_updated_advertiser']);

export async function sendEmail(params: {
  templateKey:    string;
  to:             string;
  vars:           Record<string, string>;
  campaignId?:    string;
  advertiserId?:  number;
  attachments?:   { filename: string; path: string }[];
}): Promise<void> {
  const tpl = templates[params.templateKey];
  if (!tpl) throw new Error(`이메일 템플릿을 찾을 수 없습니다: ${params.templateKey}`);

  const subject = replacePlaceholders(tpl.subject, params.vars);
  const html    = replacePlaceholders(tpl.body,    params.vars);

  const inlineAttachments: any[] = [];
  if (QUOTATION_TEMPLATES.has(params.templateKey) && fs.existsSync(SEAL_PATH)) {
    inlineAttachments.push({ filename: 'seal.png', path: SEAL_PATH, cid: 'company_seal' });
  }

  let status: 'sent' | 'failed' = 'sent';
  let errorMsg = '';

  try {
    await transporter.sendMail({
      from:        `"${process.env.SMTP_FROM_NAME}" <${process.env.SMTP_FROM}>`,
      to:          params.to,
      subject,
      html,
      attachments: [...(params.attachments || []), ...inlineAttachments],
    });
  } catch (e: any) {
    status   = 'failed';
    errorMsg = e.message;
    console.error('[Email Error]', e.message);
  }

  await pool.execute(
    `INSERT INTO email_logs (template_key, to_email, subject, campaign_id, advertiser_id, status, error_msg)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [params.templateKey, params.to, subject, params.campaignId || null, params.advertiserId || null, status, errorMsg || null]
  );

  if (status === 'failed') throw new Error(errorMsg);
}

export function getSystemVars(): Record<string, string> {
  return {
    company_name_mono: process.env.COMPANY_NAME       || '(주)모노라마',
    company_ceo:       process.env.COMPANY_CEO        || '김창호',
    company_biz_no:    process.env.COMPANY_BIZ_NO     || '277-86-00185',
    bank_name:         process.env.COMPANY_BANK_NAME  || '국민은행',
    bank_account:      process.env.COMPANY_BANK_ACCOUNT || '000-000-000000',
    tax_email:         process.env.TAX_MANAGER_EMAIL  || 'kimch@monorama.kr',
    supervisor_email:  process.env.SUPERVISOR_EMAIL   || 'kimch@monorama.kr',
    login_url:         `${process.env.BASE_URL || 'http://localhost:3000'}/`,
  };
}
