/** English strings: errors. Source of truth for the key set (the Czech file must define the same keys). */
export const errors = {
  'error.notFound': 'We could not find that.',
  'error.tooLarge': 'That is too large to upload.',
  'error.tooMany': 'Too many attempts. Please wait a moment and try again.',
  'error.server': 'Something went wrong on our side. Please try again in a moment.',
  'error.generic': 'Something went wrong. Please try again.',
  'error.timeout': 'That took too long. Check your connection and try again.',
  'error.network': 'Could not reach Kepo. Check your connection and try again.',
  'error.unreadable': 'Kepo sent a response we could not read. Please try again.',
  'error.sessionEnded': 'Your session has ended. Please sign in again.',
} as const;
