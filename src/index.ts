/*
 * NegocIAJá! — desenvolvido pela SER Comunicação
 * CNPJ 23.296.513/0001-97
 * Todos os direitos reservados.
 */
import {handleApi} from './api';
import {handleOnboarding} from './onboarding';
import {handleBranding} from './branding';
import {authenticate,Env,json} from './lib';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    try {
      const brandingResponse = await handleBranding(request, env, url);
      if (brandingResponse) return brandingResponse;
      const onboardingResponse = await handleOnboarding(request, env, url);
      if (onboardingResponse) return onboardingResponse;
      const apiResponse = await handleApi(request, env, url);
      if (apiResponse) return apiResponse;

      if (url.pathname === '/login' || url.pathname === '/login/') {
        const actor = await authenticate(request, env);
        if (actor) return Response.redirect(new URL('/app', url.origin).toString(), 302);
        return env.ASSETS.fetch(new Request(new URL('/login.html', url.origin), request));
      }
      if (url.pathname === '/cadastro' || url.pathname === '/cadastro/') {
        return env.ASSETS.fetch(new Request(new URL('/signup.html', url.origin), request));
      }
      if (url.pathname === '/confirmar-email' || url.pathname === '/confirmar-email/') {
        return env.ASSETS.fetch(new Request(new URL('/verify-email.html', url.origin), request));
      }
      if (url.pathname === '/onboarding' || url.pathname === '/onboarding/') {
        const actor = await authenticate(request, env);
        if (!actor) return Response.redirect(new URL('/login', url.origin).toString(), 302);
        return env.ASSETS.fetch(new Request(new URL('/onboarding.html', url.origin), request));
      }
      if (url.pathname === '/app' || url.pathname === '/app/') {
        const actor = await authenticate(request, env);
        if (!actor) return Response.redirect(new URL('/login', url.origin).toString(), 302);
        return env.ASSETS.fetch(new Request(new URL('/app.html', url.origin), request));
      }
      return env.ASSETS.fetch(request);
    } catch (error) {
      console.error('NegocIAJá error', error);
      return url.pathname.startsWith('/api/')
        ? json({ error: 'Erro interno.', requestId: crypto.randomUUID() }, 500)
        : new Response('NegocIAJá temporariamente indisponível.', { status: 500 });
    }
  }
};
