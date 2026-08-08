import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import pool from '../config/database';
import { requireAdvertiser } from '../middleware/auth';
import { uploadLibraryImage } from '../middleware/upload';
import { readImageDimensions } from '../utils/image-dimensions';

const router = Router();
const LIBRARY_ROOT = path.resolve(process.cwd(), 'uploads', 'library');

function normalizeTags(value: unknown): string {
  return String(value || '')
    .split(/[\s,]+/)
    .map(tag => tag.trim().replace(/^#/, ''))
    .filter(Boolean)
    .filter((tag, index, all) => all.indexOf(tag) === index)
    .join(',');
}

function safeOriginalName(name: string): string {
  const restored = Buffer.from(name, 'latin1').toString('utf8');
  return restored.includes('\ufffd') ? name : restored;
}

router.get('/', requireAdvertiser, async (req: Request, res: Response) => {
  const advertiserId = (req.session as any).advertiser.id;
  const [rows] = await pool.execute<any[]>(
    `SELECT id, file_url, original_name, mime_type, file_size, width, height,
            description, tags, uploaded_at, updated_at
     FROM image_library WHERE advertiser_id = ? ORDER BY uploaded_at DESC, id DESC`,
    [advertiserId]
  );
  res.json({ ok: true, data: rows });
});

router.post('/', requireAdvertiser, uploadLibraryImage.single('image'), async (req: Request, res: Response) => {
  const advertiserId = (req.session as any).advertiser.id;
  const file = req.file;
  if (!file) return res.status(400).json({ error: '업로드할 이미지를 선택하세요.' });

  const description = String(req.body.description || '').trim();
  const tags = normalizeTags(req.body.tags);
  if (description.length > 1000 || tags.length > 500) {
    fs.unlinkSync(file.path);
    return res.status(400).json({ error: '설명 또는 태그가 너무 깁니다.' });
  }

  try {
    const dimensions = readImageDimensions(file.path);
    if (!dimensions.width || !dimensions.height) throw new Error('올바른 이미지가 아닙니다.');
    const fileUrl = `/uploads/library/${advertiserId}/${file.filename}`;
    const [result] = await pool.execute<any>(
      `INSERT INTO image_library
       (advertiser_id, file_url, file_path, stored_name, original_name, mime_type,
        file_size, width, height, description, tags)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [advertiserId, fileUrl, file.path, file.filename, safeOriginalName(file.originalname),
       file.mimetype, file.size, dimensions.width, dimensions.height, description, tags]
    );
    res.status(201).json({ ok: true, id: result.insertId, width: dimensions.width, height: dimensions.height });
  } catch (error: any) {
    if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
    res.status(400).json({ error: error.message || '이미지 처리에 실패했습니다.' });
  }
});

router.put('/:id', requireAdvertiser, async (req: Request, res: Response) => {
  const advertiserId = (req.session as any).advertiser.id;
  const description = String(req.body.description || '').trim();
  const tags = normalizeTags(req.body.tags);
  if (description.length > 1000 || tags.length > 500) {
    return res.status(400).json({ error: '설명 또는 태그가 너무 깁니다.' });
  }
  const [result] = await pool.execute<any>(
    `UPDATE image_library SET description = ?, tags = ?, updated_at = NOW()
     WHERE id = ? AND advertiser_id = ?`,
    [description, tags, req.params.id, advertiserId]
  );
  if (!result.affectedRows) return res.status(404).json({ error: '자료를 찾을 수 없습니다.' });
  res.json({ ok: true });
});

router.delete('/:id', requireAdvertiser, async (req: Request, res: Response) => {
  const advertiserId = (req.session as any).advertiser.id;
  const [rows] = await pool.execute<any[]>(
    'SELECT file_path FROM image_library WHERE id = ? AND advertiser_id = ?',
    [req.params.id, advertiserId]
  );
  if (!rows.length) return res.status(404).json({ error: '자료를 찾을 수 없습니다.' });

  await pool.execute('DELETE FROM image_library WHERE id = ? AND advertiser_id = ?', [req.params.id, advertiserId]);
  const resolvedPath = path.resolve(rows[0].file_path);
  if (resolvedPath.startsWith(LIBRARY_ROOT + path.sep) && fs.existsSync(resolvedPath)) fs.unlinkSync(resolvedPath);
  res.json({ ok: true });
});

export default router;
