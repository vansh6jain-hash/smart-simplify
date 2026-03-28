let lastApiCallTime = 0;

export const waitIfNeeded = async (
  setCountdown?: (n: number) => void
): Promise<void> => {
  const elapsed = Date.now() - lastApiCallTime;
  const minGap = 13000;
  if (elapsed < minGap && lastApiCallTime !== 0) {
    let remaining = Math.ceil((minGap - elapsed) / 1000);
    while (remaining > 0) {
      if (setCountdown) setCountdown(remaining);
      await new Promise(r => setTimeout(r, 1000));
      remaining--;
    }
    if (setCountdown) setCountdown(0);
  }
  lastApiCallTime = Date.now();
};

export const markApiCall = () => {
  lastApiCallTime = Date.now();
};
