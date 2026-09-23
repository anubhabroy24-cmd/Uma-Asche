// Dual-Engine Ringtone Synthesizer (Works 100% offline on Android APK, WebView & Desktop)
let audioCtx = null;
let ringInterval = null;
let vibrateInterval = null;
let isRinging = false;
let ringAudioElement = null;

/**
 * Generate a standalone, pristine 16-bit PCM WAV ringtone blob in memory
 */
function generateRingtoneWavBlob() {
  const sampleRate = 8000;
  const duration = 3.0; // 3 seconds loop
  const totalSamples = Math.floor(sampleRate * duration);
  const buffer = new ArrayBuffer(44 + totalSamples * 2);
  const view = new DataView(buffer);

  const writeString = (offset, str) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  // RIFF header
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + totalSamples * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, totalSamples * 2, true);

  // Cadence: (0.0s-0.75s ring) -> (0.25s silence) -> (1.0s-1.75s ring) -> (1.25s silence)
  let offset = 44;
  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    let sample = 0;
    let envelope = 0;

    if (t >= 0.0 && t <= 0.75) {
      const dt = t;
      if (dt < 0.05) envelope = dt / 0.05;
      else if (dt > 0.70) envelope = (0.75 - dt) / 0.05;
      else envelope = 1;
      sample = (Math.sin(2 * Math.PI * 440 * t) + Math.sin(2 * Math.PI * 480 * t)) * 0.45 * envelope;
    } else if (t >= 1.0 && t <= 1.75) {
      const dt = t - 1.0;
      if (dt < 0.05) envelope = dt / 0.05;
      else if (dt > 0.70) envelope = (0.75 - dt) / 0.05;
      else envelope = 1;
      sample = (Math.sin(2 * Math.PI * 440 * t) + Math.sin(2 * Math.PI * 480 * t)) * 0.45 * envelope;
    }

    const s = Math.max(-1, Math.min(1, sample));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

function getRingAudioElement() {
  if (typeof window === 'undefined') return null;
  if (!ringAudioElement) {
    try {
      const blob = generateRingtoneWavBlob();
      const url = URL.createObjectURL(blob);
      ringAudioElement = new Audio(url);
      ringAudioElement.loop = true;
      ringAudioElement.volume = 1.0;
    } catch (e) {
      console.warn('[RingtoneService] Audio element warning:', e);
    }
  }
  return ringAudioElement;
}

// Pre-unlock AudioContext and Audio Element on any user interaction
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
    const el = getRingAudioElement();
    if (el) {
      el.load();
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

    const doPlay = () => {
      try {
        const ctx = audioCtx;
        if (!ctx || ctx.state === 'closed') return;
        const now = ctx.currentTime;

        // Play standard dual-tone loud telephone ring bursts
        const playTone = (freq1, freq2, startTime, duration) => {
          try {
            const osc1 = ctx.createOscillator();
            const osc2 = ctx.createOscillator();
            const gain = ctx.createGain();

            osc1.type = 'sine';
            osc2.type = 'sine';
            osc1.frequency.setValueAtTime(freq1, startTime);
            osc2.frequency.setValueAtTime(freq2, startTime);

            gain.gain.setValueAtTime(0.0001, startTime);
            gain.gain.linearRampToValueAtTime(0.85, startTime + 0.04);
            gain.gain.setValueAtTime(0.85, startTime + duration - 0.05);
            gain.gain.linearRampToValueAtTime(0.0001, startTime + duration);

            osc1.connect(gain);
            osc2.connect(gain);
            gain.connect(ctx.destination);

            osc1.start(startTime);
            osc2.start(startTime);
            osc1.stop(startTime + duration);
            osc2.stop(startTime + duration);
          } catch (_) {}
        };

        // Realistic telephone ring: ring-ring pattern (440Hz + 480Hz) followed by melodic chime
        playTone(440, 480, now, 0.42);
        playTone(440, 480, now + 0.52, 0.42);
        playTone(523.25, 659.25, now + 1.05, 0.48);
      } catch (err) {
        console.warn('[RingtoneService] Play error:', err);
      }
    };

    if (audioCtx.state === 'suspended') {
      audioCtx.resume().then(doPlay).catch(() => {
        doPlay();
      });
    } else {
      doPlay();
    }
  } catch (e) {
    console.warn('[RingtoneService] Ringtone error:', e);
  }
}

export function startRingtone() {
  if (isRinging) return;
  isRinging = true;

  // 1. Play looping HTML5 Audio element for maximum volume and device compatibility
  try {
    const el = getRingAudioElement();
    if (el) {
      el.currentTime = 0;
      el.play().catch((err) => {
        console.warn('[RingtoneService] Audio element play warning:', err);
      });
    }
  } catch (_) {}

  // 2. Play Web Audio API synthesized tones in tandem
  unlockAudio();
  playRingTone();

  ringInterval = setInterval(() => {
    if (isRinging) {
      playRingTone();
    }
  }, 2200);

  // 3. Vibrate mobile phone continuously in a realistic incoming call pattern
  const triggerVibration = () => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate([1000, 500, 1000, 500, 1500]);
      } catch (_) {}
    }
  };

  triggerVibration();
  vibrateInterval = setInterval(() => {
    if (isRinging) {
      triggerVibration();
    }
  }, 4500);
}

export function stopRingtone() {
  isRinging = false;

  // Stop HTML5 Audio
  if (ringAudioElement) {
    try {
      ringAudioElement.pause();
      ringAudioElement.currentTime = 0;
    } catch (_) {}
  }

  // Clear intervals
  if (ringInterval) {
    clearInterval(ringInterval);
    ringInterval = null;
  }
  if (vibrateInterval) {
    clearInterval(vibrateInterval);
    vibrateInterval = null;
  }

  // Close Web Audio
  if (audioCtx) {
    try {
      audioCtx.close().catch(() => {});
    } catch (_) {}
    audioCtx = null;
  }

  // Stop vibration
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    try {
      navigator.vibrate(0);
    } catch (_) {}
  }
}

