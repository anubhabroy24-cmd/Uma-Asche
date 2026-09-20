// Web Audio API Ringtone Synthesizer (Works 100% offline on Android & Desktop)
let audioCtx = null;
let ringInterval = null;
let vibrateInterval = null;
let isRinging = false;

// Pre-unlock AudioContext on user interaction
function unlockAudio() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      if (!audioCtx || audioCtx.state === 'closed') {
        audioCtx = new AudioContextClass();
      }
      if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
      }
    }
  } catch (_) {}
}

if (typeof window !== 'undefined') {
  window.addEventListener('click', unlockAudio, { passive: true });
  window.addEventListener('touchstart', unlockAudio, { passive: true });
  window.addEventListener('keydown', unlockAudio, { passive: true });
}

function playRingTone() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    if (!audioCtx || audioCtx.state === 'closed') {
      audioCtx = new AudioContextClass();
    }

    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }

    const ctx = audioCtx;
    const now = ctx.currentTime;

    // Helper to produce clean, loud, melodic dual-tone sine wave chimes
    const playChime = (freq1, freq2, startTime, duration) => {
      try {
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        osc1.type = 'sine';
        osc2.type = 'sine';
        osc1.frequency.setValueAtTime(freq1, startTime);
        osc2.frequency.setValueAtTime(freq2, startTime);

        gain.gain.setValueAtTime(0.001, startTime);
        gain.gain.linearRampToValueAtTime(0.75, startTime + 0.04);
        gain.gain.setValueAtTime(0.75, startTime + duration - 0.05);
        gain.gain.linearRampToValueAtTime(0.001, startTime + duration);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);

        osc1.start(startTime);
        osc2.start(startTime);
        osc1.stop(startTime + duration);
        osc2.stop(startTime + duration);
      } catch (_) {}
    };

    // Upbeat melodic ringing pattern (440Hz + 480Hz followed by 523Hz + 587Hz)
    playChime(440, 480, now, 0.45);
    playChime(523.25, 587.33, now + 0.52, 0.55);
  } catch (e) {
    console.warn('[RingtoneService] Ringtone error:', e);
  }
}

export function startRingtone() {
  if (isRinging) return;
  isRinging = true;

  unlockAudio();
  playRingTone();

  ringInterval = setInterval(() => {
    if (isRinging) {
      playRingTone();
    }
  }, 1800);

  // Vibrate mobile phone continuously in a realistic ring pattern
  const triggerVibration = () => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate([600, 300, 600, 300, 900]);
      } catch (_) {}
    }
  };

  triggerVibration();
  vibrateInterval = setInterval(() => {
    if (isRinging) {
      triggerVibration();
    }
  }, 2700);
}

export function stopRingtone() {
  isRinging = false;
  if (ringInterval) {
    clearInterval(ringInterval);
    ringInterval = null;
  }
  if (vibrateInterval) {
    clearInterval(vibrateInterval);
    vibrateInterval = null;
  }
  if (audioCtx) {
    try {
      audioCtx.close().catch(() => {});
    } catch (_) {}
    audioCtx = null;
  }
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    try {
      navigator.vibrate(0);
    } catch (_) {}
  }
}

