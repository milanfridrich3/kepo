import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { authRouter } from './routes/auth.routes';
import { accountRouter } from './routes/account.routes';
import { categoriesRouter } from './routes/categories.routes';
import { locationsRouter } from './routes/locations.routes';
import { itemsRouter } from './routes/items.routes';
import { borrowingRouter } from './routes/borrowing.routes';
import { warrantiesRouter } from './routes/warranties.routes';
import { dashboardRouter } from './routes/dashboard.routes';
import { searchRouter } from './routes/search.routes';
import { insightsRouter } from './routes/insights.routes';
import { remindersRouter } from './routes/reminders.routes';
import { suggestRouter } from './routes/suggest.routes';
import { requestLog } from './middleware/requestLog';
import { householdRouter } from './routes/household.routes';
import { calendarSettingsRouter, calendarFeedRouter } from './routes/calendar.routes';
import { pool } from './db/pool';
import { itemFilesRouter } from './routes/itemFiles.routes';
import { savedSearchesRouter } from './routes/savedSearches.routes';
import { feedbackRouter } from './routes/feedback.routes';
import { requireAuth, requireVerified } from './middleware/auth';
import { languageMiddleware } from './middleware/language';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { forbidden } from './utils/errors';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function createApp() {
  const isProd = process.env.NODE_ENV === 'production';
  const clientOrigin = process.env.CLIENT_ORIGIN;

  if (isProd && !clientOrigin) {
    throw new Error(
      'CLIENT_ORIGIN must be set in production (the origin the web app is served from).',
    );
  }

  const allowedOrigins = new Set([
    clientOrigin || 'http://localhost:5173',
    'https://localhost',
  ]);

  const app = express();
  app.disable('x-powered-by');

  if (isProd) app.set('trust proxy', 1);

  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; frame-ancestors 'none'",
    );

    if (isProd) {
      res.setHeader(
        'Strict-Transport-Security',
        'max-age=15552000; includeSubDomains',
      );
    }

    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.has(origin)) {
          callback(null, true);
        } else {
          callback(null, false);
        }
      },
      credentials: true,
    }),
  );

  app.use(languageMiddleware);

  // CSRF protection: allow state-changing requests only from trusted origins.
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (SAFE_METHODS.has(req.method)) return next();

    const origin = req.get('origin');

    if (origin && !allowedOrigins.has(origin)) {
      return next(
        forbidden('This request came from an origin that is not allowed.'),
      );
    }

    next();
  });

  if (process.env.NODE_ENV !== 'test') app.use(requestLog());
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.get('/api/health', (req, res) => res.json({ ok: true }));
  // Readiness: also checks the database. Answers only ok/not ok, never error details.
  app.get('/api/ready', async (req, res) => {
    try { await pool.query('SELECT 1'); res.json({ ok: true }); } catch { res.status(503).json({ ok: false }); }
  });
  // Calendar feed: authenticated by the secret in the address, so deliberately outside requireAuth.
  app.use('/api/calendar', calendarFeedRouter);

  app.use('/api/auth', authRouter);

  app.use('/api/account', requireAuth, accountRouter);
  app.use('/api/categories', requireAuth, requireVerified, categoriesRouter);
  app.use('/api/locations', requireAuth, requireVerified, locationsRouter);
  app.use('/api/items', requireAuth, requireVerified, itemsRouter);
  app.use('/api/items', requireAuth, requireVerified, itemFilesRouter);
  app.use('/api/saved-searches', requireAuth, requireVerified, savedSearchesRouter);
  app.use('/api/borrowing', requireAuth, requireVerified, borrowingRouter);
  app.use('/api/warranties', requireAuth, requireVerified, warrantiesRouter);
  app.use('/api/dashboard', requireAuth, requireVerified, dashboardRouter);
  app.use('/api/search', requireAuth, requireVerified, searchRouter);
  app.use('/api/insights', requireAuth, requireVerified, insightsRouter);
  app.use('/api/reminders', requireAuth, requireVerified, remindersRouter);
  app.use('/api/suggest', requireAuth, requireVerified, suggestRouter);
  app.use('/api/household', requireAuth, requireVerified, householdRouter);
  app.use('/api/calendar-feed', requireAuth, requireVerified, calendarSettingsRouter);
  app.use('/api/feedback', requireAuth, requireVerified, feedbackRouter);

  app.use('/api', notFoundHandler);
  app.use(errorHandler);

  return app;
}
