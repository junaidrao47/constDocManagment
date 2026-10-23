import {
  assertDocumentStatusTransition,
  canMutateDocumentStatus,
  canRoleTransition,
  DocumentStatus,
  getDocumentStatusContract,
} from "../src/modules/documents/document-status";
import { isAllowedForRequirement, isAllowedUpload, MAX_UPLOAD_BYTES } from "../src/modules/documents/upload-constraints";
import { magicBytesMatch } from "../src/utils/magic-bytes";

/**
 * Pure-logic coverage for the upload pipeline's decision points. These need no
 * database, so they pin the rules the Jest fake DB cannot exercise; the live
 * end-to-end proof is `npm run smoke` against real Postgres.
 */

describe("document state machine, per role", () => {
  it("lets staff drive the review flow, including the government round-trip", () => {
    expect(canRoleTransition("agent", DocumentStatus.Pending, DocumentStatus.UnderReview)).toBe(true);
    expect(canRoleTransition("agent", DocumentStatus.UnderReview, DocumentStatus.Approved)).toBe(true);
    expect(canRoleTransition("agent", DocumentStatus.UnderReview, DocumentStatus.Rejected)).toBe(true);
    expect(canRoleTransition("manager", DocumentStatus.Approved, DocumentStatus.SubmittedToGovernment)).toBe(true);
    expect(canRoleTransition("manager", DocumentStatus.SubmittedToGovernment, DocumentStatus.Approved)).toBe(true);
  });

  it("lets a customer only resubmit after a rejection", () => {
    expect(canRoleTransition("customer", DocumentStatus.Rejected, DocumentStatus.Pending)).toBe(true);
    expect(canRoleTransition("customer", DocumentStatus.Pending, DocumentStatus.UnderReview)).toBe(false);
    expect(canRoleTransition("customer", DocumentStatus.Approved, DocumentStatus.SubmittedToGovernment)).toBe(false);
  });

  it("rejects an illegal transition with a 409 AppError that names the allowed moves", () => {
    expect(() => assertDocumentStatusTransition(DocumentStatus.Pending, DocumentStatus.Approved, "agent")).toThrow(
      /Cannot move a document from pending to approved/,
    );
    expect(() => assertDocumentStatusTransition(DocumentStatus.Pending, DocumentStatus.UnderReview, "agent")).not.toThrow();
  });

  it("recognises only staff roles as status mutators", () => {
    expect(canMutateDocumentStatus("agent")).toBe(true);
    expect(canMutateDocumentStatus("manager")).toBe(true);
    expect(canMutateDocumentStatus("admin")).toBe(true);
    expect(canMutateDocumentStatus("customer")).toBe(false);
  });

  it("exposes a contract that includes the new submitted_to_government status", () => {
    const contract = getDocumentStatusContract();
    expect(contract.statuses.map((s) => s.value)).toContain(DocumentStatus.SubmittedToGovernment);
    expect(contract.transitionsByRole.customer[DocumentStatus.Rejected]).toEqual([DocumentStatus.Pending]);
  });
});

describe("upload allow-list", () => {
  it("accepts a PDF whose extension matches its declared MIME", () => {
    expect(isAllowedUpload("application/pdf", "permit.pdf")).toBe(true);
  });

  it("rejects a disallowed type and a type/extension mismatch", () => {
    expect(isAllowedUpload("text/html", "evil.html")).toBe(false);
    expect(isAllowedUpload("application/pdf", "evil.html")).toBe(false);
  });

  it("narrows to a requirement's own allow-list when one is set, else the global list", () => {
    expect(isAllowedForRequirement("image/png", ["application/pdf"])).toBe(false);
    expect(isAllowedForRequirement("application/pdf", ["application/pdf"])).toBe(true);
    expect(isAllowedForRequirement("image/png", null)).toBe(true);
  });

  it("caps uploads at 25 MB", () => {
    expect(MAX_UPLOAD_BYTES).toBe(25 * 1024 * 1024);
  });
});

describe("magic-byte sniff", () => {
  it("matches a real PDF header and fails a renamed HTML file", () => {
    expect(magicBytesMatch(Buffer.from("%PDF-1.4\n"), "application/pdf")).toBe(true);
    expect(magicBytesMatch(Buffer.from("<html></html>"), "application/pdf")).toBe(false);
  });

  it("fails closed for an unknown declared MIME", () => {
    expect(magicBytesMatch(Buffer.from("%PDF-1.4"), "text/html")).toBe(false);
  });
});
