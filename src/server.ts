import express, { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import session from 'express-session';
import MySQLStore from 'express-mysql-session';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();

import pool from './config/database';
import authRouter     from './routes/auth';
import campaignRouter from './routes/campaign';
import adminRouter    from './routes/admin';
import libraryRouter  from './routes/library';
import notificationRouter from './routes/notification';
import { writeErrorLog } from './utils/error-logger';

console.log('[startup] 환경 설정과 모듈 로드 완료');

const app  = express();
const PORT = parseInt(process.env.PORT || '3000');
app.set('trust proxy', 1);

// ── Session Store ──────────────────────────────────────────
const MySQLStoreSession = MySQLStore(session as any);
const sessionStore = new MySQLStoreSession({
  clearExpired:         true,
  checkExpirationInterval: 900000,
  expiration:          20 * 60 * 1000,
  createDatabaseTable:  true,
  schema: { tableName: 'sessions', columnNames: { session_id: 'session_id', expires: 'expires', data: 'data' } },
} as any, pool as any);
console.log('[startup] 세션 저장소 생성 완료');

app.use(session({
  secret:            process.env.SESSION_SECRET || 'monorama_secret',
  store:             sessionStore,
  resave:            false,
  saveUninitialized: false,
  cookie: {
    secure:   false,
    httpOnly: true,
    maxAge:   20 * 60 * 1000, // 20분
  },
}));

// ── Middleware ─────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files
app.use(express.static(path.join(__dirname, '..', 'public'), { index: false, redirect: false }));
// uploads/active만 서빙 (backup은 서빙 안 함)
app.use('/uploads/active', express.static(path.join(__dirname, '..', 'uploads', 'active')));
app.use('/uploads/library', express.static(path.join(__dirname, '..', 'uploads', 'library')));

// ── API Routes ────────────────────────────────────────────
app.use('/api/auth',      authRouter);
app.use('/api/campaigns', campaignRouter);
app.use('/api/admin',     adminRouter);
app.use('/api/library',   libraryRouter);
app.use('/api/notifications', notificationRouter);
app.use('/api', (_req, res) => res.status(404).json({ error: '요청한 API를 찾을 수 없습니다.' }));
console.log('[startup] 미들웨어와 API 라우트 구성 완료');

// ── Page Routes ───────────────────────────────────────────
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'home.html'));
});
app.get('/admin', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});
app.get('/register', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'register.html'));
});
app.get('/dashboard', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'dashboard.html'));
});
app.get('/profile', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'profile.html'));
});
app.get('/supervisor', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin', 'index.html'));
});
app.get('/supervisor/dashboard', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin', 'dashboard.html'));
});

app.use((_req, res) => {
  res.status(404).sendFile(path.join(__dirname, '..', 'public', '404.html'));
});

app.use((error: Error, req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof multer.MulterError) {
    const message = error.code === 'LIMIT_FILE_SIZE'
      ? '이미지 크기는 20MB 이하여야 합니다.'
      : `파일 업로드 오류: ${error.message}`;
    return res.status(400).json({ error: message });
  }
  writeErrorLog(error, {
    type: 'http-500', method: req.method, url: req.originalUrl,
    ip: req.ip, forwardedFor: req.headers['x-forwarded-for'], userAgent: req.headers['user-agent'],
  });
  console.error(error);
  if (req.originalUrl.startsWith('/api/')) {
    return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
  return res.status(500).sendFile(path.join(__dirname, '..', 'public', '500.html'));
});

process.on('unhandledRejection', reason => writeErrorLog(reason, { type: 'unhandled-rejection' }));
process.on('uncaughtException', error => writeErrorLog(error, { type: 'uncaught-exception' }));

app.listen(PORT, () => {
  const localUrl = `http://localhost:${PORT}`;
  // BASE_URL 은 견적서·이메일 링크의 기준이 되는 전체 URL(예: https://xxx.ngrok-free.app).
  // 스킴 없이 호스트만 적힌 경우도 있어 보정한다.
  const base = (process.env.BASE_URL || '').trim().replace(/\/+$/, '');
  const publicUrl = base
    ? (/^https?:\/\//i.test(base) ? base : `http://${base}:${PORT}`)
    : '';

  console.log(`모노라마 광고 관리 시스템 실행 중: ${localUrl}`);
  if (publicUrl && publicUrl !== localUrl) {
    console.log(`외부 접속 주소(BASE_URL): ${publicUrl}`);
  }
});

export default app;
