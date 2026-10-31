// Cloudflare Pages Function (roda antes de toda requisição do site web).
// O projeto "avia" no Pages responde em dois endereços: o domínio próprio
// edsavia.com.br e o padrão avia-8qu.pages.dev. Só o primeiro deve ser
// usado, então o endereço antigo redireciona pra ele mantendo caminho e
// query (ex.: /privacidade). Só o host exato: os previews por branch
// (ex.: master.avia-8qu.pages.dev) continuam acessíveis pra testes.
// Fica na raiz do projeto (não em dist/) porque o `wrangler pages deploy`
// procura a pasta functions/ no diretório de onde é chamado.
const HOST_ANTIGO = 'avia-8qu.pages.dev';
const HOST_OFICIAL = 'edsavia.com.br';

export async function onRequest({ request, next }) {
  const url = new URL(request.url);
  if (url.hostname === HOST_ANTIGO) {
    url.hostname = HOST_OFICIAL;
    url.protocol = 'https:';
    url.port = '';
    return Response.redirect(url.toString(), 301);
  }
  return next();
}
