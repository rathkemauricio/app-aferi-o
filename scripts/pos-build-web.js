// Depois do `expo export` do painel web: coloca no dist/index.html a tela de carregamento (círculo + contador de
// segundos) que aparece antes do app abrir e que o app remove ao iniciar (ui/carregando.tsx → removerCarregamentoInicial).
// No celular, com conexão lenta, a página ficaria em branco enquanto baixa o código; o contador só anda se a página
// estiver viva (contador parado = travou). Também define o idioma da página como pt-BR.
const fs = require('node:fs');
const path = require('node:path');

const arquivo = path.join(__dirname, '..', 'dist', 'index.html');
let html = fs.readFileSync(arquivo, 'utf8');
if (html.includes('carregando-inicial')) { console.log('pos-build-web: tela de carregamento já está no HTML.'); process.exit(0); }

const css = `
#carregando-inicial{position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:24px;text-align:center;background:#0f1f3d;color:#eef2f8;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
#carregando-inicial .ci-anel{width:46px;height:46px;border-radius:50%;border:4px solid rgba(238,242,248,.18);border-top-color:#5fd39a;animation:ci-gira .9s linear infinite}
#carregando-inicial .ci-marca{font-size:22px;font-weight:800;letter-spacing:-.3px}
#carregando-inicial .ci-texto{font-size:15px;opacity:.9;max-width:320px;line-height:1.4}
#carregando-inicial .ci-tempo{font-variant-numeric:tabular-nums;font-size:13px;opacity:.7;display:flex;align-items:center;gap:8px}
#carregando-inicial .ci-ponto{width:8px;height:8px;border-radius:50%;background:#5fd39a;animation:ci-pisca 1s ease-in-out infinite}
#carregando-inicial button{margin-top:6px;min-height:44px;padding:0 22px;border:0;border-radius:999px;background:#5fd39a;color:#0f1f3d;font-size:15px;font-weight:800;cursor:pointer;display:none;align-items:center;justify-content:center}
@keyframes ci-gira{to{transform:rotate(360deg)}}
@keyframes ci-pisca{0%,100%{opacity:.25}50%{opacity:1}}
@media (prefers-reduced-motion:reduce){#carregando-inicial .ci-anel{animation-duration:2.4s}}
`;

// Contador por JavaScript de propósito: se a página travar, ele para (um giro em CSS continuaria girando).
const script = `
(function(){
  var el=document.getElementById('carregando-inicial'); if(!el) return;
  var t=el.querySelector('.ci-seg'), msg=el.querySelector('.ci-texto'), bt=el.querySelector('button');
  var t0=Date.now();
  function tick(){
    var s=Math.floor((Date.now()-t0)/1000);
    if(t) t.textContent=s+' s';
    if(msg){
      msg.textContent = s<8 ? 'Carregando o EasyAudit…'
        : s<20 ? 'Ainda carregando… a conexão pode estar lenta.'
        : 'Está demorando mais que o normal. Verifique a conexão. Se o contador parou, a página travou.';
    }
    if(bt) bt.style.display = s>=20 ? 'inline-flex' : 'none';
  }
  tick(); window.__ciTimer=setInterval(tick,500);
  if(bt) bt.addEventListener('click',function(){location.reload();});
})();
`;

const bloco = `<div id="carregando-inicial" role="status" aria-live="polite"><div class="ci-marca">EasyAudit</div><div class="ci-anel"></div><div class="ci-texto">Carregando o EasyAudit…</div><div class="ci-tempo"><span class="ci-ponto"></span><span class="ci-seg">0 s</span></div><button type="button">Recarregar</button></div><script>${script}</script>`;

html = html.replace('<html lang="en">', '<html lang="pt-BR">');
html = html.replace('</head>', `<style id="carregando-inicial-css">${css}</style></head>`);
html = html.replace('<div id="root"></div>', `<div id="root"></div>\n    ${bloco}`);
if (!html.includes('carregando-inicial')) { console.error('pos-build-web: não achei onde colocar a tela de carregamento.'); process.exit(1); }
fs.writeFileSync(arquivo, html);
console.log('pos-build-web: tela de carregamento incluída no HTML.');
