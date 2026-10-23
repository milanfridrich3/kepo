import type { Request, Response, NextFunction } from 'express';

/**
 * One line per request: method, path, status, duration. Never the query string (it can hold
 * search text), headers, cookies or bodies. The secret in a calendar-feed address is replaced.
 */
export function safePath(url: string): string {
  const path = url.split('?')[0].split('#')[0];
  return path.replace(/^(\/api\/calendar\/)[^/]+$/, '$1:token').slice(0, 200);
}

export function formatRequestLog(method: string, url: string, status: number, ms: number): string {
  return `${method.replace(/[^A-Z]/g, '').slice(0, 10)} ${safePath(url)} ${status} ${Math.round(ms)}ms`;
}

export function requestLog(write: (line: string) => void = line => console.log(line)) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.path === '/api/health' || req.path === '/api/ready') { next(); return; }
    const start = process.hrtime.bigint();
    res.on('finish', () => write(formatRequestLog(req.method, req.originalUrl, res.statusCode, Number(process.hrtime.bigint() - start) / 1e6)));
    next();
  };
}
