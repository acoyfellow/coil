const UPDATE_CHECK_MS = 5 * 60_000;

const composerIsEmpty = () => {
  const field = document.querySelector<HTMLTextAreaElement>('#text');

  return field === null || field.value.trim() === '';
};

export const reloadWhenSafe = (reload: () => void, safe: () => boolean = composerIsEmpty) => {
  if (safe() || document.visibilityState === 'hidden') {
    reload();
    return;
  }

  const onHidden = () => {
    if (document.visibilityState !== 'hidden') return;
    document.removeEventListener('visibilitychange', onHidden);
    reload();
  };

  document.addEventListener('visibilitychange', onHidden);
};

export const keepShellCurrent = (workers: ServiceWorkerContainer) => {
  const hadController = workers.controller !== null;
  let reloading = false;

  workers.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    reloadWhenSafe(() => globalThis.location.reload());
  });

  workers
    .register('/sw.js', { scope: '/', updateViaCache: 'none' })
    .then((registration) => {
      const check = () => registration.update().catch(() => undefined);

      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void check();
      });
      globalThis.addEventListener('focus', () => void check());
      globalThis.addEventListener('online', () => void check());
      setInterval(() => void check(), UPDATE_CHECK_MS);
    })
    .catch(() => undefined);
};
