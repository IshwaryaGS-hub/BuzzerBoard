let audioContext = null;

function getAudioContext() {
  if (typeof window === "undefined") return null;

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;

  if (!audioContext || audioContext.state === "closed") {
    audioContext = new AudioContextClass();
  }

  return audioContext;
}

export async function playTimesUpAlarm() {
  const context = getAudioContext();
  if (!context) return;

  if (context.state === "suspended") {
    try {
      await context.resume();
    } catch {
      return;
    }
  }

  const pattern = [0, 180, 360];

  pattern.forEach((offset, index) => {
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();
    const startAt = context.currentTime + offset / 1000;
    const duration = 0.14;

    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(index % 2 === 0 ? 880 : 740, startAt);

    gainNode.gain.setValueAtTime(0.0001, startAt);
    gainNode.gain.exponentialRampToValueAtTime(0.18, startAt + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

    oscillator.connect(gainNode);
    gainNode.connect(context.destination);
    oscillator.start(startAt);
    oscillator.stop(startAt + duration);
  });
}
