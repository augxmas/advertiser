import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

const UPLOAD_ROOT = path.join(process.cwd(), 'uploads', 'active');

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const bizCertStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.join(process.cwd(), 'uploads', 'biz-certs');
    ensureDir(dir);
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const adFileStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const advertiserId = (req.session as any).advertiser?.id || 'tmp';
    const dir = path.join(UPLOAD_ROOT, String(advertiserId));
    ensureDir(dir);
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const libraryImageStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const advertiserId = (req.session as any).advertiser?.id || 'tmp';
    const dir = path.join(process.cwd(), 'uploads', 'library', String(advertiserId));
    ensureDir(dir);
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    cb(null, `${uuidv4()}${path.extname(file.originalname).toLowerCase()}`);
  },
});

export const uploadBizCert = multer({
  storage: bizCertStorage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.pdf', '.jpg', '.jpeg', '.png'];
    if (allowed.includes(path.extname(file.originalname).toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error('PDF, JPG, PNG 파일만 업로드 가능합니다.'));
    }
  },
});

export const uploadAdFiles = multer({
  storage: adFileStorage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.html', '.htm'];
    if (allowed.includes(path.extname(file.originalname).toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error('이미지(JPG/PNG/GIF/WEBP) 또는 HTML 파일만 업로드 가능합니다.'));
    }
  },
});

export const uploadLibraryImage = multer({
  storage: libraryImageStorage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    if (allowed.includes(path.extname(file.originalname).toLowerCase())) cb(null, true);
    else cb(new Error('JPG, PNG, GIF, WebP 이미지만 업로드할 수 있습니다.'));
  },
});
