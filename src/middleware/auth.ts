import { Request, Response, NextFunction } from 'express';

export function requireAdvertiser(req: Request, res: Response, next: NextFunction) {
  if ((req.session as any).advertiser) {
    return next();
  }
  if (req.xhr || req.originalUrl.startsWith('/api/')) {
    return res.status(401).json({ error: '로그인이 필요합니다.' });
  }
  res.redirect('/');
}

export function requireSupervisor(req: Request, res: Response, next: NextFunction) {
  if ((req.session as any).supervisor) {
    return next();
  }
  if (req.xhr || req.originalUrl.startsWith('/api/')) {
    return res.status(401).json({ error: '관리자 로그인이 필요합니다.' });
  }
  res.redirect('/supervisor');
}

export function updateActivity(req: Request, _res: Response, next: NextFunction) {
  (req.session as any).lastActivity = Date.now();
  next();
}
