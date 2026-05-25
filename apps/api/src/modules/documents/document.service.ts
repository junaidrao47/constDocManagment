import { canMutateDocumentStatus, DocumentStatus } from "./document-status";

export const documentService = {
  canMutateDocumentStatus,
  getNextStatuses: (status: DocumentStatus) => status,
};
