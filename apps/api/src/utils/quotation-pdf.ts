import { QuotationEntity } from "../modules/quotations/quotation.entity";

function escapePdf(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

export function renderQuotationPdf(quotation: QuotationEntity): Buffer {
  const lines = [
    "ConstDoc Management",
    `Quotation ${quotation.id}`,
    `Status: ${quotation.status}`,
    `Created: ${quotation.createdAt.toISOString().slice(0, 10)}`,
    `Valid until: ${quotation.expiresAt ? quotation.expiresAt.toISOString().slice(0, 10) : "No expiry"}`,
    "",
    `Customer: ${quotation.customer?.name ?? quotation.customer?.email ?? quotation.customerId}`,
    `Workers: ${quotation.workerCount}`,
    `Location: ${quotation.location?.state ?? ""} ${quotation.location?.city ?? ""}`,
    "",
    ...(quotation.items ?? []).map((item) => `${item.service?.name ?? item.serviceId}: ${Number(item.price).toFixed(2)}`),
    "",
    `Total: ${Number(quotation.totalPrice).toFixed(2)}`,
  ];
  const content = ["BT", "/F1 12 Tf", "50 750 Td", ...lines.map((line, index) => `${index ? "0 -18 Td" : ""} (${escapePdf(line)}) Tj`), "ET"].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(content, "utf8")} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  objects.forEach((object, index) => { offsets[index + 1] = Buffer.byteLength(pdf, "utf8"); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n `).join("\n")}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, "utf8");
}