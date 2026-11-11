// Relatório de aferição em HTML (A4 paisagem), usado para imprimir e gerar o PDF.

type Resultado = { pump: string; nozzle: string; fuel: string; done: boolean; checks: string[]; notes: string[] };
export type AuditRelatorio = {
  branchName: string; branchCode: string; branchCity: string; branchState: string; date: string; auditor: string;
  seal: string; inmetro: string; panels: string; rodilhas: string; generalNotes: string; observations: string; results: Resultado[];
};

export const CRITERIOS = ['Lenta', 'Rápida', 'Erro', 'Luz', 'Mangueira', 'BICO', 'Lacres', 'Sump', 'Vazão', 'Des. 60s'];
const ESCALA = [0, 1, 2];        // Lenta, Rápida, Erro (mL, com sinal)
const CODIGOS = [3, 4, 5, 6, 7]; // Luz, Mangueira, BICO, Lacres, Sump (C / OB / NC / NA)

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c));
const vazio = (v: unknown) => (v === undefined || v === null || String(v).trim() === '' ? '—' : esc(v));
const dataBR = (v: string) => { const p = v.split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : v; };
const mL = (v: string) => { if (!v?.trim()) return '—'; const n = Number(v.replace(',', '.')); return Number.isNaN(n) ? esc(v) : n > 0 ? `+${n}` : String(n); };

function situacao(a: AuditRelatorio) {
  const codigos = a.results.filter(r => r.done).flatMap(r => CODIGOS.map(i => r.checks[i]));
  if (codigos.includes('NC')) return { texto: 'Não conforme', cls: 'st-nc' };
  if (codigos.includes('OB')) return { texto: 'Com observações', cls: 'st-ob' };
  return { texto: 'Conforme', cls: 'st-c' };
}

export function auditReportHtml(a: AuditRelatorio, marca = 'Postora') {
  const st = situacao(a);
  const feitos = a.results.filter(r => r.done);
  const cont = { C: 0, OB: 0, NC: 0, NA: 0 } as Record<string, number>;
  feitos.forEach(r => CODIGOS.forEach(i => { const c = r.checks[i]; if (c && c in cont) cont[c]++; }));

  const celulaCodigo = (r: Resultado, i: number) => {
    const c = r.checks[i] || '';
    const cls = c === 'C' ? 'c' : c === 'OB' ? 'ob' : c === 'NC' ? 'nc' : c === 'NA' ? 'na' : '';
    const nota = (c === 'OB' || c === 'NC') && r.notes[i] ? `<i>${esc(r.notes[i])}</i>` : '';
    return `<td class="cod ${cls}"><b>${c ? esc(c) : '—'}</b>${nota}</td>`;
  };

  const linhas = a.results.map(r => {
    const id = `<td class="bb">${esc(r.pump)} / Bico ${esc(r.nozzle)}</td><td>${esc(r.fuel)}</td>`;
    if (!r.done) return `<tr>${id}<td colspan="10" class="nao">NÃO REALIZADO</td></tr>`;
    return `<tr>${id}${ESCALA.map(i => `<td class="num">${mL(r.checks[i])}</td>`).join('')}${CODIGOS.map(i => celulaCodigo(r, i)).join('')}<td class="num">${vazio(r.checks[8])}</td><td class="num">${vazio(r.checks[9])}</td></tr>`;
  }).join('');

  const ocorrencias = feitos.flatMap(r => CODIGOS.filter(i => r.checks[i] === 'OB' || r.checks[i] === 'NC').map(i => ({ r, i })));
  const tabelaOcorrencias = ocorrencias.length
    ? `<table class="oc"><thead><tr><th style="width:19%">Bomba / Bico</th><th style="width:13%">Combustível</th><th style="width:12%">Item</th><th style="width:9%" class="ce">Situação</th><th>Descrição / local do erro</th></tr></thead><tbody>${
        ocorrencias.map(({ r, i }) => `<tr><td>${esc(r.pump)} / Bico ${esc(r.nozzle)}</td><td>${esc(r.fuel)}</td><td>${esc(CRITERIOS[i])}</td><td class="cod ${r.checks[i] === 'NC' ? 'nc' : 'ob'}"><b>${esc(r.checks[i])}</b></td><td>${vazio(r.notes[i])}</td></tr>`).join('')
      }</tbody></table>`
    : '<p class="vazio">Nenhuma não conformidade ou observação registrada.</p>';

  const obs = [a.observations, a.generalNotes && a.generalNotes !== a.observations ? `Observação geral: ${a.generalNotes}` : ''].filter(Boolean);
  const meta = [
    ['Filial', `${a.branchName} #${a.branchCode}`], ['Cidade / UF', [a.branchCity, a.branchState].filter(Boolean).join(' / ')],
    ['Data da aferição', dataBR(a.date)], ['Aferidor', a.auditor],
    ['Lacre geral', a.seal], ['Selo Inmetro', a.inmetro], ['Painéis das bombas', a.panels], ['Rodilhas', a.rodilhas],
  ];
  const agora = new Date().toLocaleString('pt-BR');

  // Tudo em uma folha: estima a altura (px a 96 dpi) e reduz proporcionalmente se passar da área útil do A4 paisagem.
  const comNota = (r: Resultado) => r.done && CODIGOS.some(i => (r.checks[i] === 'OB' || r.checks[i] === 'NC') && !!r.notes[i]);
  const alturaTabela = 24 + a.results.reduce((h, r) => h + (comNota(r) ? 30 : 21), 0);
  const alturaRodape = 24 + Math.max(22 + Math.max(1, ocorrencias.length) * 20, 44 + 18 * Math.max(1, obs.length) + 64);
  const estimada = 46 + 92 + 30 + 24 + alturaTabela + alturaRodape + 22;
  const UTIL = 700; // 210 mm de altura menos as margens, com folga
  const zoom = Math.min(1, UTIL / estimada);

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Aferição ${esc(a.branchCode)} ${esc(a.date)}</title><style>
@page{size:A4 landscape;margin:8mm 9mm}
*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;font:10px/1.35 -apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#0f1f33}
header{display:flex;align-items:flex-start;justify-content:space-between;padding-bottom:7px;border-bottom:3px solid #12263f;margin-bottom:9px}
h1{font-size:17px;margin:0;font-weight:800;color:#12263f}
.sub{color:#5b6b80;font-size:9px;margin-top:3px}
.st{padding:5px 13px;border-radius:999px;font-weight:700;font-size:10.5px;color:#fff;white-space:nowrap}
.st-c{background:#16834a}.st-ob{background:#9a5b00}.st-nc{background:#b42318}
.meta{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:8px}
.meta div{border:1px solid #d7dee8;border-radius:6px;padding:5px 8px}
.meta small{display:block;font-size:7.5px;letter-spacing:.06em;text-transform:uppercase;color:#5b6b80;font-weight:700}
.meta b{display:block;font-size:11px;margin-top:2px}
.chips{display:flex;gap:6px;margin-bottom:9px}
.chips span{padding:3px 9px;border-radius:6px;font-weight:700;font-size:9px;background:#eef1f5;color:#12263f}
.chips .k-c{background:#dcf5e5;color:#16834a}.chips .k-ob{background:#fdf0c2;color:#7a4a00}.chips .k-nc{background:#fde2e1;color:#b42318}.chips .k-na{background:#e7ebf1;color:#4a5568}
h2{font-size:10.5px;letter-spacing:.04em;text-transform:uppercase;margin:10px 0 5px;color:#12263f}
table{width:100%;border-collapse:collapse;font-size:9px}
thead{display:table-header-group}
tr{page-break-inside:avoid;break-inside:avoid}
th{background:#12263f;color:#fff;font-weight:700;padding:5px 5px;text-align:center;font-size:8.5px}
th:first-child,th:nth-child(2){text-align:left}
td{border:1px solid #d7dee8;padding:4px 5px;text-align:center;vertical-align:middle}
td.bb{font-weight:700;text-align:left;white-space:nowrap}
td:nth-child(2){text-align:left}
td.num{font-variant-numeric:tabular-nums}
td.cod b{display:block;font-size:9px}
td.cod i{display:block;font-size:8px;font-weight:400;color:#3d4a5c;margin-top:1px}
td.c{background:#dcf5e5;color:#16834a}td.ob{background:#fdf0c2;color:#7a4a00}td.nc{background:#fde2e1;color:#b42318}td.na{background:#eef1f5;color:#4a5568}
td.nao{color:#9a5b00;font-weight:700;letter-spacing:.04em}
table.oc th,table.oc td{text-align:left}table.oc td.cod{text-align:center}.ce{text-align:center!important}
.vazio{color:#5b6b80;margin:2px 0 0}
.obs{border:1px solid #d7dee8;border-radius:6px;padding:7px 9px;min-height:30px;white-space:pre-wrap}
.ass{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:30px;page-break-inside:avoid}
.ass div{border-top:1px solid #12263f;padding-top:4px;text-align:center;font-size:9.5px}
footer{margin-top:8px;text-align:right;color:#5b6b80;font-size:8px}
.duas{display:grid;grid-template-columns:1.15fr 1fr;gap:14px;align-items:start;page-break-inside:avoid;break-inside:avoid}
.folha{zoom:${zoom.toFixed(3)}}
</style></head><body><div class="folha">
<header><div><h1>Relatório de Aferição — Bombas de Combustível</h1><div class="sub">${esc(marca)} • Controle de Aferições</div></div><span class="st ${st.cls}">${st.texto}</span></header>
<section class="meta">${meta.map(([k, v]) => `<div><small>${esc(k)}</small><b>${vazio(v)}</b></div>`).join('')}</section>
<div class="chips"><span class="k-c">C: ${cont.C}</span><span class="k-ob">OB: ${cont.OB}</span><span class="k-nc">NC: ${cont.NC}</span><span class="k-na">NA: ${cont.NA}</span><span>${feitos.length} de ${a.results.length} bico(s) aferido(s)</span></div>
<h2>Inspeção por bico</h2>
<table><thead><tr><th style="width:12%">Bomba / Bico</th><th style="width:11%">Combustível</th><th>Lenta mL</th><th>Rápida mL</th><th>Erro mL</th><th style="width:10%">Luz</th><th style="width:10%">Mangueira</th><th>BICO</th><th>Lacres</th><th>Sump</th><th>Vazão</th><th>Des. 60s</th></tr></thead><tbody>${linhas}</tbody></table>
<section class="duas">
<div><h2>Não conformidades e observações (OB / NC)</h2>${tabelaOcorrencias}</div>
<div><h2>Observações / irregularidades encontradas</h2><div class="obs">${obs.length ? obs.map(esc).join('\n') : '—'}</div>
<section class="ass"><div>Aferidor — ${vazio(a.auditor)}</div><div>Responsável pela filial</div></section></div>
</section>
<footer>Gerado em ${esc(agora)} • Códigos NC: NC00 erro fora do limite • NC01 lacre violado • NC02 selo vencido • NC03 vazamento</footer>
</div></body></html>`;
}
