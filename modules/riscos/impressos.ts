import { esc } from '../../lib/util';
import { CSS_CERT, LOGO_CERT } from './certificado-assets';
import { fmt1, fmtNota, type LinhaRanking, notaFaixa } from './model';

/* ---------- Checklist de visita / planejamento do dia ---------- */
export type LinhaChecklist = { unidade: string; titulo: string; desc: string; obs: string };
export function checklistHtml(titulo: string, subtitulo: string, linhas: LinhaChecklist[], mostrarUnidade: boolean) {
  const cols = mostrarUnidade ? 4 : 3;
  const corpo = linhas.map(r => `
    <tr class="item-row"><td class="check-cell"><span class="print-check"></span></td>${mostrarUnidade ? `<td class="filial-cell">${esc(r.unidade)}</td>` : ''}
      <td class="activity-cell">${esc(r.titulo || r.desc)}</td><td class="desc-cell">${esc(r.desc)}</td></tr>
    <tr class="obs-row"><td colspan="${cols}"><div class="obs-label">OBSERVAÇÕES / EVIDÊNCIAS</div><div class="obs-box">${esc(r.obs)}</div></td></tr>`).join('');
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(titulo)}</title><style>
@page{size:A4 portrait;margin:10mm}*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;margin:0;color:#111;font-size:10px}
.print-header{background:#07345a;color:#fff;padding:9mm 8mm 7mm;position:relative;margin-bottom:8mm;border-bottom:2px solid #e7b923}
.brand{font-size:9px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;margin-bottom:4px}h1{font-size:18px;margin:0;text-align:center;text-transform:uppercase}
.sub{font-size:10px;color:#555;margin-bottom:12px}.intro{font-size:9px;line-height:1.4;text-align:center;margin:0 auto 10px;max-width:175mm;color:#333}
table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:9px}th,td{border:1px solid #bbb;padding:5px;text-align:left;vertical-align:top}
th{background:#e7b923;color:#111;font-weight:800;text-transform:uppercase;font-size:8px}.check-cell{width:9mm;text-align:center!important;padding:3px!important}
.filial-cell{width:16%;font-weight:700}.activity-cell{width:35%;font-weight:700}.desc-cell{color:#333}
.print-check{display:inline-block;width:10px;height:10px;border:1px solid #888;background:#fff}.item-row{page-break-after:avoid}.obs-row{page-break-inside:avoid}
.obs-row td{padding:5px 6px 7px}.obs-label{font-size:7px;font-weight:800;letter-spacing:.5px;color:#555;margin-bottom:4px}
.obs-box{min-height:22mm;border:1px solid #aaa;border-radius:2px;padding:5px;font-size:9px;line-height:1.35;white-space:pre-wrap}
.footer{display:flex;justify-content:space-between;gap:12px;margin-top:9px;padding-top:6px;border-top:1px solid #ccc;color:#777;font-size:7px}.footer-brand{font-weight:800;color:#222;font-size:9px}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head><body>
<div class="print-header"><div class="brand">REDE DE POSTOS NEVOEIRO • PREVENÇÃO DE PERDAS</div><h1>Checklist de Auditoria</h1></div>
<div class="sub">${esc(subtitulo)}</div>
<p class="intro">Utilize este checklist durante a visita à filial. Marque cada atividade conforme a execução e utilize o campo de observações para registrar evidências, pendências ou informações relevantes.</p>
<table><thead><tr><th class="check-cell">OK</th>${mostrarUnidade ? '<th class="filial-cell">Filial</th>' : ''}<th class="activity-cell">Atividade</th><th>Descrição</th></tr></thead>
<tbody>${corpo || `<tr><td colspan="${cols}" style="text-align:center;color:#888">Nenhuma demanda cadastrada.</td></tr>`}</tbody></table>
<div class="footer"><span>Documento de acompanhamento de visita • ${esc(subtitulo)}</span><span class="footer-brand">NEVOEIRO | PREVENÇÃO DE PERDAS</span></div>
</body></html>`;
}

/* ---------- Ranking do Programa Filial Destaque ---------- */
export function rankingHtml(dados: LinhaRanking[]) {
  const f = (v: number | null) => (v === null ? '—' : fmt1(v));
  const rows = dados.map(({ u, m, pos }) => `<tr><td>${m.real ? pos : '—'}</td><td>${esc(u.nome)}</td><td>${f(m.total)}</td>
    <td>${m.nota === null ? '—' : `${m.fonte === 'estimado' ? '~' : ''}${fmtNota(m.nota)} · ${notaFaixa(m.nota).label}`}</td>
    <td>${f(m.comps?.audit ?? null)}</td><td>${f(m.comps?.evolution ?? null)}</td><td>${f(m.comps?.loss ?? null)}</td><td>${f(m.comps?.action ?? null)}</td><td>${f(m.comps?.consistency ?? null)}</td>
    <td>${esc(m.destaque && m.selo !== 'Ouro' ? 'Destaque' : m.selo === 'Estimado' ? 'Sem lançamento' : m.selo)}</td></tr>`).join('');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Ranking Filial Destaque</title><style>@page{size:A4 portrait;margin:12mm}body{font-family:Arial;color:#222}h1{color:#07345a;text-align:center}p{font-size:11px;color:#666}table{width:100%;border-collapse:collapse;font-size:9px}th,td{border:1px solid #bbb;padding:5px}th{background:#e7b923}footer{margin-top:12px;border-top:1px solid #ccc;padding-top:5px;font-size:8px;color:#777}</style></head><body>
<h1>🏆 Programa Filial Destaque</h1><p>Ranking de desempenho das filiais — ${new Date().toLocaleDateString('pt-BR')}. Filiais sem lançamento aparecem com valores estimados e não recebem posição, selo ou certificado.</p>
<table><thead><tr><th>#</th><th>Filial</th><th>Total</th><th>Nota</th><th>Auditoria</th><th>Evolução</th><th>Perdas</th><th>Planos</th><th>Consist.</th><th>Nível</th></tr></thead><tbody>${rows}</tbody></table>
<footer>REDE DE POSTOS NEVOEIRO • PREVENÇÃO DE PERDAS</footer></body></html>`;
}

/* ---------- Certificado (A4 paisagem, com selo metálico) ---------- */
function seloSvg(nivel: 'ouro' | 'prata' | 'bronze' | 'destaque') {
  const cfg = {
    ouro: { label: 'OURO', c1: '#f7d76a', c2: '#b8860b', c3: '#fff0a8', stroke: '#8f691c' },
    prata: { label: 'PRATA', c1: '#f1f4f7', c2: '#8e99a8', c3: '#ffffff', stroke: '#667180' },
    bronze: { label: 'BRONZE', c1: '#e0a36b', c2: '#955327', c3: '#f3c08b', stroke: '#6e3e1e' },
    destaque: { label: 'DESTAQUE', c1: '#f7d76a', c2: '#b8860b', c3: '#fff0a8', stroke: '#8f691c' },
  }[nivel];
  const dentes = 36, pts: string[] = [];
  for (let i = 0; i < dentes * 2; i++) {
    const a = (i / (dentes * 2)) * Math.PI * 2 - Math.PI / 2, r = i % 2 === 0 ? 100 : 88;
    pts.push(`${(100 + r * Math.cos(a)).toFixed(2)},${(100 + r * Math.sin(a)).toFixed(2)}`);
  }
  const ticks = Array.from({ length: 72 }, (_, i) => { const a = (i * 5 * Math.PI) / 180; return `<line x1="${(100 + 67 * Math.cos(a)).toFixed(2)}" y1="${(100 + 67 * Math.sin(a)).toFixed(2)}" x2="${(100 + 73 * Math.cos(a)).toFixed(2)}" y2="${(100 + 73 * Math.sin(a)).toFixed(2)}"/>`; }).join('');
  return `<svg class="cert-seal" viewBox="0 0 200 200" role="img" aria-label="Selo ${cfg.label}"><defs>
<radialGradient id="sealFace" cx="35%" cy="28%" r="78%"><stop offset="0%" stop-color="${cfg.c3}"/><stop offset="38%" stop-color="${cfg.c1}"/><stop offset="100%" stop-color="${cfg.c2}"/></radialGradient>
<filter id="sealShadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="4" stdDeviation="3" flood-color="#000" flood-opacity=".24"/></filter></defs>
<polygon points="${pts.join(' ')}" fill="url(#sealFace)" stroke="${cfg.stroke}" stroke-width="2.5" filter="url(#sealShadow)"/>
<circle cx="100" cy="100" r="80" fill="url(#sealFace)" stroke="${cfg.c3}" stroke-width="2.5"/><circle cx="100" cy="100" r="72" fill="none" stroke="${cfg.stroke}" stroke-width="2.4"/>
<circle cx="100" cy="100" r="66" fill="none" stroke="${cfg.c3}" stroke-width="1.5" opacity=".9"/><g opacity=".72" stroke="${cfg.stroke}" stroke-width="1.2">${ticks}</g>
<circle cx="100" cy="100" r="48" fill="rgba(255,255,255,.08)" stroke="${cfg.stroke}" stroke-width="1.8"/>
<text x="100" y="79" text-anchor="middle" font-family="Georgia,Times New Roman,serif" font-size="12" font-weight="700" letter-spacing="2" fill="${cfg.stroke}">FILIAL</text>
<text x="100" y="108" text-anchor="middle" font-family="Georgia,Times New Roman,serif" font-size="25" font-weight="700" letter-spacing="1.5" fill="#fff" stroke="${cfg.stroke}" stroke-width=".7" paint-order="stroke">${cfg.label}</text>
<line x1="61" y1="119" x2="139" y2="119" stroke="${cfg.stroke}" stroke-width="1.3"/>
<text x="100" y="137" text-anchor="middle" font-family="Arial,sans-serif" font-size="7" font-weight="700" letter-spacing="1.3" fill="${cfg.stroke}">PROGRAMA FILIAL DESTAQUE</text>
<text x="25" y="104" text-anchor="middle" font-size="9" fill="${cfg.stroke}">★</text><text x="175" y="104" text-anchor="middle" font-size="9" fill="${cfg.stroke}">★</text></svg>`;
}

export type DadosCertificado = { unidade: string; periodo: string; premio: string; pontuacao: string; mensagem: string };
export function certificadoHtml(d: DadosCertificado) {
  const nivel = /ouro/i.test(d.premio) ? 'ouro' : /prata/i.test(d.premio) ? 'prata' : /bronze/i.test(d.premio) ? 'bronze' : 'destaque';
  const tem = (v: string) => v.trim().length > 0;
  const corpo = [
    '<div class="title">Certificado</div>',
    tem(d.premio) ? `<div class="grp"><div class="award">${esc(d.premio)}</div><div class="line"></div></div>` : '',
    tem(d.unidade) ? `<div class="unit">${esc(d.unidade)}</div>` : '',
    tem(d.mensagem) ? `<div class="message">${esc(d.mensagem)}</div>` : '',
    tem(d.pontuacao) ? `<div class="score">Pontuação: ${esc(d.pontuacao)}</div>` : '',
    tem(d.periodo) ? `<div class="period">Período de referência: ${esc(d.periodo)}</div>` : '',
  ].join('');
  const hoje = new Date();
  const dataLonga = `${hoje.getDate()} de ${['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'][hoje.getMonth()]} de ${hoje.getFullYear()}`;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Certificado - ${esc(d.unidade)}</title><style>${CSS_CERT}</style></head><body>
<div class="page"><div class="cert"><div class="top"><img class="logo" src="${LOGO_CERT}" alt="Rede de Postos Nevoeiro"><div class="ref">Programa Filial Destaque<br>Certificado de Reconhecimento</div></div>
<div class="body">${corpo}</div>${seloSvg(nivel)}
<div class="footer"><div class="sig">Gestão / Diretoria</div><div class="sig">Prevenção de Perdas / Auditoria</div></div>
<div class="cert-date">Rede de Postos Nevoeiro • ${dataLonga}</div></div></div></body></html>`;
}
