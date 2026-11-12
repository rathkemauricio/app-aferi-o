#!/usr/bin/env node
/**
 * Sobe a versão do app (patch: 1.0.1 -> 1.0.2, versionCode +1) e gera o APK de release.
 *
 *   npm run apk            -> sobe patch (1.0.1 -> 1.0.2)
 *   npm run apk -- minor   -> sobe minor (1.0.1 -> 1.1.0)
 *   npm run apk -- major   -> sobe major (1.0.1 -> 2.0.0)
 *   npm run apk -- 1.4.0   -> usa a versão informada
 *   npm run apk -- --no-bump -> só gera o APK, sem mudar a versão
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const file = (p) => path.join(root, p);
const read = (p) => fs.readFileSync(file(p), 'utf8');
const write = (p, s) => fs.writeFileSync(file(p), s);

const arg = process.argv[2] ?? 'patch';
const gradlePath = 'android/app/build.gradle';
let gradle = read(gradlePath);

const appJson = read('app.json');
const current = JSON.parse(appJson).expo.version;
const currentCode = Number(/versionCode\s+(\d+)/.exec(gradle)[1]);

let version = current;
let code = currentCode;

if (arg !== '--no-bump') {
  const [maj, min, pat] = current.split('.').map(Number);
  if (/^\d+\.\d+\.\d+$/.test(arg)) version = arg;
  else if (arg === 'major') version = `${maj + 1}.0.0`;
  else if (arg === 'minor') version = `${maj}.${min + 1}.0`;
  else if (arg === 'patch') version = `${maj}.${min}.${pat + 1}`;
  else {
    console.error(`Argumento inválido: ${arg}`);
    process.exit(1);
  }
  code = currentCode + 1;

  // app.json: expo.version e expo.android.versionCode
  write(
    'app.json',
    appJson
      .replace(/("version":\s*")[^"]+(")/, `$1${version}$2`)
      .replace(/("versionCode":\s*)\d+/, `$1${code}`),
  );

  // package.json e as duas primeiras ocorrências do package-lock.json (raiz do projeto)
  write('package.json', read('package.json').replace(/("version":\s*")[^"]+(")/, `$1${version}$2`));
  let n = 0;
  write(
    'package-lock.json',
    read('package-lock.json').replace(/("version":\s*")[^"]+(")/g, (m, a, b) => (n++ < 2 ? `${a}${version}${b}` : m)),
  );

  // build.gradle
  gradle = gradle
    .replace(/versionCode\s+\d+/, `versionCode ${code}`)
    .replace(/versionName\s+"[^"]+"/, `versionName "${version}"`);
  write(gradlePath, gradle);

  console.log(`\nVersão: ${current} (${currentCode}) -> ${version} (${code})\n`);
}

const env = { ...process.env, NODE_ENV: 'production' };
if (!env.ANDROID_HOME && process.env.LOCALAPPDATA) {
  env.ANDROID_HOME = path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk');
}

const isWin = process.platform === 'win32';
const gradlew = file(isWin ? 'android/gradlew.bat' : 'android/gradlew');
const result = spawnSync(isWin ? `"${gradlew}"` : gradlew, ['assembleRelease', '--console=plain'], {
  cwd: file('android'),
  env,
  stdio: 'inherit',
  shell: isWin,
});

if (result.status !== 0) {
  console.error('\nBuild falhou. A versão já foi alterada nos arquivos; rode "npm run apk -- --no-bump" para tentar de novo.');
  process.exit(result.status ?? 1);
}

const apk = file('android/app/build/outputs/apk/release/app-release.apk');
console.log(`\nAPK pronto — versão ${version} (versionCode ${code})`);
console.log(apk);
