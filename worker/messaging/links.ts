import { signUnsubscribeToken, tokenSecret, type AddressRef } from '../domain/tokens';

/**
 * Every link in a message starts from APP_URL, because the cron handler has no
 * request to read an origin from.
 */
function base(env: Pick<Env, 'APP_URL'>): string {
  return env.APP_URL.replace(/\/+$/, '');
}

export const publicUrl = (env: Pick<Env, 'APP_URL'>, slug: string) => `${base(env)}/c/${slug}`;
export const portionUrl = (env: Pick<Env, 'APP_URL'>, token: string) => `${base(env)}/m/${token}`;
export const dashboardUrl = (env: Pick<Env, 'APP_URL'>, campaignId: string) => `${base(env)}/campaigns/${campaignId}`;

export async function unsubscribeUrl(env: Pick<Env, 'APP_URL' | 'TOKEN_SECRET'>, ref: AddressRef): Promise<string> {
  return `${base(env)}/unsubscribe/${await signUnsubscribeToken(tokenSecret(env), ref)}`;
}
