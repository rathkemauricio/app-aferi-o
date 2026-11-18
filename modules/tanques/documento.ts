import { esc } from '../../lib/util';
import { alturaMaxima, type TabelaArqueacao, tabelaDoTanque, volumeTotal } from './arqueacao';
import { ordenarTanques, type TanqueFilial } from './cadastro';
import type { BombaEquip } from './ligacoes';

// PDF da filial gerado pelo sistema: cadastro dos tanques (combustível, capacidade, modelo, tabela e ligações de
// bombas/bicos) e as tabelas de medição. O layout é o que a importação reconhece ("Tabela: …" dá o nome de cada tabela),
// então o arquivo exportado pode ser importado de volta em outra filial ou depois de corrigido.

const AZUL = '#0f1f3d', VERMELHO = '#9b1c1c';
const fmt = (v: number | null | undefined) => (v === null || v === undefined ? '—' : v.toLocaleString('pt-BR'));
const listaE = (l: string[]) => (l.length > 1 ? `${l.slice(0, -1).join(', ')} E ${l[l.length - 1]}` : l.join(''));

/** "Bomba 06 (Wayne 3B2201P): Bico 01 • Bomba 01: Bicos 03, 05" — bicos que puxam do tanque. */
export function ligacoesDoTanque(bombas: BombaEquip[], tanque: string) {
  return bombas.map(b => ({ b, bicos: b.nozzles.filter(n => (n.tanque ?? '').trim().toLowerCase() === tanque.trim().toLowerCase()).map(n => n.number) }))
    .filter(x => x.bicos.length)
    .map(x => `${x.b.number}${x.b.modelo ? ` (${x.b.modelo})` : ''}: Bico${x.bicos.length > 1 ? 's' : ''} ${x.bicos.join(', ')}`).join(' • ');
}

export function htmlDocumentoFilial({ filialCodigo, filialNome, cadastro, tabelas, bombas, nomeComb }: {
  filialCodigo: string; filialNome: string; cadastro: TanqueFilial[]; tabelas: TabelaArqueacao[]; bombas: BombaEquip[]; nomeComb: (id: string) => string;
}) {
  const cod = String(filialCodigo).padStart(2, '0');
  const tanques = ordenarTanques(cadastro);
  const linhasCadastro = tanques.map(x => {
    const tab = tabelaDoTanque(tabelas, x.numero);
    return `<tr><td class="b">Tanque ${esc(x.numero)}</td><td>${esc(x.combustivel ? nomeComb(x.combustivel) : '—')}</td><td class="n">${x.capacidade ? `${fmt(x.capacidade)} L` : '—'}</td>`
      + `<td>${esc(x.modelo || '')}</td><td>${esc(tab?.nome ?? 'Sem tabela')}</td><td>${esc(ligacoesDoTanque(bombas, x.numero) || '—')}</td></tr>`;
  }).join('');
  const usadas = tabelas.filter(t => t.tanques.length && t.pontos.length);
  const blocos = usadas.map(t => {
    const nums = [...t.tanques].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
    const tipo = cadastro.find(x => nums.includes(x.numero) && x.tipo && x.tipo !== 'simples')?.tipo;
    const particao = /\(([\d/\s]+)\)\s*$/.exec(t.nome)?.[1] ?? '';
    const COLS = 5, porColuna = Math.ceil(t.pontos.length / COLS);
    const colunas = Array.from({ length: COLS }, (_, k) => t.pontos.slice(k * porColuna, (k + 1) * porColuna));
    const linhas = Array.from({ length: porColuna }, (_, i) => colunas.map(c => (c[i] ? `<td class="c">${fmt(c[i][0])}</td><td class="n">${fmt(c[i][1])}</td>` : '<td class="c">—</td><td class="n">—</td>')).join(''))
      .map(l => `<tr>${l}</tr>`).join('');
    return `<section>
<h2>FILIAL ${cod} — TABELA DE MEDIÇÃO (TANQUE${nums.length > 1 ? 'S' : ''} ${esc(listaE(nums))})</h2>
<div class="meta">Tabela: ${esc(t.nome)}</div>
${tipo ? `<div class="meta">${tipo.toUpperCase()}${particao ? ` (${esc(particao)})` : ''}</div>` : ''}
<div class="meta">Dimensões: ${t.comprimento_m ? `C = ${fmt(t.comprimento_m)} m • ` : ''}Vol. Máx. (${fmt(alturaMaxima(t))} cm): ${fmt(volumeTotal(t))} L${t.capacidade ? ` • Capacidade nominal ${fmt(t.capacidade)} L` : ''}</div>
<table class="dados"><thead><tr>${'<th>cm</th><th>Litros</th>'.repeat(COLS)}</tr></thead><tbody>${linhas}</tbody></table>
</section>`;
  }).join('');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Tanques e tabelas · Filial ${esc(cod)}</title><style>
@page{size:A4;margin:10mm}body{font:10px Arial,sans-serif;color:#1b2230;margin:0;font-kerning:none;font-feature-settings:"kern" 0}
h1{font-size:16px;margin:0 0 2px;color:${VERMELHO}}h2{font-size:13px;margin:14px 0 3px;color:${VERMELHO};break-after:avoid}.sub{color:#5b6475;margin-bottom:8px}
.meta{margin:1px 0;color:#1b2230}table{width:100%;border-collapse:collapse;margin-top:4px}th{background:${AZUL};color:#fff;padding:3px 4px;font-size:9px;text-align:left}
td{border-bottom:1px solid #e3e6ec;padding:2px 4px;vertical-align:top}.b{font-weight:700;white-space:nowrap}.c{text-align:center;font-weight:700;color:${VERMELHO}}.n{text-align:right;font-variant-numeric:tabular-nums}
table.dados th{text-align:center}.nota{color:#5b6475;font-size:9px;margin-top:8px}</style></head><body>
<h1>FILIAL ${cod} — CADASTRO DE TANQUES E TABELAS</h1>
<div class="sub">${esc(filialNome)} · ${tanques.length} tanque(s) · ${usadas.length} tabela(s) de medição</div>
<table><thead><tr><th>Tanque</th><th>Combustível</th><th>Capacidade</th><th>Modelo</th><th>Tabela</th><th>Esquema das Ligações (Bombas / Bicos)</th></tr></thead><tbody>${linhasCadastro || '<tr><td colspan="6">Nenhum tanque cadastrado.</td></tr>'}</tbody></table>
${blocos}
<p class="nota">Gerado pelo EasyAudit. Este PDF pode ser importado de volta (Medição de Tanques → filial → Importar PDF da filial).</p>
</body></html>`;
}
