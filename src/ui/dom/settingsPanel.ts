import type { AudioManager } from '../../audio/audioManager';
import type { SettingsStore } from '../settings';

/**
 * The settings sheet: four toggles and a close button. Pure presentation —
 * audio prefs live in AudioManager, device prefs in SettingsStore, and this
 * panel just renders their state and reports taps.
 *
 * A modal sheet rather than a screen, because four switches do not deserve a
 * navigation level. Opened from map select; in-run the mute button already
 * covers the one setting a player changes mid-fight.
 */
export class SettingsPanel {
  private readonly root: HTMLDivElement;
  private readonly sheet: HTMLDivElement;

  constructor(
    layer: HTMLElement,
    private readonly audio: AudioManager,
    private readonly store: SettingsStore,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'settings-veil';
    this.root.style.display = 'none';
    this.root.addEventListener('click', (ev) => {
      if (ev.target === this.root) this.hide();
    });

    this.sheet = document.createElement('div');
    this.sheet.className = 'settings-sheet';
    this.sheet.setAttribute('data-ui', '');
    this.root.append(this.sheet);
    layer.append(this.root);
  }

  show(): void {
    this.render();
    this.root.style.display = '';
  }

  hide(): void {
    this.root.style.display = 'none';
  }

  private render(): void {
    this.sheet.replaceChildren();

    const title = document.createElement('div');
    title.className = 'settings-title';
    title.textContent = 'Settings';
    this.sheet.append(title);

    const audioPrefs = this.audio.preferences;
    const device = this.store.settings;

    this.row('Sound effects', audioPrefs.sfx, (on) => {
      // Toggling sound *is* a user gesture — the one moment the context is
      // allowed to start, so take it.
      this.audio.unlock();
      this.audio.setPref('sfx', on);
      if (on) this.audio.play('upgrade');
    });
    this.row('Music', audioPrefs.music, (on) => {
      this.audio.unlock();
      this.audio.setPref('music', on);
    });
    const canBuzz = typeof navigator.vibrate === 'function';
    this.row(
      'Haptics',
      device.haptics,
      (on) => {
        this.store.set('haptics', on);
        if (on) this.store.buzz(25);
      },
      canBuzz ? undefined : 'not supported on this device',
    );
    this.row(
      'Left-hand mode',
      device.leftHand,
      (on) => this.store.set('leftHand', on),
      'moves the side buttons to the left edge',
    );

    const done = document.createElement('button');
    done.className = 'settings-done';
    done.setAttribute('data-ui', '');
    done.textContent = 'Done';
    done.addEventListener('click', () => this.hide());
    this.sheet.append(done);
  }

  private row(label: string, on: boolean, onToggle: (on: boolean) => void, note?: string): void {
    const row = document.createElement('button');
    row.className = 'settings-row';
    row.setAttribute('data-ui', '');
    row.setAttribute('role', 'switch');
    row.setAttribute('aria-checked', String(on));

    const text = document.createElement('div');
    text.className = 'settings-label';
    text.textContent = label;
    if (note) {
      const sub = document.createElement('div');
      sub.className = 'settings-note';
      sub.textContent = note;
      text.append(sub);
    }

    const knob = document.createElement('div');
    knob.className = 'settings-switch' + (on ? ' on' : '');

    row.append(text, knob);
    row.addEventListener('click', () => {
      const next = row.getAttribute('aria-checked') !== 'true';
      row.setAttribute('aria-checked', String(next));
      knob.classList.toggle('on', next);
      onToggle(next);
    });
    this.sheet.append(row);
  }

  static css(): string {
    return `
.settings-veil {
  position: fixed; inset: 0; pointer-events: auto;
  display: flex; align-items: center; justify-content: center;
  background: rgba(8,14,10,.72); z-index: 30;
}
.settings-sheet {
  width: min(340px, 88vw); padding: 22px 20px;
  border-radius: 18px; border: 1px solid rgba(255,255,255,.14);
  background: rgba(22,32,26,.97); box-shadow: 0 12px 40px rgba(0,0,0,.5);
}
.settings-title { font: 700 22px Georgia, serif; color: #f2ecdd; margin-bottom: 14px; text-align: center; }
.settings-row {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  width: 100%; padding: 12px 4px; border: 0; border-bottom: 1px solid rgba(255,255,255,.08);
  background: none; text-align: left;
}
.settings-label { font: 600 15px system-ui, sans-serif; color: #f2ecdd; }
.settings-note { font: 400 11px system-ui, sans-serif; color: #9aa595; margin-top: 2px; }
.settings-switch {
  flex: none; width: 44px; height: 26px; border-radius: 999px;
  background: rgba(255,255,255,.16); position: relative; transition: background .15s;
}
.settings-switch::after {
  content: ''; position: absolute; top: 3px; left: 3px; width: 20px; height: 20px;
  border-radius: 50%; background: #f2ecdd; transition: transform .15s;
}
.settings-switch.on { background: #4f9d7c; }
.settings-switch.on::after { transform: translateX(18px); }
.settings-done {
  display: block; margin: 18px auto 0; padding: 10px 30px;
  border-radius: 12px; border: 0; background: rgba(46,120,120,.88);
  color: #f2ecdd; font: 700 15px ui-monospace, monospace;
}`;
  }
}
