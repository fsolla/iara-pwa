/**
 * Shared CLI skeleton for scripts/*.mjs — portado do teqo, enxuto para a Iara
 * (sem helpers de banco/download). `die` é o mínimo que os agent scripts usam.
 */

/** Labelled `die` factory: `dieWithLabel('worktree')` → the script's `die`. */
export const dieWithLabel = (label) => (message) => {
  console.error(`\n[${label}] ${message}\n`)
  process.exit(1)
}
