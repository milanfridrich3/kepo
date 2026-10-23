import 'express';
import type { Language, User } from '../types';

declare global {
  namespace Express {
    interface Request {
      user?: User;
      /** Language the client asked for (Accept-Language), used to localize error messages. */
      lang: Language;
    }
  }
}
