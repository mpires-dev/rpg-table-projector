const STORAGE_KEY = 'rpg-ar:roster:v1';

export const FACTIONS = {
  hero: { label: 'Herói', ring: '#7ef0b0' },
  enemy: { label: 'Inimigo', ring: '#ff5c5c' },
  neutral: { label: 'Neutro', ring: '#c9d1e4' },
};

const DEFAULT_ROSTER = [
  { id: 0, name: 'Elara', role: 'Maga', faction: 'hero', color: '#6ea8ff' },
  { id: 1, name: 'Brann', role: 'Guerreiro', faction: 'hero', color: '#ffc857' },
  { id: 2, name: 'Sylas', role: 'Ladino', faction: 'hero', color: '#7ef0b0' },
  { id: 3, name: 'Mira', role: 'Clériga', faction: 'hero', color: '#d69cff' },
  { id: 4, name: 'Orc Bruto', role: 'Capanga', faction: 'enemy', color: '#ff5c5c' },
  { id: 5, name: 'Necromante', role: 'Chefe', faction: 'enemy', color: '#ff8a3d' },
];

const FALLBACK_COLORS = ['#6ea8ff', '#ffc857', '#7ef0b0', '#d69cff', '#ff5c5c', '#ff8a3d', '#4dd6d0', '#f56dbc'];

export class Roster {
  constructor() {
    this.entries = new Map();
    this.load();
  }

  load() {
    let source = DEFAULT_ROSTER;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) source = parsed;
      }
    } catch {
      // localStorage bloqueado (modo privado, etc): segue com o padrão
    }
    this.entries = new Map(source.map((entry) => [Number(entry.id), { ...entry, id: Number(entry.id) }]));
  }

  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.list()));
    } catch {
      // sem persistência, mas o app continua funcionando na sessão
    }
  }

  list() {
    return [...this.entries.values()].sort((a, b) => a.id - b.id);
  }

  /** Todo ID detectado vira alguém, mesmo sem cadastro — nunca some da tela. */
  get(id) {
    return (
      this.entries.get(id) || {
        id,
        name: `Peça ${id}`,
        role: 'Sem cadastro',
        faction: 'neutral',
        color: FALLBACK_COLORS[id % FALLBACK_COLORS.length],
        unregistered: true,
      }
    );
  }

  upsert(entry) {
    const id = Number(entry.id);
    if (!Number.isInteger(id) || id < 0) return;
    this.entries.set(id, { ...this.get(id), ...entry, id, unregistered: false });
    this.save();
  }

  remove(id) {
    this.entries.delete(Number(id));
    this.save();
  }

  resetToDefault() {
    this.entries = new Map(DEFAULT_ROSTER.map((e) => [e.id, { ...e }]));
    this.save();
  }
}
