/*
 * NegocIAJá! — desenvolvido pela SER Comunicação
 * CNPJ 23.296.513/0001-97
 * Todos os direitos reservados.
 */
import type {Env} from './lib';

class SrcHandler {
  constructor(private readonly src:string){}
  element(element:Element){
    element.setAttribute('src',this.src);
    element.removeAttribute('hidden');
  }
}

class HeroLogoHandler {
  element(element:Element){
    element.setAttribute('src','/logo-primary-with-slogan.png');
    element.removeAttribute('hidden');
    element.setAttribute('style','display:block;width:min(680px,100%);height:auto;max-width:100%;max-height:none;object-fit:contain;margin:10px auto 22px;');
  }
}

class HideHandler {
  element(element:Element){element.setAttribute('hidden','');}
}

class RemoveHandler {
  element(element:Element){element.remove();}
}

export async function renderPublicHome(request:Request,env:Env,url:URL):Promise<Response>{
  const asset=await env.ASSETS.fetch(new Request(new URL('/landing-v2.html',url.origin),request));
  if(!asset.ok)return asset;
  return new HTMLRewriter()
    .on('#logoHeader',new SrcHandler('/logo-primary.png'))
    .on('.hero h1',new RemoveHandler())
    .on('#logoHero',new HeroLogoHandler())
    .on('#logoPhone',new SrcHandler('/logo-monochrome-navy.png'))
    .on('#logoCta',new SrcHandler('/logo-reverse-dark-bg.png'))
    .on('#logoFooter',new SrcHandler('/logo-primary.png'))
    .on('#fallbackHeader',new HideHandler())
    .on('#fallbackHero',new HideHandler())
    .on('#fallbackCta',new HideHandler())
    .on('#fallbackFooter',new HideHandler())
    .transform(asset);
}
