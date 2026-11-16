#!/usr/bin/env node
/**
 * Publica uma atualização automática do app (EAS Update) para os celulares com o APK atual.
 * Vale para mudanças de tela, regras, textos, cálculos e sons. Mudanças nativas (módulo nativo novo,
 * permissões, ícone, nome) continuam precisando de APK: `npm run apk`.
 *
 *   npm run atualizar -- "Tela de coleta mais simples"
 *
 * Os celulares baixam ao abrir o app (ou ao voltar para ele) e mostram o aviso "Atualização pronta".
 *
 * IMPORTANTE: com `--environment`, o EAS não lê o arquivo .env (EXPO_NO_DOTENV=1). Sem o endereço e a
 * chave do Supabase, o app abre em "modo local" (sem login). Por isso este script lê as variáveis
 * públicas do app (EXPO_PUBLIC_*) do .env e as entrega ao processo; sem elas, nada é publicado.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const app = require(path.join(root, 'app.json')).expo;
const mensagem = process.argv.slice(2).join(' ').trim() || `Atualização de ${new Date().toLocaleString('pt-BR')}`;

/** Só as variáveis públicas do app (as mesmas que o APK e o web embutem). */
function variaveisPublicas() {
  const out = {};
  for (const arq of ['.env', '.env.local', '.env.production']) {
    const p = path.join(root, arq);
    if (!fs.existsSync(p)) continue;
    for (const linha of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = linha.match(/^\s*(?:export\s+)?(EXPO_PUBLIC_[A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  }
  return out;
}
const publicas = variaveisPublicas();
const obrigatorias = ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY'];
const faltam = obrigatorias.filter(n => !publicas[n] && !process.env[n]);
if (faltam.length) {
  console.error(`\nNada publicado: faltam ${faltam.join(' e ')} no .env. Sem elas o app abriria em "modo local", sem login.`);
  process.exit(1);
}

console.log(`\nPublicando atualização para o APK ${app.runtimeVersion} (canal production): "${mensagem}"\n`);
// No Windows o comando roda pelo shell: a mensagem vai entre aspas para não ser quebrada nos espaços.
const msgArg = process.platform === 'win32' ? `"${mensagem.replace(/"/g, "'")}"` : mensagem;
const r = spawnSync('npx', ['eas', 'update', '--channel', 'production', '--platform', 'android', '--environment', 'production', '--message', msgArg, '--non-interactive'], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, ...publicas },
});
if (r.status !== 0) {
  console.error('\nA atualização não foi publicada. Veja a mensagem acima.');
  process.exit(r.status ?? 1);
}

// Conferência: o pacote publicado precisa conter o endereço do servidor (senão seria "modo local").
const url = publicas.EXPO_PUBLIC_SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const pasta = path.join(root, 'dist', '_expo', 'static', 'js', 'android');
const pacotes = fs.existsSync(pasta) ? fs.readdirSync(pasta).map(f => path.join(pasta, f)) : [];
const ok = pacotes.some(f => fs.readFileSync(f).includes(Buffer.from(url)));
if (!ok) {
  console.error('\nATENÇÃO: o pacote publicado não contém o endereço do servidor. Os celulares podem abrir sem login. Publique de novo com o .env correto.');
  process.exit(2);
}
console.log(`\nAtualização publicada e conferida (com servidor e login). Os celulares com o APK ${app.runtimeVersion} recebem ao abrir o app.`);
