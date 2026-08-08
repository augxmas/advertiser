import fs from 'fs';
import path from 'path';

export interface AdTypes {
  hasImage:   boolean;
  hasHtml:    boolean;
  hasYoutube: boolean;
}

export function calculateFee(adTypes: AdTypes, fromDate: string, toDate: string) {
  const from = new Date(fromDate);
  const to   = new Date(toDate);
  const days = Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  const typeCount = [adTypes.hasImage, adTypes.hasHtml, adTypes.hasYoutube].filter(Boolean).length;
  const pricePerDay = parseInt(process.env.AD_PRICE_PER_DAY || '1000');
  const vatRate     = parseFloat(process.env.VAT_RATE || '0.1');
  const baseFee     = typeCount * days * pricePerDay;
  const vat         = Math.floor(baseFee * vatRate);
  const totalFee    = baseFee + vat;
  return { days, typeCount, baseFee, vat, totalFee };
}

export function adTypeLabel(row: any): string {
  const types: string[] = [];
  if (row.has_image)   types.push('이미지');
  if (row.has_html)    types.push('HTML');
  if (row.has_youtube) types.push('YouTube');
  return types.join(', ');
}

export function backupCampaignFiles(campaignId: string, advertiserId: number): void {
  const activeDir = path.join(process.cwd(), 'uploads', 'active', String(advertiserId), campaignId);
  const backupDir = path.join(process.cwd(), 'uploads', 'backup', String(advertiserId), campaignId);

  if (fs.existsSync(activeDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
    const files = fs.readdirSync(activeDir);
    for (const file of files) {
      fs.renameSync(path.join(activeDir, file), path.join(backupDir, file));
    }
    try { fs.rmdirSync(activeDir); } catch {}
  }
}

export function buildQuotationVars(campaign: any, advertiser: any, quotationToken?: string): Record<string, string> {
  const adTypes = adTypeLabel(campaign);
  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  return {
    campaign_id:      campaign.id,
    campaign_name:    campaign.campaign_name,
    company_name:     advertiser.company_name,
    contact_name:     advertiser.contact_name,
    contact_email:    advertiser.contact_email,
    ad_types:         adTypes,
    ad_types_count:   String([campaign.has_image, campaign.has_html, campaign.has_youtube].filter(Boolean).length),
    from_date:        campaign.from_date?.split('T')[0] || campaign.from_date,
    to_date:          campaign.to_date?.split('T')[0]   || campaign.to_date,
    ad_days:          String(campaign.ad_days),
    base_fee:         Number(campaign.base_fee).toLocaleString('ko-KR'),
    vat:              Number(campaign.vat).toLocaleString('ko-KR'),
    total_fee:        Number(campaign.total_fee).toLocaleString('ko-KR'),
    company_name_mono:     process.env.COMPANY_NAME          || '(주)모노라마',
    company_ceo:           process.env.COMPANY_CEO           || '김창호',
    company_biz_no:        process.env.COMPANY_BIZ_NO        || '277-86-00185',
    company_address:       process.env.COMPANY_ADDRESS       || '서울특별시',
    company_biz_type:      process.env.COMPANY_BIZ_TYPE      || '서비스',
    company_biz_category:  process.env.COMPANY_BIZ_CATEGORY  || '컴퓨터프로그램개발및공급',
    bank_name:             process.env.COMPANY_BANK_NAME     || '국민은행',
    bank_account:          process.env.COMPANY_BANK_ACCOUNT  || '000-000-000000',
    tax_email:             process.env.TAX_MANAGER_EMAIL     || 'kimch@monorama.kr',
    supervisor_email:      process.env.SUPERVISOR_EMAIL      || 'kimch@monorama.kr',
    tracking_pixel_url: quotationToken
      ? `${baseUrl}/api/campaigns/track/${quotationToken}`
      : '',
  };
}
