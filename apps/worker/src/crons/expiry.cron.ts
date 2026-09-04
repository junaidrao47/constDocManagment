// TODO: not implemented. Should move documents to expiring_soon / expired based
// on expires_at, writing a status-history row for each transition.
// Returns true only so the module typechecks; no schedule is registered.
export function runExpiryCron() {
  return true;
}
