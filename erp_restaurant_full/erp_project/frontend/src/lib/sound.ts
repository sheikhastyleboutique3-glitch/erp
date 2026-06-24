/**
 * Notification sound engine.
 *
 * Plays a chime when a new alert / order / requisition arrives. Supports
 * admin-uploaded custom sounds (served from /uploads/sounds/...) and falls back
 * to distinct built-in WebAudio tones per channel when no custom sound is set.
 *
 * Browsers block audio until the user interacts with the page, so call
 * unlockAudio() on the first user gesture (wired up in Layout).
 */

let audioCtx: AudioContext | null = null;
let unlocked = false;

function getCtx(): AudioContext | null {
  try {
    const Ctx = (window.AudioContext || (window as any).webkitAudioContext) as
      | typeof AudioContext
      | undefined;
    if (!Ctx) return null;
    if (!audioCtx) audioCtx = new Ctx();
    if (audioCtx.state === 'suspended') void audioCtx.resume();
    return audioCtx;
  } catch {
    return null;
  }
}

/** Prime the audio context on a real user gesture so later sounds can play. */
export function unlockAudio(): void {
  if (unlocked) return;
  getCtx();
  unlocked = true;
}

// Distinct default chimes per channel so each event is recognisable by ear.
const DEFAULT_TONES: Record<string, number[]> = {
  alerts: [880, 0, 880], // urgent double high beep
  requisitions: [523, 659, 784], // friendly rising triad
  orders: [659, 523], // calm two-tone
  default: [660],
};

function playTone(channel: string, volume: number): void {
  const ctx = getCtx();
  if (!ctx) return;
  const seq = DEFAULT_TONES[channel] || DEFAULT_TONES.default;
  const now = ctx.currentTime;
  const step = 0.16;
  const peak = Math.max(0, Math.min(1, volume)) * 0.25;
  seq.forEach((freq, i) => {
    if (!freq) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const start = now + i * step;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(peak, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + step);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + step);
  });
}

/** Play the sound for a channel: custom uploaded file if set, else built-in tone. */
export function playNotificationSound(opts: {
  channel: string;
  url?: string;
  volume: number; // 0..1
}): void {
  const { channel, url, volume } = opts;
  const vol = Math.max(0, Math.min(1, volume));
  if (url) {
    try {
      const audio = new Audio(url);
      audio.volume = vol;
      audio.play().catch(() => playTone(channel, vol));
      return;
    } catch {
      /* fall through to tone */
    }
  }
  playTone(channel, vol);
}
