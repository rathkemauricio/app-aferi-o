// Envio de e-mails com Nodemailer, usado pelas Edge Functions do Postora.
//
// SMTP padrão: Gmail com senha de app (smtp.gmail.com, porta 465 com SSL). As Edge Functions do
// Supabase bloqueiam as portas 25 e 587, então use sempre um servidor SMTP que aceite a 465.
// Configuração (supabase secrets): SMTP_USER, SMTP_PASS e, opcionais, SMTP_HOST, SMTP_PORT, MAIL_FROM_NAME.
import nodemailer from 'npm:nodemailer@6.9.16';

const host = Deno.env.get('SMTP_HOST') || 'smtp.gmail.com';
const port = Number(Deno.env.get('SMTP_PORT') || '465');
const user = Deno.env.get('SMTP_USER') || '';
const pass = Deno.env.get('SMTP_PASS') || '';
const fromName = Deno.env.get('MAIL_FROM_NAME') || 'Postora';

let transporter: ReturnType<typeof nodemailer.createTransport> | null = null;

function transporte() {
  if (!user || !pass) throw new Error('SMTP_USER e SMTP_PASS não estão configurados nas secrets do Supabase.');
  transporter ??= nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
  return transporter;
}

export type Anexo = { filename: string; content: string; encoding: 'base64'; contentType: string };

export type Mensagem = {
  para: string | string[];
  assunto: string;
  html: string;
  texto?: string;
  responderPara?: string;
  anexos?: Anexo[];
};

export async function enviar(m: Mensagem) {
  // O Gmail só aceita como remetente a própria conta autenticada (ou um alias dela).
  await transporte().sendMail({
    from: { name: fromName, address: user },
    to: m.para,
    subject: m.assunto,
    html: m.html,
    text: m.texto ?? textoDe(m.html),
    replyTo: m.responderPara,
    attachments: m.anexos,
  });
}

export const EMAIL_RE = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]+$/;

export const esc = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c));

/** Versão em texto puro do e-mail (para leitores que não mostram HTML). */
const textoDe = (html: string) =>
  html
    .replace(/<(head|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_, url: string, rotulo: string) => {
      const r = rotulo.replace(/<[^>]+>/g, '').trim();
      return r && r !== url ? `${r}: ${url}` : url;
    })
    .replace(/<br\s*\/?>|<\/(p|h1|h2|tr|div)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .split('\n').map(l => l.replace(/[ \t]+/g, ' ').trim()).join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

// Cores do tema do app (ui/theme.ts).
const COR = { fundo: '#f5f6f8', cartao: '#ffffff', borda: '#e3e6ec', texto: '#1b2230', suave: '#5b6475', destaque: '#4f46e5' };

/**
 * Layout padrão dos e-mails do Postora. `paragrafos` aceita HTML: escape com `esc()` tudo o que vier do usuário.
 */
export function layout(o: {
  titulo: string;
  paragrafos: string[];
  botao?: { texto: string; url: string };
  codigo?: string;
  rodape?: string;
}) {
  const p = (html: string) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:${COR.texto}">${html}</p>`;
  const botao = o.botao
    ? `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:8px 0 18px"><tr><td style="border-radius:10px;background:${COR.destaque}">
         <a href="${esc(o.botao.url)}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px">${esc(o.botao.texto)}</a>
       </td></tr></table>
       <p style="margin:0 0 14px;font-size:12.5px;line-height:1.5;color:${COR.suave}">Se o botão não funcionar, copie e cole este endereço no navegador:<br><a href="${esc(o.botao.url)}" style="color:${COR.destaque};word-break:break-all">${esc(o.botao.url)}</a></p>`
    : '';
  const codigo = o.codigo
    ? `<p style="margin:4px 0 18px;font-size:28px;font-weight:800;letter-spacing:6px;color:${COR.texto}">${esc(o.codigo)}</p>`
    : '';
  const rodape = o.rodape ?? 'Este é um e-mail automático do Postora. Se você não esperava esta mensagem, pode ignorá-la.';
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(o.titulo)}</title></head>
<body style="margin:0;padding:0;background:${COR.fundo};font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${COR.fundo};padding:28px 12px"><tr><td align="center">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px">
      <tr><td style="padding:0 4px 14px;font-size:18px;font-weight:800;color:${COR.destaque}">Postora</td></tr>
      <tr><td style="background:${COR.cartao};border:1px solid ${COR.borda};border-radius:16px;padding:28px 26px">
        <h1 style="margin:0 0 16px;font-size:21px;line-height:1.3;color:${COR.texto}">${esc(o.titulo)}</h1>
        ${o.paragrafos.map(p).join('\n        ')}
        ${codigo}${botao}
      </td></tr>
      <tr><td style="padding:14px 6px 0;font-size:12px;line-height:1.5;color:${COR.suave}">${esc(rodape)}</td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}
