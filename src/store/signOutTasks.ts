/**
 * Work that must happen while the account is still signed in, just before signing out (e.g. the
 * home widget revoking this phone's key on the server). Features register a task; sign-out runs
 * them all, best-effort and time-boxed, so a slow or failed task never blocks signing out.
 */
type SignOutTask = () => Promise<void>;

const tasks = new Set<SignOutTask>();

/** Register a task; returns a function that unregisters it. */
export function registerSignOutTask(task: SignOutTask): () => void {
  tasks.add(task);
  return () => {
    tasks.delete(task);
  };
}

export async function runSignOutTasks(timeoutMs = 3000): Promise<void> {
  if (tasks.size === 0) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    Promise.allSettled([...tasks].map((task) => task())),
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, timeoutMs);
    }),
  ]);
  if (timer) clearTimeout(timer);
}
