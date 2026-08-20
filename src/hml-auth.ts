import batch from './hml-batch';

interface Env {
  DB: D1Database;
  FILES: R2Bucket;
  ASSETS: Fetcher;
  APP_ENVIRONMENT: string;
  DEFAULT_TENANT_ID: string;
  ACCESS_TEAM_DOMAIN: string;
  ACCESS_AUD: string;
  HML_USERNAME?: string;
  HML_PASSWORD?: string;
}

function authorized(request: Request, env: Env): boolean {
  if (!env.HML_PASSWORD) return false;
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Basic ')) return false;
  try {
    const decoded = atob(header.slice(6));
    const split = decoded.indexOf(':');
    if (split < 0) return false;
    return decoded.slice(0, split) === (env.HML_USERNAME || 'homologacao') && decoded.slice(split + 1) === env.HML_PASSWORD;
  } catch { return false; }
}

function challenge(): Response {
  return new Response('Autenticação necessária para a homologação.', {
    status: 401,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'www-authenticate': 'Basic realm="NegocIAJá HML", charset="UTF-8"',
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex, nofollow, noarchive',
      'x-content-type-options': 'nosniff'
    }
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (env.APP_ENVIRONMENT === 'hml' && !authorized(request, env)) return challenge();
    return batch.fetch(request, env);
  }
};
