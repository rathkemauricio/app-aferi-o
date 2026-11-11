import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useMemo, useState } from 'react';
import { useFiliais } from '../../lib/data';
import { supabase } from '../../lib/supabase';
import { Collection, combinedStatus, useCollection } from '../../lib/sync';
import type { Auditoria } from './model';

/* ---------- Auditorias (sincronizadas, funcionam sem internet) ---------- */
export const auditoriasCol = new Collection<Auditoria>({ table: 'aud_auditorias', storageKey: 'nevoeiro.auditoria.auditorias.v1' });

export function useAuditorias() {
  const f = useFiliais();
  const a = useCollection(auditoriasCol);
  const lista = useMemo(() => [...a.list].sort((x, y) => y.data.localeCompare(x.data) || (y.updated_at ?? '').localeCompare(x.updated_at ?? '')), [a.list]);
  return { filiais: f.filiais, auditorias: lista, loaded: a.loaded && f.loaded, status: combinedStatus([a.status, f.status]) };
}

/* ---------- Fotos (Storage, bucket privado) ----------
   As fotos não vão para o armazenamento local (limite de poucos MB): são reduzidas e enviadas na hora.
   Na auditoria fica só o caminho do arquivo; para mostrar, o app pede links temporários (assinados). */
export const BUCKET_FOTOS = 'auditoria-fotos';
const LADO_MAX = 1280;

function base64ParaBytes(b64: string) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Abre a câmera ou a galeria. Devolve as imagens já reduzidas (JPEG) ou [] se o usuário cancelar. */
export async function escolherFotos(origem: 'camera' | 'galeria'): Promise<string[]> {
  if (origem === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new Error('Permita o uso da câmera nas configurações do aparelho.');
  }
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1, allowsMultipleSelection: origem === 'galeria', selectionLimit: 6 };
  const r = origem === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  if (r.canceled) return [];
  const saida: string[] = [];
  for (const a of r.assets) {
    const maior = Math.max(a.width ?? 0, a.height ?? 0);
    const acoes: ImageManipulator.Action[] = maior > LADO_MAX ? [{ resize: (a.width ?? 0) >= (a.height ?? 0) ? { width: LADO_MAX } : { height: LADO_MAX } }] : [];
    const out = await ImageManipulator.manipulateAsync(a.uri, acoes, { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true });
    if (out.base64) saida.push(out.base64);
  }
  return saida;
}

/** Envia a foto (base64 JPEG) para a pasta da auditoria e devolve o caminho salvo. Precisa de internet. */
export async function enviarFoto(auditoriaId: string, itemId: number, base64: string): Promise<string> {
  if (!supabase) throw new Error('Fotos precisam do servidor: o app está em modo local.');
  const caminho = `${auditoriaId}/${itemId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}.jpg`;
  const { error } = await supabase.storage.from(BUCKET_FOTOS).upload(caminho, base64ParaBytes(base64), { contentType: 'image/jpeg', upsert: false });
  if (error) throw new Error(error.message.includes('fetch') ? 'Sem conexão com o servidor. Tente de novo com internet.' : error.message);
  return caminho;
}

export async function apagarFoto(caminho: string) {
  if (!supabase) return;
  await supabase.storage.from(BUCKET_FOTOS).remove([caminho]);
}

/** Links temporários (1 hora) para mostrar as fotos. Cache por caminho; busca só os que faltam. */
const cacheLinks = new Map<string, { url: string; ate: number }>();
export async function linksDasFotos(caminhos: string[]): Promise<Record<string, string>> {
  const agora = Date.now();
  const faltam = caminhos.filter(c => !(cacheLinks.get(c)?.ate ?? 0) || cacheLinks.get(c)!.ate < agora + 5 * 60_000);
  if (faltam.length && supabase) {
    const { data } = await supabase.storage.from(BUCKET_FOTOS).createSignedUrls(faltam, 3600);
    (data ?? []).forEach(d => { if (d.path && d.signedUrl) cacheLinks.set(d.path, { url: d.signedUrl, ate: agora + 3600_000 }); });
  }
  const out: Record<string, string> = {};
  caminhos.forEach(c => { const l = cacheLinks.get(c); if (l) out[c] = l.url; });
  return out;
}

/** Hook: links das fotos de uma auditoria (atualiza quando a lista de fotos muda). */
export function useLinksFotos(caminhos: string[]) {
  const chave = caminhos.join('|');
  const [links, setLinks] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!caminhos.length) { setLinks({}); return; }
    let vivo = true;
    void linksDasFotos(caminhos).then(l => { if (vivo) setLinks(l); }).catch(() => undefined);
    return () => { vivo = false; };
  }, [chave]); // eslint-disable-line react-hooks/exhaustive-deps
  return links;
}
