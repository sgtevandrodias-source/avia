// app.json continua sendo a config estática (nome, ícones, plugins, etc.) —
// esse arquivo só existe pra resolver o google-services.json em tempo de
// build. O arquivo é gitignored (é config do projeto Firebase do usuário,
// não deve ir pro repositório), então o servidor de build da EAS nunca teria
// acesso a ele por git — em vez disso, foi subido como variável de ambiente
// de arquivo (GOOGLE_SERVICES_JSON, visibility "secret", ver
// `eas env:create`), que a EAS resolve pra um caminho de arquivo válido só
// durante o build. Localmente (expo start/expo export), a env var não existe
// e cai no caminho local de sempre.
module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? config.android.googleServicesFile,
  },
});
