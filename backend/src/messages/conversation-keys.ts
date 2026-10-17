/**
 * Indexation des messages par conversation dans KivaDB.
 *
 * Nouveau format de clé :  msg:<conversation>:<timestamp>_<rand>
 *   - salon  → msg:s.<salonId>:...
 *   - DM     → msg:d.<userA>.<userB>:...   (usernames triés)
 * Un range KivaDB `msg:<conversation>:` → `msg:<conversation>:~` ne lit donc
 * QUE la conversation demandée, au lieu de scanner toute la base.
 *
 * Les anciens messages (msg:<timestamp>_<rand>) restent lus via le range
 * `msg:0` → `msg:9~` pour la rétro-compatibilité.
 */

export function isSalonTarget(target: string): boolean {
  const t = (target || '').toLowerCase();
  return (
    t === 'all' ||
    t === 'general' ||
    t.startsWith('s-') ||
    t.startsWith('c-') ||
    t.startsWith('salon:') ||
    t.startsWith('channel:')
  );
}

export function normalizeSalonTarget(target: string): string {
  return target === 'all' ? 'general' : target;
}

export function conversationKey(from: string, to: string): string {
  if (isSalonTarget(to)) return `s.${normalizeSalonTarget(to)}`;
  const [a, b] = [from, to].sort();
  return `d.${a}.${b}`;
}

export const LEGACY_RANGE = { from: 'msg:0', to: 'msg:9~' };
