import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, FlatList, Platform, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeftIcon, CalendarBlankIcon, CheckCircleIcon, CheckIcon, ClipboardTextIcon, ClockCounterClockwiseIcon, CloudCheckIcon, CloudSlashIcon, DeviceMobileIcon, DownloadSimpleIcon, DropIcon, FileCsvIcon, FilePdfIcon, GasPumpIcon, HouseIcon, type Icon, ListChecksIcon, MagnifyingGlassIcon, MinusIcon, PencilSimpleIcon, PlayIcon, PlusIcon, ResetIcon, StopIcon, StorefrontIcon, TimerIcon, TrashIcon, UploadSimpleIcon, WarningCircleIcon, XCircleIcon, XIcon } from '../../ui/icons';
import { Button, Card, ChoiceChips, confirmAction, EmptyState, Field, IconButton, IconTile, ListRow, notify, SectionHeader, Sheet, Skeleton, Stat, StatusPill, Steps, type Tone } from '../../ui/kit';
import { createTypography, radius, space, ThemeContext, type ThemeColors, tint } from '../../ui/theme';
import { useRouter } from 'expo-router';
import { useAuth } from '../../lib/auth';
import { combustiveisAtivos, useCombustiveis } from '../../lib/combustiveis';
import { auditReportHtml } from './relatorio';
import { useFilialDoc } from '../../lib/data';
import { CroquiCanvas } from '../croqui/Canvas';
import { type CroquiDoc, numeroBomba, PALETA_CLARA, PALETA_ESCURA, T as TIPOS_CROQUI } from '../croqui/model';
import { docId, docsCol, filiaisCol, ordenarFiliais, saveFilialDoc } from '../../lib/data';
import { isSupabaseConfigured } from '../../lib/supabase';
import { Collection, combinedStatus, isSyncEnabled, type SyncRow, useCollection } from '../../lib/sync';

type Nozzle = { id: string; number: string; fuel: string };
type Pump = { id: string; number: string; nozzles: Nozzle[] };
type Branch = { id: string; code: string; name: string; city: string; state: string; pumps: Pump[] };
type NozzleResult = { pumpId: string; nozzleId: string; pump: string; nozzle: string; fuel: string; done: boolean; checks: string[]; notes: string[] };
type Audit = { id: string; branchId: string; branchName: string; branchCode: string; branchCity: string; branchState: string; date: string; auditor: string; seal: string; inmetro: string; panels: string; rodilhas: string; condBombas?: string; condBombasObs?: string; condIlhas?: string; condIlhasObs?: string; generalNotes: string; observations: string; results: NozzleResult[] };
type DashboardData = { branches: Branch[]; audits: Audit[] };
type ModuleSession = { tab: Tab; branchSearch: string; historyBranch: string; historyFrom: string; historyTo: string; draft: AuditDraft; auditStage: 'branch' | 'equipment' | 'nozzle' | 'final'; selectedPumpId: string; selectedNozzleId: string; auditMeta: Record<string, string>; formKind: FormKind | null; form: Record<string, string>; editingId: string; formBranchId: string; formPumpId: string; flowStarted: number | null };
type AuditDraft = { branchId: string; data: Record<string, { checks: string[]; notes: string[] }> };
type Tab = 'inicio' | 'filiais' | 'auditoria' | 'historico';
type FormKind = 'branch' | 'pump' | 'nozzle';

const STORAGE_KEY = 'nevoeiro.afericoes.dashboard.v1'; // formato antigo (só leitura, para migrar dados locais)
const MIGRATED_KEY = STORAGE_KEY + '.migrado.v2';
type AuditRow = SyncRow & { branch: string; service_date: string; status: string; payload: { kind: 'audit'; value: Audit } };
type Equipamentos = { pumps: Pump[] };
// Inspeções continuam em service_records. Filiais e equipamentos vêm do cadastro compartilhado (lib/data).
const auditsCol = new Collection<AuditRow>({ table: 'service_records', storageKey: 'nevoeiro.afericoes.audits.v2', softDelete: false, filter: q => q.eq('payload->>kind', 'audit') });
function auditRow(a: Audit): AuditRow { return ({ id: a.id, branch: a.branchName, service_date: a.date || today(), status: 'done', payload: { kind: 'audit', value: a } }); }
const SESSION_KEY = STORAGE_KEY + '.session.v1';
const CRITERIA = ['Lenta', 'Rápida', 'Erro', 'Luz', 'Mangueira', 'BICO', 'Lacres', 'Sump', 'Vazão', 'Des. 60s'];
const SCALE = ['Lenta', 'Rápida', 'Erro'];
const NUMERIC = ['Vazão', 'Des. 60s'];
const EMPTY_DATA: DashboardData = { branches: [], audits: [] };
const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const uid = (prefix: string) => prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
const dateLabel = (value: string) => { const p = value.split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : value; };
const emptyDraft = (): AuditDraft => ({ branchId: '', data: {} });

function auditStatus(a: Audit) {
  const checks = a.results.filter(r => r.done).flatMap(r => r.checks);
  if (checks.includes('NC')) return 'NC';
  if (checks.includes('OB')) return 'OB';
  return 'C';
}
const htmlEscape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] ?? char));

export default function AfericoesModule() {
  const { isAdmin } = useAuth();
  const router = useRouter();
  // Combustíveis do catálogo único (Central → Cadastros → Combustíveis).
  const catalogoCombustiveis = useCombustiveis();
  const FUELS = useMemo(() => { const nomes = combustiveisAtivos(catalogoCombustiveis).map(c => c.nome); return nomes.length ? nomes : ['Outro']; }, [catalogoCombustiveis]);
  const filiaisSnap = useCollection(filiaisCol);
  const docsSnap = useCollection(docsCol);
  const auditsSnap = useCollection(auditsCol);
  const data = useMemo<DashboardData>(() => ({
    branches: [...filiaisSnap.list].sort(ordenarFiliais).map(f => ({
      id: f.id, code: f.codigo, name: f.nome, city: f.cidade, state: f.uf,
      pumps: (docsSnap.list.find(d => d.id === docId(f.id, 'equipamentos'))?.payload as Equipamentos | undefined)?.pumps ?? [],
    })),
    audits: auditsSnap.list.map(r => r.payload?.value).filter((a): a is Audit => !!a).sort((a, b) => b.date.localeCompare(a.date)),
  }), [filiaisSnap.list, docsSnap.list, auditsSnap.list]);
  const dataRef = useRef(data);
  dataRef.current = data;
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const legacyRef = useRef<DashboardData | null>(null);
  const loaded = sessionLoaded && filiaisSnap.loaded && docsSnap.loaded && auditsSnap.loaded;
  const syncError = combinedStatus([filiaisSnap.status, docsSnap.status, auditsSnap.status]) === 'error';
  const [tab, setTab] = useState<Tab>('inicio');
  const [branchSearch, setBranchSearch] = useState('');
  const [historyBranch, setHistoryBranch] = useState('');
  const [historyFrom, setHistoryFrom] = useState('');
  const [historyTo, setHistoryTo] = useState('');
  const [formKind, setFormKind] = useState<FormKind | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState('');
  const [formBranchId, setFormBranchId] = useState('');
  const [formPumpId, setFormPumpId] = useState('');
  const [draft, setDraft] = useState<AuditDraft>(emptyDraft());
  const [auditStage, setAuditStage] = useState<'branch' | 'equipment' | 'nozzle' | 'final'>('branch');
  const [selectedPumpId, setSelectedPumpId] = useState('');
  const [selectedNozzleId, setSelectedNozzleId] = useState('');
  const [auditMeta, setAuditMeta] = useState<Record<string, string>>({ date: today(), auditor: '', seal: '', inmetro: '', panels: '', rodilhas: '', condBombas: '', condBombasObs: '', condIlhas: '', condIlhasObs: '', generalNotes: '', observations: '' });
  const [detailAudit, setDetailAudit] = useState<Audit | null>(null);
  const [importVisible, setImportVisible] = useState(false);
  const [importText, setImportText] = useState('');
  const [flowStarted, setFlowStarted] = useState<number | null>(null);
  const [flowNow, setFlowNow] = useState(Date.now());
  const { colors } = useContext(ThemeContext);
  const textStyles = useMemo(() => createTypography(colors), [colors]);
  const s = useMemo(() => createScreenStyles(colors), [colors]);
  const toneText: Record<Tone, string> = { success: colors.success, warning: colors.warning, danger: colors.danger, neutral: colors.textMuted, accent: colors.accentText };
  const insets = useSafeAreaInsets();
  const { mode } = useContext(ThemeContext);
  const { payload: croquiDoc } = useFilialDoc<CroquiDoc>(draft.branchId || null, 'croqui');
  const [zoomCroqui, setZoomCroqui] = useState(1);
  const sessionQueue = useRef<Promise<void>>(Promise.resolve());
  const sessionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionSnapshot = useMemo(() => JSON.stringify({ tab, branchSearch, historyBranch, historyFrom, historyTo, draft, auditStage, selectedPumpId, selectedNozzleId, auditMeta, formKind, form, editingId, formBranchId, formPumpId, flowStarted }), [tab, branchSearch, historyBranch, historyFrom, historyTo, draft, auditStage, selectedPumpId, selectedNozzleId, auditMeta, formKind, form, editingId, formBranchId, formPumpId, flowStarted]);
  const sessionSnapshotRef = useRef(sessionSnapshot);
  sessionSnapshotRef.current = sessionSnapshot;
  const queueSessionSave = useCallback((snapshot: string) => {
    sessionQueue.current = sessionQueue.current.catch(() => undefined).then(() => AsyncStorage.setItem(SESSION_KEY, snapshot));
  }, []);
  useEffect(() => {
    if (!loaded) return;
    if (sessionTimer.current) clearTimeout(sessionTimer.current);
    sessionTimer.current = setTimeout(() => queueSessionSave(sessionSnapshot), 100);
    return () => { if (sessionTimer.current) clearTimeout(sessionTimer.current); };
  }, [loaded, sessionSnapshot, queueSessionSave]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => { if (state !== 'active' && loaded) queueSessionSave(sessionSnapshotRef.current); });
    return () => { sub.remove(); queueSessionSave(sessionSnapshotRef.current); };
  }, [loaded, queueSessionSave]);
  useEffect(() => {
    void Promise.all([AsyncStorage.getItem(STORAGE_KEY), AsyncStorage.getItem(SESSION_KEY), AsyncStorage.getItem(MIGRATED_KEY)]).then(([rawData, rawSession, migrated]) => {
      if (rawData && !migrated) { try { legacyRef.current = JSON.parse(rawData) as DashboardData; } catch { legacyRef.current = null; } }
      if (rawSession) {
        try {
          const saved = JSON.parse(rawSession) as Partial<ModuleSession>;
          setTab(saved.tab && ['inicio', 'filiais', 'auditoria', 'historico'].includes(saved.tab) ? saved.tab : 'inicio');
          setBranchSearch(saved.branchSearch ?? ''); setHistoryBranch(saved.historyBranch ?? '');
          setHistoryFrom(saved.historyFrom ?? ''); setHistoryTo(saved.historyTo ?? '');
          setDraft(saved.draft ?? emptyDraft());
          setAuditStage(saved.auditStage ?? 'branch');
          setSelectedPumpId(saved.selectedPumpId ?? '');
          setSelectedNozzleId(saved.selectedNozzleId ?? '');
          if (saved.auditMeta) setAuditMeta(saved.auditMeta);
          if (saved.flowStarted) setFlowStarted(saved.flowStarted);
          if (saved.formKind) { setFormKind(saved.formKind); setForm(saved.form ?? {}); setEditingId(saved.editingId ?? ''); setFormBranchId(saved.formBranchId ?? ''); setFormPumpId(saved.formPumpId ?? ''); }
        } catch { void AsyncStorage.removeItem(SESSION_KEY); }
      }
    }).catch(() => notify('Erro', 'Não foi possível carregar os dados salvos.')).finally(() => setSessionLoaded(true));
  }, []);
  useEffect(() => { if (flowStarted === null) return; const i = setInterval(() => setFlowNow(Date.now()), 100); return () => clearInterval(i); }, [flowStarted]);

  /** Grava apenas o que mudou: dados da filial (admin), equipamentos da filial e inspeções novas ou alteradas. */
  const persist = useCallback(async (next: DashboardData) => {
    const cur = dataRef.current;
    const atual = new Map(cur.branches.map(b => [b.id, b]));
    let negado = false;
    next.branches.forEach(b => {
      const old = atual.get(b.id);
      if (!old || old.code !== b.code || old.name !== b.name || old.city !== b.city || old.state !== b.state) {
        if (!isAdmin) { negado = true; return; }
        const base = filiaisCol.get(b.id);
        filiaisCol.put({ ...(base ?? { bandeira: 'branca' }), id: b.id, codigo: b.code, nome: b.name, cidade: b.city, uf: b.state || 'RS', bandeira: base?.bandeira ?? 'branca' });
      }
      if (!old || JSON.stringify(old.pumps) !== JSON.stringify(b.pumps)) saveFilialDoc<Equipamentos>(b.id, 'equipamentos', { pumps: b.pumps });
    });
    cur.branches.filter(b => !next.branches.some(n => n.id === b.id)).forEach(b => { if (isAdmin) filiaisCol.remove(b.id); else negado = true; });
    const audits = new Map(cur.audits.map(a => [a.id, a]));
    const mudou = next.audits.filter(a => { const old = audits.get(a.id); return !old || JSON.stringify(old) !== JSON.stringify(a); });
    if (mudou.length) auditsCol.putMany(mudou.map(auditRow));
    if (negado) notify('Somente o administrador altera o cadastro de filiais', 'Use a tela Filiais, na central de módulos.');
  }, [isAdmin]);

  // Ao abrir o módulo, busca só o que mudou no servidor.
  useEffect(() => { void Promise.all([filiaisCol.sync(), docsCol.sync(), auditsCol.sync()]); }, []);

  // Migração única dos dados que este aparelho tinha no formato antigo (filiais, bombas e aferições locais).
  useEffect(() => {
    const legacy = legacyRef.current;
    if (!loaded || !legacy) return;
    if (isSyncEnabled() && !(filiaisCol.pulledOnce && docsCol.pulledOnce && auditsCol.pulledOnce)) return;
    legacyRef.current = null;
    legacy.branches.forEach(b => {
      if (!filiaisCol.get(b.id) && isAdmin) filiaisCol.put({ id: b.id, codigo: b.code, nome: b.name, cidade: b.city, uf: b.state || 'RS', bandeira: 'branca' });
      if ((filiaisCol.get(b.id) || isAdmin) && !docsCol.get(docId(b.id, 'equipamentos')) && b.pumps.length) saveFilialDoc<Equipamentos>(b.id, 'equipamentos', { pumps: b.pumps });
    });
    const novas = legacy.audits.filter(a => !auditsCol.get(a.id));
    if (novas.length) auditsCol.putMany(novas.map(auditRow));
    void AsyncStorage.setItem(MIGRATED_KEY, '1');
  }, [loaded, isAdmin, filiaisSnap.version, docsSnap.version, auditsSnap.version]);

  const openForm = (kind: FormKind, initial: Record<string, string> = {}, id = '', branchId = '', pumpId = '') => { setFormKind(kind); setForm(initial); setEditingId(id); setFormBranchId(branchId); setFormPumpId(pumpId); };
  const closeForm = () => { setFormKind(null); setForm({}); setEditingId(''); };
  const setFormValue = (key: string, value: string) => setForm(current => ({ ...current, [key]: value }));
  const saveForm = () => {
    const branches = data.branches.map(b => ({ ...b, pumps: b.pumps.map(p => ({ ...p, nozzles: [...p.nozzles] })) }));
    if (formKind === 'branch') {
      if (!form.code?.trim() || !form.name?.trim()) { notify('Campos obrigatórios', 'Informe o código e o nome da filial.'); return; }
      if (branches.some(b => b.code.toLowerCase() === form.code.trim().toLowerCase() && b.id !== editingId)) { notify('Código existente', 'Já existe uma filial com esse código.'); return; }
      if (editingId) { const b = branches.find(x => x.id === editingId); if (b) Object.assign(b, { code: form.code.trim(), name: form.name.trim(), city: form.city?.trim() ?? '', state: form.state?.trim().toUpperCase() || 'RS' }); }
      else branches.push({ id: uid('filial'), code: form.code.trim(), name: form.name.trim(), city: form.city?.trim() ?? '', state: form.state?.trim().toUpperCase() || 'RS', pumps: [] });
    } else if (formKind === 'pump') {
      const branch = branches.find(b => b.id === formBranchId); if (!branch || !form.number?.trim()) { notify('Campo obrigatório', 'Informe a identificação da bomba.'); return; }
      if (editingId) { const p = branch.pumps.find(x => x.id === editingId); if (p) p.number = form.number.trim(); }
      else branch.pumps.push({ id: uid('bomba'), number: form.number.trim(), nozzles: [] });
    } else if (formKind === 'nozzle') {
      const pump = branches.find(b => b.id === formBranchId)?.pumps.find(p => p.id === formPumpId); if (!pump || !form.number?.trim()) { notify('Campo obrigatório', 'Informe a identificação do bico.'); return; }
      const nozzle = { id: editingId || uid('bico'), number: form.number.trim(), fuel: form.fuel || FUELS[0] };
      if (editingId) { const idx = pump.nozzles.findIndex(n => n.id === editingId); if (idx >= 0) pump.nozzles[idx] = nozzle; } else pump.nozzles.push(nozzle);
    }
    void persist({ ...data, branches }); closeForm();
  };
  const removePump = (branchId: string, pumpId: string) => confirmAction('Excluir bomba?', 'Os bicos cadastrados nesta bomba também serão removidos.', 'Excluir', () => { const next = { ...data, branches: data.branches.map(b => b.id === branchId ? { ...b, pumps: b.pumps.filter(p => p.id !== pumpId) } : b) }; void persist(next); });
  const removeNozzle = (branchId: string, pumpId: string, nozzleId: string) => confirmAction('Excluir bico?', '', 'Excluir', () => { const next = { ...data, branches: data.branches.map(b => b.id === branchId ? { ...b, pumps: b.pumps.map(p => p.id === pumpId ? { ...p, nozzles: p.nozzles.filter(n => n.id !== nozzleId) } : p) } : b) }; void persist(next); });

  const beginAudit = () => {
    const hasWork = !!draft.branchId || Object.keys(draft.data).length > 0;
    const start = () => { setDraft(emptyDraft()); setAuditStage('branch'); setSelectedPumpId(''); setSelectedNozzleId(''); setAuditMeta({ date: today(), auditor: '', seal: '', inmetro: '', panels: '', rodilhas: '', condBombas: '', condBombasObs: '', condIlhas: '', condIlhasObs: '', generalNotes: '', observations: '' }); setTab('auditoria'); };
    if (hasWork) { confirmAction('Iniciar nova afericao?', 'O rascunho atual sera descartado. Deseja continuar?', 'Descartar e iniciar', start); return; }
    start();
  };
  const branch = data.branches.find(b => b.id === draft.branchId);
  const currentPump = branch?.pumps.find(p => p.id === selectedPumpId);
  const currentNozzle = currentPump?.nozzles.find(n => n.id === selectedNozzleId);
  const setAuditCheck = (index: number, value: string) => setDraft(d => { const old = d.data[selectedNozzleId] ?? { checks: [], notes: [] }; const checks = [...old.checks]; checks[index] = value; const notes = [...old.notes]; if (value !== 'NC' && value !== 'OB') notes[index] = ''; return { ...d, data: { ...d.data, [selectedNozzleId]: { checks, notes } } }; });
  const setAuditNote = (index: number, value: string) => setDraft(d => { const old = d.data[selectedNozzleId] ?? { checks: [], notes: [] }; const notes = [...old.notes]; notes[index] = value; return { ...d, data: { ...d.data, [selectedNozzleId]: { ...old, notes } } }; });
  const saveNozzleDraft = () => {
    const result = draft.data[selectedNozzleId]; if (!result?.checks.some(v => !!v)) { notify('Aferição vazia', 'Preencha ao menos um critério antes de salvar o bico.'); return; }
    setAuditStage('equipment'); setSelectedPumpId(''); setSelectedNozzleId(''); setFlowStarted(null);
  };
  const saveAudit = () => {
    if (!branch) return;
    const results: NozzleResult[] = [];
    branch.pumps.forEach(p => p.nozzles.forEach(n => { const entry = draft.data[n.id]; results.push({ pumpId: p.id, nozzleId: n.id, pump: p.number, nozzle: n.number, fuel: n.fuel, done: !!entry, checks: entry?.checks ?? CRITERIA.map(() => ''), notes: entry?.notes ?? CRITERIA.map(() => '') }); }));
    if (!results.some(r => r.done)) { notify('Nenhum bico aferido', 'Registre ao menos um bico antes de salvar.'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(auditMeta.date)) { notify('Data inválida', 'Informe a data no formato AAAA-MM-DD.'); return; }
    const audit: Audit = { id: uid('afericao'), branchId: branch.id, branchName: branch.name, branchCode: branch.code, branchCity: branch.city, branchState: branch.state, date: auditMeta.date, auditor: auditMeta.auditor, seal: auditMeta.seal, inmetro: auditMeta.inmetro, panels: auditMeta.panels, rodilhas: auditMeta.rodilhas, condBombas: auditMeta.condBombas ?? '', condBombasObs: auditMeta.condBombasObs ?? '', condIlhas: auditMeta.condIlhas ?? '', condIlhasObs: auditMeta.condIlhasObs ?? '', generalNotes: auditMeta.generalNotes, observations: auditMeta.observations, results };
    void persist({ ...data, audits: [audit, ...data.audits] }); setDraft(emptyDraft()); setAuditStage('branch'); setTab('historico');
    notify('Aferição salva', 'O resultado está disponível no histórico.');
  };

  const filteredBranches = useMemo(() => data.branches.filter(b => (b.name + ' ' + b.code).toLowerCase().includes(branchSearch.toLowerCase())), [data.branches, branchSearch]);
  const filteredAudits = useMemo(() => data.audits.filter(a => (!historyBranch || (a.branchName + ' ' + a.branchCode).toLowerCase().includes(historyBranch.toLowerCase())) && (!historyFrom || a.date >= historyFrom) && (!historyTo || a.date <= historyTo)).sort((a, b) => b.date.localeCompare(a.date)), [data.audits, historyBranch, historyFrom, historyTo]);
  const pumpCount = data.branches.reduce((sum, b) => sum + b.pumps.length, 0);
  const nozzleCount = data.branches.reduce((sum, b) => sum + b.pumps.reduce((n, p) => n + p.nozzles.length, 0), 0);
  const exportBackup = () => Share.share({ title: 'Backup Postora', message: JSON.stringify(data, null, 2) });
  const importBackup = (replace: boolean) => {
    try {
      const parsed = JSON.parse(importText) as DashboardData;
      if (!Array.isArray(parsed.branches) || !Array.isArray(parsed.audits)) throw new Error('invalid');
      const next = replace ? parsed : {
        branches: [...data.branches.filter(b => !parsed.branches.some(incoming => incoming.id === b.id)), ...parsed.branches],
        audits: [...data.audits.filter(a => !parsed.audits.some(incoming => incoming.id === a.id)), ...parsed.audits],
      };
      void persist(next); setImportVisible(false); setImportText('');
      notify('Backup importado', replace ? 'Os dados atuais foram substituídos.' : 'Os dados foram mesclados.');
    } catch { notify('Backup inválido', 'Cole um backup JSON exportado pelo aplicativo.'); }
  };
  const exportPdf = async (audit: Audit) => {
    try {
      const html = auditReportHtml(audit);
      if (Platform.OS === 'web') { await Print.printAsync({ html }); return; }
      const file = await Print.printToFileAsync({ html, width: 842, height: 595 }); // A4 paisagem (pontos)
      if (!(await Sharing.isAvailableAsync())) { notify('Compartilhamento indisponível', 'O PDF foi gerado, mas este aparelho não oferece compartilhamento de arquivos.'); return; }
      await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', dialogTitle: 'Relatório da aferição', UTI: 'com.adobe.pdf' });
    } catch { notify('Erro ao gerar PDF', 'Não foi possível criar o relatório desta aferição.'); }
  };
  const exportCsv = () => {
    const header = ['Filial', 'Código', 'Data', 'Aferidor', 'Bomba', 'Bico', 'Combustível', ...CRITERIA, 'Situação'];
    const rows = filteredAudits.flatMap(a => a.results.map(r => [a.branchName, a.branchCode, a.date, a.auditor, r.pump, r.nozzle, r.fuel, ...r.checks, r.done ? auditStatus(a) : 'Não realizado']));
    const csv = [header, ...rows].map(row => row.map(value => '"' + String(value ?? '').replace(/"/g, '""') + '"').join(';')).join('\n');
    void Share.share({ title: 'Histórico de aferições CSV', message: csv });
  };

  if (!loaded) return <LoadingScreen />;

  const page: Record<Tab, { title: string; subtitle: string }> = {
    inicio: { title: 'Visão geral', subtitle: 'Rede de postos' },
    filiais: { title: 'Filiais', subtitle: 'Unidades, bombas e bicos cadastrados' },
    auditoria: { title: 'Nova aferição', subtitle: branch ? `${branch.name} #${branch.code}` : 'Escolha a filial para começar' },
    historico: { title: 'Histórico', subtitle: `${filteredAudits.length} aferição(ões) encontrada(s)` },
  };
  const newBranch = () => router.push('/filiais');
  const stageIndex = { branch: 0, equipment: 1, nozzle: 2, final: 3 }[auditStage];
  const openNozzle = (pumpId: string, nozzleId: string) => { setSelectedPumpId(pumpId); setSelectedNozzleId(nozzleId); setAuditStage('nozzle'); };

  const renderBranchCard = (b: Branch) => {
    const nozzles = b.pumps.reduce((sum, p) => sum + p.nozzles.length, 0);
    return (
      <Card key={b.id}>
        <View style={s.rowCenter}>
          <CodeTile code={b.code} />
          <View style={s.flex}>
            <Text style={textStyles.bodyStrong} numberOfLines={1}>{b.name}</Text>
            <Text style={textStyles.caption}>{[b.city, b.state].filter(Boolean).join(', ') || 'Cidade não informada'}</Text>
          </View>
          <IconButton icon={PencilSimpleIcon} label="Dados da filial" onPress={() => router.push(`/filiais/${b.id}`)} />
        </View>
        <View style={s.pills}>
          <StatusPill icon={GasPumpIcon} label={`${b.pumps.length} bomba(s)`} />
          <StatusPill icon={DropIcon} label={`${nozzles} bico(s)`} />
        </View>
        {b.pumps.map(p => (
          <View key={p.id} style={s.pump}>
            <View style={s.rowCenter}>
              <GasPumpIcon size={18} color={tint.indigo.fg} weight="duotone" />
              <Text style={[textStyles.bodyStrong, s.flex]} numberOfLines={1}>{p.number}</Text>
              <IconButton icon={PencilSimpleIcon} label="Editar bomba" onPress={() => openForm('pump', { number: p.number }, p.id, b.id)} />
              <IconButton icon={TrashIcon} tone="danger" label="Excluir bomba" onPress={() => removePump(b.id, p.id)} />
            </View>
            {p.nozzles.map(n => (
              <View key={n.id} style={s.nozzle}>
                <DropIcon size={15} color={tint.emerald.fg} weight="duotone" />
                <Text style={textStyles.body}>Bico {n.number}</Text>
                <View style={s.flex}><StatusPill label={n.fuel} /></View>
                <IconButton icon={PencilSimpleIcon} label="Editar bico" onPress={() => openForm('nozzle', { number: n.number, fuel: n.fuel }, n.id, b.id, p.id)} />
                <IconButton icon={XIcon} tone="danger" label="Excluir bico" onPress={() => removeNozzle(b.id, p.id, n.id)} />
              </View>
            ))}
            <Button title="Adicionar bico" icon={PlusIcon} variant="ghost" size="sm" style={s.alignStart} onPress={() => openForm('nozzle', { number: '', fuel: FUELS[0] }, '', b.id, p.id)} />
          </View>
        ))}
        <Button title="Adicionar bomba" icon={PlusIcon} variant="secondary" size="sm" onPress={() => openForm('pump', { number: '' }, '', b.id)} />
      </Card>
    );
  };

  const renderAuditStage = () => {
    if (auditStage === 'branch') return <>
      <SectionHeader title="Escolha a filial" />
      {data.branches.length ? (
        <Card style={s.listCard}>
          {data.branches.map((b, i) => (
            <ListRow key={b.id} style={i > 0 && s.divided} icon={StorefrontIcon} tint="sky" title={`${b.name} #${b.code}`}
              subtitle={`${[b.city, b.state].filter(Boolean).join(', ') || 'Sem cidade'} · ${b.pumps.length} bomba(s)`}
              onPress={() => { setDraft({ branchId: b.id, data: {} }); setAuditStage('equipment'); }} />
          ))}
        </Card>
      ) : <EmptyState icon={StorefrontIcon} title="Nenhuma filial cadastrada" text="Cadastre a filial com suas bombas e bicos antes de aferir." action={{ label: 'Cadastrar filial', icon: PlusIcon, onPress: newBranch }} />}
    </>;

    if (auditStage === 'equipment' && branch) {
      const filled = Object.keys(draft.data).length;
      return <>
        <Button title="Trocar filial" icon={ArrowLeftIcon} variant="ghost" size="sm" style={s.alignStart} onPress={() => setAuditStage('branch')} />
        {(() => {
          const itens = croquiDoc?.items ?? [];
          if (!itens.length) return null;
          // Bomba do croqui <-> bomba do Aferições pelo número ("1" <-> "Bomba 01").
          const bombaDe = (label: string) => { const n = numeroBomba(label); return n === null ? undefined : branch.pumps.find(p => numeroBomba(p.number) === n); };
          const destaques: Record<string, string> = {};
          itens.forEach(it => {
            if (TIPOS_CROQUI[it.type]?.k !== 'b') return;
            const p = bombaDe(it.label);
            if (!p || !p.nozzles.length) return;
            const feitos = p.nozzles.filter(n => draft.data[n.id]);
            if (!feitos.length) return;
            const nc = feitos.some(n => draft.data[n.id].checks.includes('NC'));
            destaques[it.id] = nc ? '#dc2626' : feitos.length === p.nozzles.length ? '#16a34a' : '#d97706';
          });
          const filialCroqui = filiaisSnap.list.find(x => x.id === branch.id);
          return (
            <Card>
              <View style={s.rowCenter}>
                <Text style={[textStyles.bodyStrong, s.flex]}>Croqui da filial</Text>
                <IconButton icon={MinusIcon} label="Diminuir zoom do croqui" onPress={() => setZoomCroqui(z => Math.max(1, z - 0.5))} />
                <Text style={textStyles.caption}>{Math.round(zoomCroqui * 100)}%</Text>
                <IconButton icon={PlusIcon} label="Aumentar zoom do croqui" onPress={() => setZoomCroqui(z => Math.min(3, z + 0.5))} />
              </View>
              <CroquiCanvas items={itens} bandeira={filialCroqui?.bandeira ?? 'branca'} mostrarNomes paleta={{ ...(mode === 'dark' ? PALETA_ESCURA : PALETA_CLARA), accent: colors.accent }}
                zoom={zoomCroqui} destaques={destaques}
                onTapItem={it => {
                  const p = TIPOS_CROQUI[it.type]?.k === 'b' ? bombaDe(it.label) : undefined;
                  if (!p) { notify('Bomba sem correspondência', 'O número desta bomba no croqui não corresponde a nenhuma bomba cadastrada nesta filial.'); return; }
                  const n = p.nozzles.find(x => !draft.data[x.id]) ?? p.nozzles[0];
                  if (n) openNozzle(p.id, n.id); else notify('Bomba sem bicos cadastrados');
                }} />
              <Text style={textStyles.caption}>Toque numa bomba para aferir o próximo bico pendente. Verde: concluída · amarelo: em andamento · vermelho: com não conformidade.</Text>
            </Card>
          );
        })()}
        <Text style={textStyles.caption}>Toque em cada bico para registrar a inspeção. Bicos sem registro entram como não realizados.</Text>
        {branch.pumps.map(p => (
          <Card key={p.id} style={s.listCard}>
            <View style={[s.rowCenter, s.cardHead]}>
              <GasPumpIcon size={18} color={tint.indigo.fg} weight="duotone" />
              <Text style={textStyles.bodyStrong}>{p.number}</Text>
            </View>
            {p.nozzles.length ? p.nozzles.map(n => {
              const entry = draft.data[n.id];
              const st = !entry ? { label: 'Pendente', tone: 'neutral' as Tone } : entry.checks.includes('NC') ? { label: 'Não conforme', tone: 'danger' as Tone } : entry.checks.includes('OB') ? { label: 'Observação', tone: 'warning' as Tone } : { label: 'Aferido', tone: 'success' as Tone };
              return <ListRow key={n.id} style={s.divided} icon={DropIcon} tint="emerald" title={`Bico ${n.number}`} subtitle={n.fuel} right={<StatusPill label={st.label} tone={st.tone} />} onPress={() => openNozzle(p.id, n.id)} />;
            }) : <Text style={[textStyles.caption, s.padRow]}>Nenhum bico cadastrado nesta bomba.</Text>}
          </Card>
        ))}
        {!branch.pumps.length && <EmptyState icon={GasPumpIcon} title="Filial sem bombas" text="Cadastre bombas e bicos na aba Filiais." action={{ label: 'Abrir filiais', onPress: () => setTab('filiais') }} />}
        <Button title={`Revisar e finalizar (${filled})`} icon={CheckIcon} disabled={!filled} onPress={() => setAuditStage('final')} />
      </>;
    }

    if (auditStage === 'nozzle' && currentNozzle) {
      const entry = draft.data[currentNozzle.id] ?? { checks: [], notes: [] };
      const step = (index: number, value: string, delta: number) => setAuditCheck(index, String(Math.max(-200, Math.min(200, (Number(value) || 0) + delta))));
      return <>
        <Button title="Voltar aos bicos" icon={ArrowLeftIcon} variant="ghost" size="sm" style={s.alignStart} onPress={() => { setAuditStage('equipment'); setFlowStarted(null); }} />
        <View style={s.rowCenter}>
          <IconTile icon={DropIcon} tint="emerald" />
          <View style={s.flex}>
            <Text style={textStyles.section}>{currentPump?.number} · Bico {currentNozzle.number}</Text>
            <Text style={textStyles.caption}>{currentNozzle.fuel}</Text>
          </View>
        </View>
        <View style={s.note}>
          <Text style={s.noteText}>Lenta, Rápida e Erro usam escala de -200 a +200 mL, em passos de 20. Em OB ou NC, descreva a observação ou o local do erro.</Text>
        </View>
        <Card style={s.listCard}>
          {CRITERIA.map((criterion, index) => {
            const value = entry.checks[index] ?? '';
            const unit = SCALE.includes(criterion) ? 'mL' : NUMERIC.includes(criterion) ? 'L/min ou mL' : '';
            return (
              <View key={criterion} style={[s.criterion, index > 0 && s.divided]}>
                <View style={s.rowCenter}>
                  <Text style={[textStyles.bodyStrong, s.flex]}>{criterion}</Text>
                  {unit ? <Text style={textStyles.caption}>{unit}</Text> : null}
                </View>
                {SCALE.includes(criterion) ? (
                  <View style={s.stepper}>
                    <Pressable accessibilityLabel="Diminuir 20" onPress={() => step(index, value, -20)} style={({ pressed }) => [s.stepBtn, pressed && s.stepBtnPressed]}><MinusIcon size={18} color={colors.text} weight="bold" /></Pressable>
                    <Field estavel value={value} keyboardType="numeric" placeholder="0" textAlign="center" style={s.flex}
                      onChangeText={v => { const parsed = Number(v.replace(',', '.')); setAuditCheck(index, v === '' || Number.isNaN(parsed) ? v : String(Math.max(-200, Math.min(200, Math.round(parsed / 20) * 20)))); }} />
                    <Pressable accessibilityLabel="Aumentar 20" onPress={() => step(index, value, 20)} style={({ pressed }) => [s.stepBtn, pressed && s.stepBtnPressed]}><PlusIcon size={18} color={colors.text} weight="bold" /></Pressable>
                  </View>
                ) : NUMERIC.includes(criterion) ? <>
                  <Field estavel value={value} keyboardType="decimal-pad" placeholder={criterion === 'Vazão' ? 'Litros em 6 s × 10' : 'Segundos até desligar'} onChangeText={v => setAuditCheck(index, v)} />
                  {criterion === 'Des. 60s' && (
                    <View style={s.timer}>
                      <TimerIcon size={20} color={colors.textMuted} />
                      <Text style={s.timerText}>{flowStarted === null ? '0,0 s' : ((flowNow - flowStarted) / 1000).toFixed(1).replace('.', ',') + ' s'}</Text>
                      <Button title={flowStarted === null ? 'Iniciar' : 'Parar e salvar'} icon={flowStarted === null ? PlayIcon : StopIcon} variant={flowStarted === null ? 'secondary' : 'primary'} size="sm"
                        onPress={() => {
                          if (flowStarted === null) { setFlowStarted(Date.now()); return; }
                          // Ao parar, o tempo medido é gravado no campo Des. 60s.
                          setAuditCheck(index, ((Date.now() - flowStarted) / 1000).toFixed(1).replace('.', ','));
                          setFlowStarted(null);
                        }} />
                      <IconButton icon={ResetIcon} label="Zerar cronômetro" onPress={() => setFlowStarted(null)} />
                    </View>
                  )}
                  {criterion === 'Des. 60s' && <Text style={textStyles.caption}>Inicie quando parar de abastecer e toque em Parar e salvar quando a bomba desligar. O tempo vai para o campo acima.</Text>}
                </> : (
                  <ChoiceChips value={value} options={['C', 'OB', 'NC', 'NA']} toneFor={codeTone} onChange={code => setAuditCheck(index, value === code ? '' : code)} />
                )}
                {(value === 'NC' || value === 'OB') && <Field value={entry.notes[index] ?? ''} onChangeText={v => setAuditNote(index, v)} placeholder={value === 'OB' ? 'Descreva a observação' : 'Onde está o erro?'} />}
              </View>
            );
          })}
        </Card>
        <Card style={s.mutedCard}>
          <Text style={textStyles.label}>Códigos de não conformidade</Text>
          {[['NC00', 'Erro fora do limite'], ['NC01', 'Lacre violado'], ['NC02', 'Selo vencido'], ['NC03', 'Vazamento']].map(([code, label]) => (
            <View key={code} style={s.rowCenter}><StatusPill label={code} tone="danger" /><Text style={textStyles.body}>{label}</Text></View>
          ))}
        </Card>
        <Button title="Salvar bico" icon={CheckIcon} onPress={saveNozzleDraft} />
      </>;
    }

    if (auditStage === 'final' && branch) return <>
      <Button title="Voltar aos bicos" icon={ArrowLeftIcon} variant="ghost" size="sm" style={s.alignStart} onPress={() => setAuditStage('equipment')} />
      <SectionHeader title="Resumo dos bicos" />
      <Card style={s.listCard}>
        {branch.pumps.flatMap(p => p.nozzles.map(n => ({ p, n }))).map(({ p, n }, i) => (
          <ListRow key={n.id} style={i > 0 && s.divided} title={`${p.number} · Bico ${n.number}`} subtitle={n.fuel} chevron
            right={<StatusPill label={draft.data[n.id] ? 'Aferido' : 'Não realizado'} tone={draft.data[n.id] ? 'success' : 'neutral'} />}
            onPress={() => openNozzle(p.id, n.id)} />
        ))}
      </Card>
      <SectionHeader title="Dados da aferição" />
      <Card>
        <Field label="Data da aferição" helper="Formato AAAA-MM-DD" icon={CalendarBlankIcon} value={auditMeta.date} onChangeText={v => setAuditMeta(m => ({ ...m, date: v }))} />
        <Field label="Aferidor" value={auditMeta.auditor} onChangeText={v => setAuditMeta(m => ({ ...m, auditor: v }))} placeholder="Nome do responsável" />
        <View style={s.twoCol}>
          <Field label="Lacre geral" style={s.flex} value={auditMeta.seal} onChangeText={v => setAuditMeta(m => ({ ...m, seal: v }))} placeholder="Identificação" />
          <Field label="Selo Inmetro" style={s.flex} value={auditMeta.inmetro} onChangeText={v => setAuditMeta(m => ({ ...m, inmetro: v }))} placeholder="Número ou validade" />
        </View>
        <View style={s.group}><Text style={textStyles.label}>Painéis das bombas</Text><ChoiceChips value={auditMeta.panels} options={['Ligados', 'Desligados', 'Não aplicável']} onChange={v => setAuditMeta(m => ({ ...m, panels: v }))} /></View>
        <View style={s.group}><Text style={textStyles.label}>Rodilhas</Text><ChoiceChips value={auditMeta.rodilhas} options={['Conforme', 'Não conforme', 'Não aplicável']} toneFor={v => v === 'Conforme' ? 'success' : v === 'Não conforme' ? 'danger' : 'neutral'} onChange={v => setAuditMeta(m => ({ ...m, rodilhas: v }))} /></View>
        <View style={s.group}><Text style={textStyles.label}>Condições das bombas</Text><ChoiceChips value={auditMeta.condBombas ?? ''} options={['Boas', 'Regulares', 'Ruins']} toneFor={v => v === 'Boas' ? 'success' : v === 'Regulares' ? 'warning' : 'danger'} onChange={v => setAuditMeta(m => ({ ...m, condBombas: m.condBombas === v ? '' : v }))} /></View>
        <Field label="Detalhes (opcional)" value={auditMeta.condBombasObs ?? ''} onChangeText={v => setAuditMeta(m => ({ ...m, condBombasObs: v }))} placeholder="Ex.: pintura desgastada, adesivos soltos" />
        <View style={s.group}><Text style={textStyles.label}>Condições das ilhas</Text><ChoiceChips value={auditMeta.condIlhas ?? ''} options={['Boas', 'Regulares', 'Ruins']} toneFor={v => v === 'Boas' ? 'success' : v === 'Regulares' ? 'warning' : 'danger'} onChange={v => setAuditMeta(m => ({ ...m, condIlhas: m.condIlhas === v ? '' : v }))} /></View>
        <Field label="Detalhes (opcional)" value={auditMeta.condIlhasObs ?? ''} onChangeText={v => setAuditMeta(m => ({ ...m, condIlhasObs: v }))} placeholder="Ex.: pintura desgastada, adesivos soltos" />
        <Field label="Observação geral" value={auditMeta.generalNotes} onChangeText={v => setAuditMeta(m => ({ ...m, generalNotes: v }))} />
        <Field label="Irregularidades encontradas" value={auditMeta.observations} onChangeText={v => setAuditMeta(m => ({ ...m, observations: v }))} placeholder="Descreva a ocorrência e o código NC correspondente" multiline />
      </Card>
      <Button title="Salvar aferição" icon={CheckIcon} onPress={saveAudit} />
    </>;

    return <EmptyState icon={StorefrontIcon} title="Selecione uma filial" text="Volte ao início da aferição para escolher a unidade." action={{ label: 'Escolher filial', onPress: () => setAuditStage('branch') }} />;
  };

  const syncPill = !isSupabaseConfigured
    ? <StatusPill icon={DeviceMobileIcon} label="Neste aparelho" />
    : syncError ? <StatusPill icon={CloudSlashIcon} label="Sem sincronizar" tone="warning" /> : <StatusPill icon={CloudCheckIcon} label="Sincronizado" tone="success" />;

  const headerAction = tab === 'filiais'
    ? (isAdmin ? <Button title="Cadastro de filiais" icon={StorefrontIcon} variant="secondary" size="sm" onPress={newBranch} /> : null)
    : tab === 'historico' ? <Button title="Exportar CSV" icon={FileCsvIcon} variant="secondary" size="sm" disabled={!filteredAudits.length} onPress={exportCsv} /> : null;

  const pageHead = (
    <View style={s.pageHead}>
      <View style={s.flex}>
        <Text style={textStyles.title}>{page[tab].title}</Text>
        <Text style={textStyles.caption} numberOfLines={1}>{page[tab].subtitle}</Text>
      </View>
      {headerAction}
    </View>
  );

  const NAV: [Tab, Icon, string][] = [['inicio', HouseIcon, 'Início'], ['auditoria', ClipboardTextIcon, 'Aferir'], ['filiais', StorefrontIcon, 'Filiais'], ['historico', ClockCounterClockwiseIcon, 'Histórico']];

  return <SafeAreaView style={s.safe} edges={['top']}>
    <View style={s.header}>
      <IconButton icon={ArrowLeftIcon} label="Voltar aos módulos" onPress={() => { if (router.canGoBack()) router.back(); else router.replace('/'); }} />
      <View style={s.brandMark}><GasPumpIcon size={18} color="#fff" weight="bold" /></View>
      <View style={s.flex}>
        <Text style={s.brandName}>Aferições</Text>
        <Text style={s.brandSub}>Módulo</Text>
      </View>
      {syncPill}
    </View>
    {syncError && <View style={s.banner}><CloudSlashIcon size={16} color={colors.warning} /><Text style={s.bannerText}>Sem conexão com a nuvem. Os dados continuam salvos neste aparelho.</Text></View>}

    {tab === 'historico' ? (
      <FlatList
        data={filteredAudits}
        keyExtractor={a => a.id}
        contentContainerStyle={s.content}
        ItemSeparatorComponent={() => <View style={{ height: space.sm }} />}
        ListHeaderComponent={<View style={s.stack}>
          {pageHead}
          <Card>
            <Field icon={MagnifyingGlassIcon} value={historyBranch} onChangeText={setHistoryBranch} placeholder="Filial por nome ou código" />
            <View style={s.twoCol}>
              <Field label="De" icon={CalendarBlankIcon} style={s.flex} value={historyFrom} onChangeText={setHistoryFrom} placeholder="AAAA-MM-DD" />
              <Field label="Até" icon={CalendarBlankIcon} style={s.flex} value={historyTo} onChangeText={setHistoryTo} placeholder="AAAA-MM-DD" />
            </View>
          </Card>
          <View style={{ height: space.xs }} />
        </View>}
        ListEmptyComponent={<EmptyState icon={ClockCounterClockwiseIcon} title="Nenhuma aferição encontrada" text="Ajuste os filtros ou registre uma nova aferição." action={{ label: 'Nova aferição', icon: PlusIcon, onPress: beginAudit }} />}
        renderItem={({ item }) => <AuditRow audit={item} card onPress={() => setDetailAudit(item)} />}
      />
    ) : (
      <ScrollView key={tab} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <View style={s.stack}>
          {pageHead}

          {tab === 'inicio' && <>
            <Card style={s.cta}>
              <IconTile icon={ClipboardTextIcon} tint="indigo" size={44} />
              <View style={s.flex}>
                <Text style={textStyles.bodyStrong}>Registrar aferição</Text>
                <Text style={textStyles.caption}>Filial, bombas e bicos em sequência.</Text>
              </View>
              <Button title="Iniciar" icon={PlusIcon} size="sm" onPress={beginAudit} />
            </Card>
            <View style={s.stats}>
              <Stat icon={StorefrontIcon} tint="sky" label="Filiais" value={data.branches.length} />
              <Stat icon={GasPumpIcon} tint="indigo" label="Bombas" value={pumpCount} />
              <Stat icon={DropIcon} tint="emerald" label="Bicos" value={nozzleCount} />
              <Stat icon={ListChecksIcon} tint="amber" label="Aferições" value={data.audits.length} />
            </View>

            <SectionHeader title="Aferições recentes" action={data.audits.length ? 'Ver histórico' : undefined} onPress={() => setTab('historico')} />
            {data.audits.length ? (
              <Card style={s.listCard}>{data.audits.slice(0, 4).map((a, i) => <AuditRow key={a.id} audit={a} divided={i > 0} onPress={() => setDetailAudit(a)} />)}</Card>
            ) : <EmptyState icon={ListChecksIcon} title="Nenhuma aferição ainda" text="As aferições salvas aparecem aqui com o resultado de cada filial." />}

            <SectionHeader title="Filiais" action={data.branches.length ? 'Ver todas' : undefined} onPress={() => setTab('filiais')} />
            {data.branches.length ? (
              <Card style={s.listCard}>
                {data.branches.slice(0, 5).map((b, i) => (
                  <ListRow key={b.id} style={i > 0 && s.divided} icon={StorefrontIcon} tint="sky" title={b.name}
                    subtitle={`#${b.code} · ${b.pumps.length} bomba(s), ${b.pumps.reduce((n, p) => n + p.nozzles.length, 0)} bico(s)`} onPress={() => setTab('filiais')} />
                ))}
              </Card>
            ) : <EmptyState icon={StorefrontIcon} title="Cadastre a primeira filial" text="Depois adicione as bombas e os bicos de cada unidade." action={{ label: 'Cadastrar filial', icon: PlusIcon, onPress: newBranch }} />}

            <SectionHeader title="Dados" />
            <Card style={s.listCard}>
              <ListRow icon={UploadSimpleIcon} tint="slate" title="Exportar backup" subtitle="Compartilhar filiais e aferições em JSON" onPress={() => void exportBackup()} />
              <ListRow style={s.divided} icon={DownloadSimpleIcon} tint="slate" title="Importar backup" subtitle="Mesclar ou substituir a partir de um JSON" onPress={() => setImportVisible(true)} />
            </Card>
          </>}

          {tab === 'filiais' && <>
            <Field icon={MagnifyingGlassIcon} value={branchSearch} onChangeText={setBranchSearch} placeholder="Pesquisar por nome ou código" />
            {filteredBranches.map(renderBranchCard)}
            {!filteredBranches.length && (data.branches.length
              ? <EmptyState icon={MagnifyingGlassIcon} title="Nenhuma filial encontrada" text="Confira o nome ou o código pesquisado." />
              : <EmptyState icon={StorefrontIcon} title="Nenhuma filial cadastrada" text="Cadastre a unidade e depois as bombas e bicos." action={{ label: 'Cadastrar filial', icon: PlusIcon, onPress: newBranch }} />)}
          </>}

          {tab === 'auditoria' && <>
            <Steps steps={['Filial', 'Bicos', 'Inspeção', 'Finalizar']} current={stageIndex} />
            {renderAuditStage()}
          </>}
        </View>
      </ScrollView>
    )}

    <View style={[s.nav, { paddingBottom: Math.max(insets.bottom, 6) }]}>
      {NAV.map(([id, NavIcon, label]) => {
        const active = tab === id;
        return (
          <Pressable key={id} accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={() => setTab(id)} style={s.navItem}>
            <View style={[s.navIcon, active && s.navIconActive]}><NavIcon size={22} color={active ? colors.accent : colors.textFaint} weight={active ? 'fill' : 'regular'} /></View>
            <Text style={[s.navLabel, active && s.navLabelActive]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>

    {formKind && (
      <Sheet
        title={formKind === 'branch' ? (editingId ? 'Editar filial' : 'Nova filial') : formKind === 'pump' ? (editingId ? 'Editar bomba' : 'Nova bomba') : (editingId ? 'Editar bico' : 'Novo bico')}
        onClose={closeForm}
        footer={<View style={s.twoCol}><Button title="Cancelar" variant="secondary" style={s.flex} onPress={closeForm} /><Button title="Salvar" icon={CheckIcon} style={s.flex} onPress={saveForm} /></View>}
      >
        {formKind === 'branch' && <>
          <View style={s.twoCol}>
            <Field label="Código" style={{ width: 110 }} value={form.code ?? ''} onChangeText={v => setFormValue('code', v)} placeholder="05" />
            <Field label="Nome da filial" style={s.flex} value={form.name ?? ''} onChangeText={v => setFormValue('name', v)} placeholder="Posto Centro" />
          </View>
          <View style={s.twoCol}>
            <Field label="Cidade" style={s.flex} value={form.city ?? ''} onChangeText={v => setFormValue('city', v)} placeholder="Caxias do Sul" />
            <Field label="UF" style={{ width: 80 }} value={form.state ?? ''} onChangeText={v => setFormValue('state', v)} placeholder="RS" autoCapitalize="characters" maxLength={2} />
          </View>
        </>}
        {formKind === 'pump' && <Field label="Identificação da bomba" value={form.number ?? ''} onChangeText={v => setFormValue('number', v)} placeholder="Bomba 01" />}
        {formKind === 'nozzle' && <>
          <Field label="Número do bico" value={form.number ?? ''} onChangeText={v => setFormValue('number', v)} placeholder="01" />
          <View style={s.group}><Text style={textStyles.label}>Combustível</Text><ChoiceChips value={form.fuel ?? FUELS[0]} options={form.fuel && !FUELS.includes(form.fuel) ? [...FUELS, form.fuel] : FUELS} onChange={v => setFormValue('fuel', v)} /></View>
        </>}
      </Sheet>
    )}

    {importVisible && (
      <Sheet
        title="Importar backup"
        onClose={() => setImportVisible(false)}
        footer={<>
          <Button title="Importar e mesclar" icon={DownloadSimpleIcon} disabled={!importText.trim()} onPress={() => importBackup(false)} />
        </>}
      >
        <Text style={textStyles.caption}>Cole o conteúdo de um backup exportado pelo app. Mesclar mantém o que já existe e atualiza os registros com o mesmo ID.</Text>
        <Field value={importText} onChangeText={setImportText} multiline placeholder="Cole o JSON aqui" style={{ minHeight: 200 }} />
      </Sheet>
    )}

    {detailAudit && (
      <Sheet
        title={`${detailAudit.branchName} #${detailAudit.branchCode}`}
        onClose={() => setDetailAudit(null)}
        footer={<Button title="Exportar PDF" icon={FilePdfIcon} onPress={() => void exportPdf(detailAudit)} />}
      >
        <AuditStatusPill audit={detailAudit} />
        <View style={s.metaGrid}>
          {([['Data', dateLabel(detailAudit.date)], ['Aferidor', detailAudit.auditor], ['Lacre geral', detailAudit.seal], ['Selo Inmetro', detailAudit.inmetro], ['Painéis', detailAudit.panels], ['Rodilhas', detailAudit.rodilhas], ['Condições das bombas', [detailAudit.condBombas, detailAudit.condBombasObs].filter(Boolean).join(' · ')], ['Condições das ilhas', [detailAudit.condIlhas, detailAudit.condIlhasObs].filter(Boolean).join(' · ')]] as [string, string][]).map(([label, value]) => (
            <View key={label} style={s.metaCell}><Text style={textStyles.caption}>{label}</Text><Text style={textStyles.bodyStrong} numberOfLines={1}>{value || '-'}</Text></View>
          ))}
        </View>
        <SectionHeader title="Bicos" />
        {detailAudit.results.map(r => (
          <Card key={r.nozzleId}>
            <View style={s.rowCenter}>
              <Text style={[textStyles.bodyStrong, s.flex]}>{r.pump} · Bico {r.nozzle}</Text>
              <StatusPill label={r.fuel} />
            </View>
            {r.done ? (
              <View style={s.critGrid}>
                {CRITERIA.map((criterion, i) => {
                  const v = r.checks[i] || '-';
                  const tone = codeTone(v);
                  return (
                    <View key={criterion} style={s.critCell}>
                      <Text style={textStyles.caption}>{criterion}</Text>
                      <Text style={[textStyles.bodyStrong, tone !== 'neutral' && { color: toneText[tone] }]}>{v}</Text>
                      {r.notes[i] ? <Text style={s.critNote}>{r.notes[i]}</Text> : null}
                    </View>
                  );
                })}
              </View>
            ) : <StatusPill label="Não realizado" />}
          </Card>
        ))}
        <SectionHeader title="Observações" />
        <Text style={textStyles.body}>{detailAudit.observations || detailAudit.generalNotes || 'Nenhuma observação registrada.'}</Text>
      </Sheet>
    )}
  </SafeAreaView>;
}

/* ---------- Peças específicas da tela ---------- */
const STATUS_META = {
  C: { label: 'Conforme', tone: 'success' as Tone, icon: CheckCircleIcon },
  OB: { label: 'Com observações', tone: 'warning' as Tone, icon: WarningCircleIcon },
  NC: { label: 'Não conforme', tone: 'danger' as Tone, icon: XCircleIcon },
};
const codeTone = (v: string): Tone => v === 'C' ? 'success' : v === 'OB' ? 'warning' : v === 'NC' ? 'danger' : 'neutral';

function AuditStatusPill({ audit }: { audit: Audit }) {
  const m = STATUS_META[auditStatus(audit) as keyof typeof STATUS_META];
  return <StatusPill label={m.label} tone={m.tone} icon={m.icon} />;
}

function AuditRow({ audit, onPress, divided = false, card = false }: { audit: Audit; onPress: () => void; divided?: boolean; card?: boolean }) {
  const { colors } = useContext(ThemeContext);
  const s = useMemo(() => createScreenStyles(colors), [colors]);
  const done = audit.results.filter(r => r.done).length;
  return (
    <ListRow
      style={[divided && s.divided, card && s.rowCard]}
      icon={ClipboardTextIcon}
      tint="slate"
      title={`${audit.branchName} #${audit.branchCode}`}
      subtitle={`${dateLabel(audit.date)} · ${done}/${audit.results.length} bicos${audit.auditor ? `, ${audit.auditor}` : ''}`}
      right={<AuditStatusPill audit={audit} />}
      chevron={false}
      onPress={onPress}
    />
  );
}

function CodeTile({ code }: { code: string }) {
  const { colors, mode } = useContext(ThemeContext);
  const s = useMemo(() => createScreenStyles(colors), [colors]);
  return <View style={[s.codeTile, { backgroundColor: mode === 'dark' ? colors.surfaceMuted : tint.sky.bg }]}><Text style={[s.codeText, { color: mode === 'dark' ? colors.text : tint.sky.fg }]} numberOfLines={1}>{code || '-'}</Text></View>;
}

function LoadingScreen() {
  const { colors } = useContext(ThemeContext);
  const s = useMemo(() => createScreenStyles(colors), [colors]);
  return (
    <SafeAreaView style={s.safe}>
      <View style={[s.content, s.stack]}>
        <Skeleton height={28} width="45%" />
        <Skeleton height={76} />
        <View style={s.twoCol}><Skeleton height={104} style={s.flex} /><Skeleton height={104} style={s.flex} /></View>
        <View style={s.twoCol}><Skeleton height={104} style={s.flex} /><Skeleton height={104} style={s.flex} /></View>
        <Skeleton height={180} />
      </View>
    </SafeAreaView>
  );
}

const createScreenStyles = (colors: ThemeColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  stack: { gap: space.md },
  rowCenter: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  twoCol: { flexDirection: 'row', gap: space.md },
  group: { gap: space.sm },
  alignStart: { alignSelf: 'flex-start', marginLeft: -space.sm },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },

  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  brandMark: { width: 34, height: 34, borderRadius: radius.tile, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  brandName: { fontSize: 15.5, fontWeight: '800', color: colors.text, letterSpacing: -0.2 },
  brandSub: { fontSize: 12, color: colors.textMuted },
  banner: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, paddingVertical: 10, backgroundColor: colors.warningSoft },
  bannerText: { flex: 1, fontSize: 12.5, color: colors.warning },

  content: { padding: space.lg, paddingBottom: space.xxl * 2, width: '100%', maxWidth: 720, alignSelf: 'center' },
  pageHead: { flexDirection: 'row', alignItems: 'flex-end', gap: space.md, marginBottom: space.xs },

  cta: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  listCard: { padding: space.xs, gap: 0 },
  divided: { borderTopWidth: 1, borderTopColor: colors.border, borderRadius: 0 },
  rowCard: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.card, paddingVertical: 14 },
  cardHead: { paddingHorizontal: space.md, paddingTop: space.md, paddingBottom: space.sm },
  padRow: { padding: space.md },
  mutedCard: { backgroundColor: colors.surfaceMuted, shadowOpacity: 0, elevation: 0, gap: space.sm },

  pump: { gap: 2, paddingTop: space.md, borderTopWidth: 1, borderTopColor: colors.border },
  nozzle: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingLeft: 26 },
  codeTile: { minWidth: 40, height: 40, paddingHorizontal: 6, borderRadius: radius.tile, alignItems: 'center', justifyContent: 'center' },
  codeText: { fontSize: 14, fontWeight: '800', fontVariant: ['tabular-nums'] },

  note: { padding: space.md, borderRadius: radius.control, backgroundColor: colors.accentSoft },
  noteText: { fontSize: 13, lineHeight: 19, color: colors.accentText },
  criterion: { gap: space.sm, padding: space.md },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  stepBtn: { width: 46, height: 46, borderRadius: radius.control, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  stepBtnPressed: { backgroundColor: colors.neutralSoft, transform: [{ scale: 0.96 }] },
  timer: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.sm, paddingLeft: space.md, borderRadius: radius.control, backgroundColor: colors.surfaceMuted },
  timerText: { flex: 1, fontSize: 18, fontWeight: '800', color: colors.text, fontVariant: ['tabular-nums'] },

  metaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  metaCell: { flexGrow: 1, flexBasis: '45%', padding: space.md, gap: 2, borderRadius: radius.control, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  critGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: space.sm },
  critCell: { flexBasis: '33.33%', paddingRight: space.sm, gap: 1 },
  critNote: { fontSize: 12, color: colors.danger },

  nav: { flexDirection: 'row', backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 6 },
  navItem: { flex: 1, alignItems: 'center', gap: 2 },
  navIcon: { width: 52, height: 30, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  navIconActive: { backgroundColor: colors.accentSoft },
  navLabel: { fontSize: 11.5, fontWeight: '600', color: colors.textFaint },
  navLabelActive: { color: colors.accentText, fontWeight: '700' },
});

