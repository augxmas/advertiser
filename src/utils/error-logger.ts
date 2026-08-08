import fs from 'fs';
import path from 'path';

const LOG_DIRECTORY = path.join(process.cwd(), 'logs');

function serializeError(error: unknown) {
  if (error instanceof Error) return { name: error.name, message: error.message, stack: error.stack };
  return { name: 'UnknownError', message: String(error), stack: undefined };
}

export function writeErrorLog(error: unknown, context: Record<string, unknown> = {}) {
  const now = new Date();
  const date = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
  const entry = JSON.stringify({
    timestamp: now.toISOString(),
    koreaTime: now.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }),
    ...context,
    error: serializeError(error),
  }) + '\n';

  try {
    fs.mkdirSync(LOG_DIRECTORY, { recursive: true });
    fs.appendFileSync(path.join(LOG_DIRECTORY, `error-${date}.log`), entry, 'utf8');
  } catch (logError) {
    console.error('오류 로그 기록 실패:', logError);
  }
}
