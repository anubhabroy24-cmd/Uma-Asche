// Dedicated Pather Panchali Ringtone Service
let vibrateInterval = null;
let isRinging = false;
let ringAudioElement = null;

function getRingAudioElement() {
  if (typeof window === 'undefined') return null;
  if (!ringAudioElement) {
    try {
      ringAudioElement = new Audio('/pather_panchali.mp3');
      ringAudioElement.loop = true;
      ringAudioElement.volume = 1.0;
    } catch (e) {
      console.warn('[RingtoneService] Audio element warning:', e);
    }
  }
  return ringAudioElement;
}

// Pre-unlock Audio Element on any user interaction so Android WebView allows playback
export function unlockAudio() {
  try {
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

export function startRingtone() {
  if (isRinging) return;
  isRinging = true;

  // 1. Play ONLY the Pather Panchali theme song (no other ringing sounds)
  try {
    const el = getRingAudioElement();
    if (el) {
      el.currentTime = 0;
      el.play().catch((err) => {
        console.warn('[RingtoneService] Audio element play warning:', err);
      });
    }
  } catch (_) {}

  // 2. Vibrate mobile phone in call pattern
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

  // Stop Pather Panchali audio immediately
  if (ringAudioElement) {
    try {
      ringAudioElement.pause();
      ringAudioElement.currentTime = 0;
    } catch (_) {}
  }

  // Clear vibration
  if (vibrateInterval) {
    clearInterval(vibrateInterval);
    vibrateInterval = null;
  }

  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    try {
      navigator.vibrate(0);
    } catch (_) {}
  }
}
