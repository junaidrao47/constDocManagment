/**
 * Whether a customer is entitled to upload documents for a given service/package.
 *
 * Deliberately returns `true` for now (PROJECT-BRIEF §10.4): the rule — "only after
 * buying/accepting a package or quotation" — is expected to be tightened after the
 * client's first-delivery feedback. Keeping it behind this single function means that
 * tightening happens in exactly one place, and every upload path already calls it.
 */
export function canUploadDocuments(_customerId: string, _serviceOrPackageId?: string | null): boolean {
  return true;
}
