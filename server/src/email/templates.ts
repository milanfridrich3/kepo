import type { Language } from '../types';

/**
 * Transactional email content for Kepo, in English and Czech, as both HTML and
 * plain text. Pure functions: they take everything they need as arguments, so
 * they can be rendered and inspected in tests without sending anything.
 *
 * Layout notes: a single centred 560px column of nested tables with inline
 * styles (the only thing mail clients render consistently), fluid below that
 * width, light card on a light canvas, brand purple #331DAA. No JavaScript,
 * no web fonts, no tracking pixels. The logo is the only remote image and the
 * wordmark is real text, so the message reads fine with images blocked.
 */

export type EmailKind = 'welcome' | 'verify_email' | 'reset_password' | 'password_changed' | 'reminder_digest';

export interface EmailEnv {
  /** Public origin of the web app, e.g. https://app.kepo.is-cool.dev (no trailing slash). */
  appUrl: string;
  /** Absolute URL of a PNG logo (SVG is not supported by most mail clients). */
  logoUrl: string;
}

export interface EmailData {
  name: string;
  /** verify_email */
  code?: string;
  /** reset_password */
  resetUrl?: string;
  /** verify_email / reset_password: minutes until the code/link stops working. */
  ttlMinutes?: number;
  /** reminder_digest: one plain-text line per reminder (escaped here, never trusted as HTML). */
  lines?: string[];
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const BRAND = '#331DAA';
const BRAND_DARK = '#32247D';
const BRAND_SOFT = '#F0EDFD';
const INK = '#0F172A';
const MUTED = '#5B6579';
const LINE = '#E2E6ED';
const CANVAS = '#F8FAFC';
const FONT = "Inter, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const TAGLINE: Record<Language, string> = {
  en: 'Know what you own. Know where it is.',
  cs: 'Vězte, co vlastníte. Vězte, kde to je.',
};

interface Strings {
  welcome: { subject: string; preheader: string; title: (n: string) => string; intro: string; body: string; cta: string };
  verify: { subject: string; preheader: string; title: string; intro: (n: string) => string; codeLabel: string; expires: (m: number) => string; ignore: string };
  reset: { subject: string; preheader: string; title: string; intro: (n: string) => string; cta: string; fallback: string; expires: (m: number) => string; ignore: string };
  changed: { subject: string; preheader: string; title: string; intro: (n: string) => string; notYou: string; cta: string };
  digest: { subject: string; preheader: string; title: string; intro: (n: string) => string; cta: string; off: string };
  footer: { reason: string; team: string };
}

const STRINGS: Record<Language, Strings> = {
  en: {
    welcome: {
      subject: 'Welcome to Kepo',
      preheader: 'Your account is ready. Know what you own. Know where it is.',
      title: n => `Welcome to Kepo, ${n}`,
      intro: 'Your account is ready.',
      body: 'Kepo helps you organise your belongings and keep track of where they are: what you own, where it is stored, who you have lent it to and when its warranty ends.',
      cta: 'Open Kepo',
    },
    verify: {
      subject: 'Your Kepo verification code',
      preheader: 'Use this code to confirm your email address.',
      title: 'Confirm your email address',
      intro: n => `Hi ${n}, enter this code in Kepo to confirm your email address:`,
      codeLabel: 'Your verification code',
      expires: m => `The code expires in ${m} minutes and can be used once.`,
      ignore: 'If you did not create a Kepo account, you can safely ignore this email.',
    },
    reset: {
      subject: 'Reset your Kepo password',
      preheader: 'Use this link to choose a new password.',
      title: 'Reset your password',
      intro: n => `Hi ${n}, we received a request to reset the password of your Kepo account. Choose a new one with the button below.`,
      cta: 'Choose a new password',
      fallback: 'If the button does not work, copy this link into your browser:',
      expires: m => `The link expires in ${m} minutes and can be used once.`,
      ignore: 'If you did not ask for this, you can ignore this email. Your password will not change.',
    },
    changed: {
      subject: 'Your Kepo password was changed',
      preheader: 'A security notice about your Kepo account.',
      title: 'Your password was changed',
      intro: n => `Hi ${n}, the password of your Kepo account was just changed. You were signed out of your other devices.`,
      notYou: 'If this was not you, reset your password right away to secure your account.',
      cta: 'Reset password',
    },
    digest: {
      subject: 'Your Kepo reminders',
      preheader: 'Warranties ending and loans to follow up.',
      title: 'Things that need your attention',
      intro: n => `Hi ${n}, here is what is coming up in your Kepo:`,
      cta: 'Open Kepo',
      off: 'You get this email because daily reminders are switched on in Settings. You can switch them off there at any time.',
    },
    footer: {
      reason: 'You are receiving this email because of activity on your Kepo account.',
      team: 'Kepo',
    },
  },
  cs: {
    welcome: {
      subject: 'Vítejte v Kepo',
      preheader: 'Váš účet je připraven. Vězte, co vlastníte. Vězte, kde to je.',
      title: n => `Vítejte v Kepo, ${n}`,
      intro: 'Váš účet je připraven.',
      body: 'Kepo vám pomáhá mít pořádek ve vašich věcech a vědět, kde jsou: co vlastníte, kde to máte uložené, komu jste to půjčili a kdy končí záruka.',
      cta: 'Otevřít Kepo',
    },
    verify: {
      subject: 'Váš ověřovací kód do Kepo',
      preheader: 'Tímto kódem potvrdíte svou e-mailovou adresu.',
      title: 'Potvrďte svou e-mailovou adresu',
      intro: n => `Dobrý den, ${n}, zadejte tento kód v aplikaci Kepo a potvrďte svou e-mailovou adresu:`,
      codeLabel: 'Váš ověřovací kód',
      expires: m => `Platnost kódu vyprší za ${m} minut a lze jej použít jen jednou.`,
      ignore: 'Pokud jste si účet v Kepo nezakládali vy, můžete tento e-mail klidně ignorovat.',
    },
    reset: {
      subject: 'Obnovení hesla do Kepo',
      preheader: 'Tímto odkazem zvolíte nové heslo.',
      title: 'Obnovení hesla',
      intro: n => `Dobrý den, ${n}, obdrželi jsme žádost o obnovení hesla k vašemu účtu v Kepo. Nové heslo zvolíte tlačítkem níže.`,
      cta: 'Zvolit nové heslo',
      fallback: 'Pokud tlačítko nefunguje, zkopírujte tento odkaz do prohlížeče:',
      expires: m => `Platnost odkazu vyprší za ${m} minut a lze jej použít jen jednou.`,
      ignore: 'Pokud jste o obnovení nežádali, tento e-mail ignorujte. Vaše heslo se nezmění.',
    },
    changed: {
      subject: 'Vaše heslo do Kepo bylo změněno',
      preheader: 'Bezpečnostní oznámení k vašemu účtu v Kepo.',
      title: 'Vaše heslo bylo změněno',
      intro: n => `Dobrý den, ${n}, heslo k vašemu účtu v Kepo bylo právě změněno. Na ostatních zařízeních jste byli odhlášeni.`,
      notYou: 'Pokud jste heslo neměnili vy, okamžitě si ho obnovte a zabezpečte tak svůj účet.',
      cta: 'Obnovit heslo',
    },
    digest: {
      subject: 'Vaše upozornění z Kepo',
      preheader: 'Končící záruky a půjčky, na které je dobré se podívat.',
      title: 'Co vyžaduje vaši pozornost',
      intro: n => `Dobrý den, ${n}, tohle se blíží ve vašem Kepo:`,
      cta: 'Otevřít Kepo',
      off: 'Tento e-mail dostáváte, protože máte v Nastavení zapnutá denní upozornění. Vypnout je tam můžete kdykoli.',
    },
    footer: {
      reason: 'Tento e-mail jste obdrželi kvůli aktivitě na vašem účtu v Kepo.',
      team: 'Kepo',
    },
  },
};

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** A name as it appears after "Hi": first word only, falling back to something neutral. */
export function greetingName(fullName: string, lang: Language): string {
  const first = fullName.trim().split(/\s+/)[0];
  if (first) return first;
  return lang === 'cs' ? 'uživateli' : 'there';
}

function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 8px;"><tr><td style="border-radius:10px;background:${BRAND};">
    <a href="${escapeHtml(href)}" style="display:inline-block;padding:13px 24px;font-family:${FONT};font-size:15px;font-weight:600;line-height:20px;color:#FFFFFF;text-decoration:none;border-radius:10px;">${escapeHtml(label)}</a>
  </td></tr></table>`;
}

function paragraph(html: string, extra = ''): string {
  return `<p style="margin:0 0 16px;font-family:${FONT};font-size:15px;line-height:24px;color:${INK};${extra}">${html}</p>`;
}

function layout(lang: Language, env: EmailEnv, subject: string, preheader: string, title: string, content: string): string {
  const s = STRINGS[lang];
  return `<!DOCTYPE html>
<html lang="${lang}" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${CANVAS};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CANVAS};">
<tr><td align="center" style="padding:28px 12px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
    <tr><td style="padding:0 4px 18px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="padding-right:10px;"><img src="${escapeHtml(env.logoUrl)}" width="32" height="32" alt="" style="display:block;border:0;border-radius:8px;"></td>
        <td style="font-family:${FONT};font-size:20px;font-weight:700;letter-spacing:-0.02em;color:${BRAND};">Kepo</td>
      </tr></table>
    </td></tr>
    <tr><td style="background:#FFFFFF;border:1px solid ${LINE};border-radius:16px;padding:32px 28px;">
      <h1 style="margin:0 0 16px;font-family:${FONT};font-size:22px;line-height:30px;font-weight:700;letter-spacing:-0.01em;color:${INK};">${escapeHtml(title)}</h1>
      ${content}
    </td></tr>
    <tr><td style="padding:20px 8px 0;font-family:${FONT};font-size:12px;line-height:18px;color:${MUTED};text-align:center;">
      <strong style="color:${BRAND_DARK};">${escapeHtml(s.footer.team)}</strong> &middot; ${escapeHtml(TAGLINE[lang])}<br>
      ${escapeHtml(s.footer.reason)}
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
}

function textFooter(lang: Language): string {
  return `--\nKepo · ${TAGLINE[lang]}\n${STRINGS[lang].footer.reason}`;
}

export function renderEmail(kind: EmailKind, lang: Language, data: EmailData, env: EmailEnv): RenderedEmail {
  const s = STRINGS[lang];
  const who = greetingName(data.name, lang);

  if (kind === 'welcome') {
    const c = s.welcome;
    const title = c.title(who);
    const content =
      paragraph(escapeHtml(c.intro)) +
      paragraph(escapeHtml(c.body)) +
      paragraph(`<em>${escapeHtml(TAGLINE[lang])}</em>`, `color:${BRAND_DARK};`) +
      button(env.appUrl, c.cta);
    return {
      subject: c.subject,
      html: layout(lang, env, c.subject, c.preheader, title, content),
      text: [title, '', c.intro, '', c.body, '', TAGLINE[lang], '', `${c.cta}: ${env.appUrl}`, '', textFooter(lang)].join('\n'),
    };
  }

  if (kind === 'verify_email') {
    const c = s.verify;
    const code = data.code ?? '';
    const minutes = data.ttlMinutes ?? 15;
    const content =
      paragraph(escapeHtml(c.intro(who))) +
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 20px;"><tr><td align="center" style="background:${BRAND_SOFT};border-radius:12px;padding:18px 12px;">
        <div style="font-family:${FONT};font-size:12px;line-height:16px;color:${BRAND_DARK};margin-bottom:6px;">${escapeHtml(c.codeLabel)}</div>
        <div style="font-family:'SFMono-Regular',Menlo,Consolas,'Liberation Mono',monospace;font-size:34px;line-height:40px;font-weight:700;letter-spacing:8px;color:${BRAND_DARK};">${escapeHtml(code)}</div>
      </td></tr></table>` +
      paragraph(escapeHtml(c.expires(minutes)), `color:${MUTED};font-size:14px;line-height:22px;`) +
      paragraph(escapeHtml(c.ignore), `color:${MUTED};font-size:14px;line-height:22px;margin-bottom:0;`);
    return {
      subject: c.subject,
      html: layout(lang, env, c.subject, c.preheader, c.title, content),
      text: [c.title, '', c.intro(who), '', `${c.codeLabel}: ${code}`, '', c.expires(minutes), '', c.ignore, '', textFooter(lang)].join('\n'),
    };
  }

  if (kind === 'reset_password') {
    const c = s.reset;
    const url = data.resetUrl ?? env.appUrl;
    const minutes = data.ttlMinutes ?? 60;
    const content =
      paragraph(escapeHtml(c.intro(who))) +
      button(url, c.cta) +
      paragraph(escapeHtml(c.fallback), `color:${MUTED};font-size:13px;line-height:20px;margin:16px 0 4px;`) +
      `<p style="margin:0 0 16px;font-family:${FONT};font-size:13px;line-height:20px;word-break:break-all;"><a href="${escapeHtml(url)}" style="color:${BRAND};">${escapeHtml(url)}</a></p>` +
      paragraph(escapeHtml(c.expires(minutes)), `color:${MUTED};font-size:14px;line-height:22px;`) +
      paragraph(escapeHtml(c.ignore), `color:${MUTED};font-size:14px;line-height:22px;margin-bottom:0;`);
    return {
      subject: c.subject,
      html: layout(lang, env, c.subject, c.preheader, c.title, content),
      text: [c.title, '', c.intro(who), '', url, '', c.expires(minutes), '', c.ignore, '', textFooter(lang)].join('\n'),
    };
  }

  if (kind === 'reminder_digest') {
    const c = s.digest;
    const lines = data.lines ?? [];
    const list = `<ul style="margin:0 0 16px;padding-left:20px;font-family:${FONT};font-size:15px;line-height:24px;color:${INK};">${lines.map(l => `<li style="margin:0 0 8px;">${escapeHtml(l)}</li>`).join('')}</ul>`;
    const content = paragraph(escapeHtml(c.intro(who))) + list + button(env.appUrl, c.cta) +
      paragraph(escapeHtml(c.off), `color:${MUTED};font-size:13px;line-height:20px;margin:16px 0 0;`);
    return {
      subject: c.subject,
      html: layout(lang, env, c.subject, c.preheader, c.title, content),
      text: [c.title, '', c.intro(who), '', ...lines.map(l => `- ${l}`), '', `${c.cta}: ${env.appUrl}`, '', c.off, '', textFooter(lang)].join('\n'),
    };
  }

  const c = s.changed;
  const resetLink = `${env.appUrl}/forgot-password`;
  const content =
    paragraph(escapeHtml(c.intro(who))) +
    paragraph(escapeHtml(c.notYou)) +
    button(resetLink, c.cta);
  return {
    subject: c.subject,
    html: layout(lang, env, c.subject, c.preheader, c.title, content),
    text: [c.title, '', c.intro(who), '', c.notYou, '', `${c.cta}: ${resetLink}`, '', textFooter(lang)].join('\n'),
  };
}
