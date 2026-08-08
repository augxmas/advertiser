import { Router, Request, Response, NextFunction } from 'express';
import pool from '../config/database';
import { requireAdvertiser, requireSupervisor } from '../middleware/auth';
import { addNotificationClient, removeNotificationClient, addSupervisorNotificationClient, removeSupervisorNotificationClient } from '../services/notification.service';

const router = Router();
const asyncHandler = (handler: (req: Request, res: Response) => Promise<any>) =>
  (req: Request, res: Response, next: NextFunction) => Promise.resolve(handler(req, res)).catch(next);

router.get('/', requireAdvertiser, asyncHandler(async (req: Request, res: Response) => {
  const advertiserId = Number((req.session as any).advertiser.id);
  const [rows] = await pool.execute<any[]>(
    `SELECT id, event_type, title, message, campaign_id, is_read, created_at
     FROM notifications WHERE advertiser_id = ? ORDER BY created_at DESC, id DESC LIMIT 100`,
    [advertiserId]
  );
  res.json({ ok: true, data: rows, unreadCount: rows.filter(row => !row.is_read).length });
}));

router.get('/stream', requireAdvertiser, (req: Request, res: Response) => {
  const advertiserId = Number((req.session as any).advertiser.id);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  res.write('event: connected\ndata: {}\n\n');
  addNotificationClient(advertiserId, res);
  const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 25000);
  req.on('close', () => {
    clearInterval(heartbeat);
    removeNotificationClient(advertiserId, res);
  });
});

router.put('/read-all', requireAdvertiser, asyncHandler(async (req: Request, res: Response) => {
  const advertiserId = Number((req.session as any).advertiser.id);
  await pool.execute('UPDATE notifications SET is_read = 1, read_at = NOW() WHERE advertiser_id = ? AND is_read = 0', [advertiserId]);
  res.json({ ok: true });
}));

router.put('/:id/read', requireAdvertiser, asyncHandler(async (req: Request, res: Response) => {
  const advertiserId = Number((req.session as any).advertiser.id);
  await pool.execute(
    'UPDATE notifications SET is_read = 1, read_at = NOW() WHERE id = ? AND advertiser_id = ?',
    [req.params.id, advertiserId]
  );
  res.json({ ok: true });
}));

router.get('/supervisor/list', requireSupervisor, asyncHandler(async (_req: Request, res: Response) => {
  const [rows] = await pool.execute<any[]>(
    `SELECT id, event_type, title, message, campaign_id, advertiser_id, is_read, created_at
     FROM supervisor_notifications ORDER BY created_at DESC, id DESC LIMIT 100`
  );
  res.json({ ok: true, data: rows, unreadCount: rows.filter(row => !row.is_read).length });
}));

router.get('/supervisor/stream', requireSupervisor, (req: Request, res: Response) => {
  const username = String((req.session as any).supervisor.username);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  res.write('event: connected\ndata: {}\n\n');
  addSupervisorNotificationClient(username, res);
  const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 25000);
  req.on('close', () => {
    clearInterval(heartbeat);
    removeSupervisorNotificationClient(username, res);
  });
});

router.put('/supervisor/read-all', requireSupervisor, asyncHandler(async (_req: Request, res: Response) => {
  await pool.execute('UPDATE supervisor_notifications SET is_read = 1, read_at = NOW() WHERE is_read = 0');
  res.json({ ok: true });
}));

router.put('/supervisor/:id/read', requireSupervisor, asyncHandler(async (req: Request, res: Response) => {
  await pool.execute('UPDATE supervisor_notifications SET is_read = 1, read_at = NOW() WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
}));

export default router;
