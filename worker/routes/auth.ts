import { Hono } from 'hono';
import { requestCodeSchema, verifyCodeSchema } from '../../shared/schemas';
import { INVALID_CODE_MESSAGE, issueCode, verifyCode } from '../domain/codes';
import { normalizeEmail } from '../domain/phone';
import { HOUR, enforceRateLimit } from '../domain/rate-limit';
import { createSession, currentUser, destroySession } from '../domain/sessions';
import { AppError, clientIp, parseBody, type AppEnv } from '../lib/http';
import { dispatch } from '../messaging/dispatch';
import { loginCode } from '../messaging/templates';

export const authRoutes = new Hono<AppEnv>();

const badEmail = () =>
  new AppError(400, 'validation', 'Enter a valid email address.', {
    fields: { email: 'Enter a valid email address.' },
  });

authRoutes.post('/request-code', async (c) => {
  const body = await parseBody(c, requestCodeSchema);
  const email = normalizeEmail(body.email);
  if (!email) throw badEmail();

  await enforceRateLimit(c.env, `login:ip:${clientIp(c)}`, 20, HOUR);
  await enforceRateLimit(c.env, `login:email:${email}`, 5, HOUR);

  // New and returning organizers take the same path, so the response cannot
  // reveal whether an email already has an account.
  const code = await issueCode(c.env, { kind: 'organizer', email });
  await dispatch(c.env, { channel: 'email', to: email, template: 'login_code', ...loginCode({ code }) });
  return c.json({ ok: true });
});

authRoutes.post('/verify', async (c) => {
  const body = await parseBody(c, verifyCodeSchema);
  const email = normalizeEmail(body.email);
  if (!email) throw badEmail();

  if (!(await verifyCode(c.env, { kind: 'organizer', email }, body.code))) {
    throw new AppError(400, 'invalid_code', INVALID_CODE_MESSAGE, { fields: { code: INVALID_CODE_MESSAGE } });
  }

  await c.env.DB.prepare('INSERT INTO users (id, email, created_at) VALUES (?, ?, ?) ON CONFLICT (email) DO NOTHING')
    .bind(crypto.randomUUID(), email, new Date().toISOString())
    .run();
  const user = await c.env.DB.prepare('SELECT id, email, name FROM users WHERE email = ?')
    .bind(email)
    .first<{ id: string; email: string; name: string | null }>();
  if (!user) throw new Error('User row missing after insert');

  await createSession(c, user.id);
  return c.json({ user });
});

authRoutes.post('/logout', async (c) => {
  await destroySession(c);
  return c.json({ ok: true });
});

authRoutes.get('/me', async (c) => {
  const user = await currentUser(c);
  if (!user) throw new AppError(401, 'unauthorized', 'Please log in.');
  c.header('Cache-Control', 'no-store');
  return c.json({ user });
});
