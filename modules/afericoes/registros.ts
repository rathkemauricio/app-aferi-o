import { Collection, type SyncRow } from '../../lib/sync';
import type { AuditRelatorio } from './relatorio';

/** Aferição registrada (tabela service_records, payload.kind = 'audit'). branchId = id da filial no cadastro único. */
export type AfericaoRegistrada = AuditRelatorio & { id: string; branchId: string };
export type AfericaoRow = SyncRow & { branch: string; service_date: string; status: string; payload: { kind: 'audit'; value: AfericaoRegistrada } };

/** Aferições sincronizadas: usadas pelo módulo Aferições e pela Agenda (realizado no dia). */
export const afericoesCol = new Collection<AfericaoRow>({ table: 'service_records', storageKey: 'nevoeiro.afericoes.audits.v2', softDelete: false, filter: q => q.eq('payload->>kind', 'audit') });
