import { Component, OnDestroy, OnInit, computed, effect, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

export interface Player {
  name: string;
  color: string;
}

export interface WheelField {
  emoji: string;
  label: string;
  description: string;
}

interface Segment {
  field: WheelField;
  color: string;
  path: string;
  textRotate: number;
  short: string;
}

const COLORS = ['#ff4f8b', '#ffc93c', '#8b5cf6', '#1fc6a5', '#ff7a2f', '#3bb4ff', '#d946ef', '#8be04e'];
const AUTO_SPIN_SECONDS = 1 * 60; // TEST: sett tilbake til 5 * 60
// wheel_spin.mp3 is 2.424 s – the wheel spins exactly as long as two plays of it.
const SPIN_MS = 2 * 2424;
const STORAGE_KEY = 'drikkespill-v1';

const DEFAULT_FIELDS: WheelField[] = [
  { emoji: '🧦', label: 'Kortsokker', description: 'alle som har på kortsokker drikker 7 slurker.' },
  { emoji: '🍻', label: 'Gutta drikker', description: 'Alle gutta tar en skikkelig slurk!' },
  { emoji: '💃', label: 'Jentene drikker', description: 'Alle jentene tar en skikkelig slurk!' },
  { emoji: '😎', label: 'Fri runde', description: '{spiller} slipper unna denne gangen. Len deg tilbake.' },
  { emoji: '🍺', label: 'Drikk 2 slurker', description: '{spiller} drikker 2 slurker.' },
  { emoji: '🎁', label: 'Gi bort 3 slurker', description: '{spiller} deler ut 3 slurker – til én person eller fordelt.' },
  { emoji: '🥂', label: 'Alle drikker!', description: 'Skål! Alle drikker.' },
  { emoji: '🌊', label: 'Waterfall', description: '{spiller} begynner å drikke, så alle andre etter tur. Du kan ikke stoppe før personen før deg stopper.' },
  { emoji: '📚', label: 'Fisk!', description: 'Førstemann som får fisken til å synge får dele ut 10 slurker!' },
  { emoji: '🙊', label: 'Jeg har aldri...', description: '{spiller} sier «Jeg har aldri ...». Alle som har gjort det, drikker.' },
  { emoji: '📜', label: 'Regelmaker', description: '{spiller} lager en ny regel som gjelder resten av kvelden. Bryter du den, drikker du.' },
  { emoji: '👍', label: 'Tommelmester', description: '{spiller} kan når som helst legge tommelen på bordet. Den siste som følger etter, drikker.' },
  { emoji: '😇', label: 'Nødt eller sannhet', description: '{spiller} velger nødt eller sannhet. Nekter du – drikk 3 slurker.' },
  { emoji: '🤝', label: 'Skål med naboen', description: '{spiller} og naboene på hver side skåler og drikker.' },
  { emoji: '👉', label: 'Mest sannsynlig', description: '{spiller} spør «Hvem er mest sannsynlig til å ...». På tre peker alle – den med flest fingre drikker.' },
  { emoji: '🔥', label: 'Drikk 4 slurker', description: 'Auda! {spiller} drikker 4 slurker.' },
  { emoji: '👯', label: 'Drikkevenn', description: '{spiller} velger en drikkevenn. Hver gang én av dere drikker, drikker den andre også.' },
  { emoji: '🙋', label: 'Spørsmålsmester', description: 'Den som svarer på et spørsmål fra {spiller} drikker – helt til neste spørsmålsmester.' },
  { emoji: '🎤', label: 'Sang', description: '{spiller} queuer sin guilty pleasure sang og synger med!.' },
  { emoji: '🥂', label: 'Hydration break', description: 'Alle drikker 5 slurker!' },


];

@Component({
  selector: 'app-root',
  imports: [FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit, OnDestroy {
  readonly tab = signal<'players' | 'fields'>('players');

  readonly players = signal<Player[]>([]);
  readonly fields = signal<WheelField[]>(DEFAULT_FIELDS);
  readonly turnIndex = signal(0);

  readonly rotation = signal(0);
  readonly spinning = signal(false);
  readonly result = signal<{ field: WheelField; player: Player | null; text: string; sike?: boolean } | null>(null);

  readonly autoSpin = signal(true);
  readonly secondsLeft = signal(AUTO_SPIN_SECONDS);

  newPlayer = '';
  newEmoji = '';
  newLabel = '';
  newDescription = '';

  private timer?: ReturnType<typeof setInterval>;
  private audio = new Audio('party.mp3');
  private warningAudio = new Audio('warning.mp3');
  private wheelAudio = new Audio('wheel_spin.mp3');
  private audioUnlocked = false;
  readonly warning = signal(false);

  readonly currentPlayer = computed(() => {
    const p = this.players();
    return p.length ? p[this.turnIndex() % p.length] : null;
  });

  readonly countdown = computed(() => {
    const s = this.secondsLeft();
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  });

  readonly segments = computed<Segment[]>(() => {
    const f = this.fields();
    const n = f.length;
    const step = 360 / n;
    const r = 200;
    return f.map((field, i) => {
      const a0 = ((i * step - 90) * Math.PI) / 180;
      const a1 = (((i + 1) * step - 90) * Math.PI) / 180;
      const large = step > 180 ? 1 : 0;
      const path =
        n === 1
          ? `M 0 -${r} A ${r} ${r} 0 1 1 -0.01 -${r} Z`
          : `M 0 0 L ${r * Math.cos(a0)} ${r * Math.sin(a0)} A ${r} ${r} 0 ${large} 1 ${r * Math.cos(a1)} ${r * Math.sin(a1)} Z`;
      // Avoid two neighbouring segments with same colour when wrapping around
      let color = COLORS[i % COLORS.length];
      if (i === n - 1 && n > 1 && color === COLORS[0]) color = COLORS[3];
      const short = field.label.length > 15 ? field.label.slice(0, 14) + '…' : field.label;
      return { field, color, path, textRotate: i * step + step / 2 - 90, short };
    });
  });

  readonly wheelFontSize = computed(() => {
    const n = this.fields().length;
    return n > 20 ? 11 : n > 14 ? 14 : 16;
  });

  constructor() {
    this.load();
    effect(() => {
      const data = { players: this.players(), fields: this.fields(), autoSpin: this.autoSpin() };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      } catch {}
    });
  }

  ngOnInit(): void {
    this.timer = setInterval(() => this.tick(), 1000);
  }

  ngOnDestroy(): void {
    clearInterval(this.timer);
  }

  private load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (Array.isArray(data.players)) this.players.set(data.players);
      if (Array.isArray(data.fields) && data.fields.length) this.fields.set(data.fields);
      if (typeof data.autoSpin === 'boolean') this.autoSpin.set(data.autoSpin);
    } catch {}
  }

  private tick(): void {
    if (!this.autoSpin()) return;
    const next = this.secondsLeft() - 1;
    if (next <= 0) {
      this.secondsLeft.set(AUTO_SPIN_SECONDS);
      this.result.set(null);
      this.spin();
    } else {
      this.secondsLeft.set(next);
    }
  }

  toggleAutoSpin(): void {
    this.autoSpin.update((v) => !v);
    this.secondsLeft.set(AUTO_SPIN_SECONDS);
  }

  /** Browsers block audio until the user has interacted with the page once. */
  unlockAudio(): void {
    if (this.audioUnlocked) return;
    this.audioUnlocked = true;
    this.wheelAudio.loop = true;
    for (const a of [this.audio, this.warningAudio, this.wheelAudio]) {
      a.muted = true;
      a.play()
        .then(() => {
          a.pause();
          a.currentTime = 0;
          a.muted = false;
        })
        .catch(() => {
          a.muted = false;
          this.audioUnlocked = false;
        });
    }
  }

  /** Plays the warning sound and resolves when it has finished (or failed). */
  private playWarning(): Promise<void> {
    return new Promise((resolve) => {
      const a = this.warningAudio;
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(fallback);
        a.removeEventListener('ended', finish);
        resolve();
      };
      const fallback = setTimeout(finish, 2500);
      a.addEventListener('ended', finish);
      a.currentTime = 0;
      a.play().catch(finish);
    });
  }

  spin(): void {
    if (this.spinning() || this.fields().length === 0) return;
    this.result.set(null);
    this.spinning.set(true);
    this.warning.set(true);
    this.playWarning().then(() => {
      this.warning.set(false);
      this.rotate();
    });
  }

  private rotate(): void {
    this.wheelAudio.loop = true;
    this.wheelAudio.currentTime = 0;
    this.wheelAudio.play().catch(() => {});

    const n = this.fields().length;
    const step = 360 / n;
    const target = Math.floor(Math.random() * n);
    const jitter = (Math.random() - 0.5) * step * 0.7;
    // Segment centre must end up at the top pointer (0deg).
    const desired = (((-(target * step + step / 2) + jitter) % 360) + 360) % 360;
    const current = ((this.rotation() % 360) + 360) % 360;
    const delta = ((desired - current + 360) % 360) + 360 * (5 + Math.floor(Math.random() * 3));
    this.rotation.update((r) => r + delta);

    setTimeout(() => this.finishSpin(target), SPIN_MS);
  }

  private finishSpin(index: number): void {
    const field = this.fields()[index];
    const player = this.currentPlayer();
    const name = player?.name ?? 'Du';
    const first = { field, player, text: (field.description || field.label).replaceAll('{spiller}', name) };
    this.result.set(first);
    // "Fri runde" is a trap: shortly after, it flips to "Sike!"
    if (field.label.trim().toLowerCase() === 'fri runde') {
      setTimeout(() => {
        if (this.result() !== first) return;
        this.result.set({
          field: { emoji: '😈', label: 'Sike!', description: '' },
          player,
          text: `${name} tar 6 slurker!`,
          sike: true,
        });
      }, 1800);
    }
    this.spinning.set(false);
    this.wheelAudio.pause();
    this.wheelAudio.currentTime = 0;
    if (this.players().length) this.turnIndex.update((i) => (i + 1) % this.players().length);

    this.audio.currentTime = 0;
    this.audio.play().catch(() => {});
  }

  closeResult(): void {
    this.result.set(null);
  }

  addPlayer(): void {
    const name = this.newPlayer.trim();
    if (!name) return;
    const used = this.players().length;
    this.players.update((p) => [...p, { name, color: COLORS[used % COLORS.length] }]);
    this.newPlayer = '';
  }

  removePlayer(i: number): void {
    this.players.update((p) => p.filter((_, idx) => idx !== i));
    const len = this.players().length;
    this.turnIndex.update((t) => (len === 0 ? 0 : t > i ? t - 1 : t % len));
  }

  addField(): void {
    const label = this.newLabel.trim();
    if (!label) return;
    this.fields.update((f) => [
      ...f,
      { emoji: this.newEmoji.trim() || '🎉', label, description: this.newDescription.trim() },
    ]);
    this.newEmoji = this.newLabel = this.newDescription = '';
  }

  removeField(i: number): void {
    if (this.fields().length <= 2) return;
    this.fields.update((f) => f.filter((_, idx) => idx !== i));
  }

  resetFields(): void {
    this.fields.set(DEFAULT_FIELDS);
  }
}
