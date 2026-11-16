#!/usr/bin/env node
/**
 * Publica uma atualização automática do app (EAS Update) para os celulares com o APK atual.
 * Vale para mudanças de tela, regras, textos, cálculos e sons. Mudanças nativas (módulo nativo novo,
 * permissões, ícone, nome) continuam precisando de APK: `npm run apk`.
 *
 *   npm run atualizar -- "Tela de coleta mais simples"
 *
 * Os celulares baixam ao abrir o app (ou ao voltar para ele) e mostram o aviso "Atualização pronta".
 */
const { spawnSync } = require('child_process');
const path = require('path');

const root = path.resolve(__dirname, '..');
const app = require(path.join(root, 'app.json')).expo;
const mensagem = process.argv.slice(2).join(' ').trim() || `Atualização de ${new Date().toLocaleString('pt-BR')}`;

console.log(`\nPublicando atualização para o APK ${app.runtimeVersion} (canal production): "${mensagem}"\n`);
const r = spawnSync('npx', ['eas', 'update', '--channel', 'production', '--platform', 'android', '--environment', 'production', '--message', mensagem, '--non-interactive'], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
if (r.status !== 0) {
  console.error('\nA atualização não foi publicada. Veja a mensagem acima.');
  process.exit(r.status ?? 1);
}
console.log(`\nAtualização publicada. Os celulares com o APK ${app.runtimeVersion} recebem ao abrir o app.`);
