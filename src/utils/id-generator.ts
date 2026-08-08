import pool from '../config/database';

export async function generateCampaignId(): Promise<string> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const today = new Date();
    const yy = String(today.getFullYear()).slice(-2);
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const dateStr = `${yy}${mm}${dd}`;
    const seqDate = `${today.getFullYear()}-${mm}-${dd}`;

    await conn.execute(
      `INSERT INTO campaign_sequences (seq_date, last_seq) VALUES (?, 1)
       ON DUPLICATE KEY UPDATE last_seq = last_seq + 1`,
      [seqDate]
    );
    const [rows] = await conn.execute<any[]>(
      'SELECT last_seq FROM campaign_sequences WHERE seq_date = ?',
      [seqDate]
    );
    await conn.commit();
    const seq = String(rows[0].last_seq).padStart(4, '0');
    return `${dateStr}_${seq}`;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

export function generateVerificationCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export function formatCurrency(amount: number): string {
  return amount.toLocaleString('ko-KR');
}

export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}
