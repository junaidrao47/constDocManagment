/**
 * Demo data for a full walkthrough of every portal (W1).
 *
 * Idempotent: every row is found-or-created on a stable natural key, so running it twice makes
 * no duplicates and exits 0. Every row it creates is flagged `is_demo = true` (or owned by a
 * flagged parent), so `scripts/purge-demo.ts` removes the whole set in one command.
 *
 * Safety: refuses to run when NODE_ENV=production unless ALLOW_DEMO_SEED=true.
 *
 * Content: 1 admin, 2 managers, 1 agent, 5 customers (personas + onboarding, account states
 * pending/approved/suspended), manager assignments, 5 categories (matching the staged public
 * images), services + packages (bilingual), documents across every status with phases at
 * different progress, quotations with items, invoices + payments (so revenue shows in analytics)
 * and active subscriptions.
 *
 * Login credentials are written to docs/DEMO-ACCOUNTS.md (local/staging only).
 */
import bcrypt from "bcryptjs";
import { closeDatabase, initializeDatabase, AppDataSource } from "../config/database";
import { UserEntity, UserRole, AccountStatus, UserLocale } from "../modules/users/user.entity";
import { CustomerProfileEntity } from "../modules/customers/customer-profile.entity";
import { CustomerManagerAssignmentEntity } from "../entities/customer-manager-assignment.entity";
import { AgentCustomerAssignmentEntity } from "../entities/agent-customer-assignment.entity";
import { CategoryEntity } from "../modules/categories/category.entity";
import { ServiceEntity } from "../entities/service.entity";
import { PackageEntity } from "../modules/packages/package.entity";
import { IndustryEntity } from "../entities/industry.entity";
import { LocationEntity } from "../entities/location.entity";
import { DocumentEntity } from "../modules/documents/document.entity";
import { DocumentVersionEntity } from "../modules/documents/document-version.entity";
import { DocumentPhaseEntity } from "../modules/documents/document-phase.entity";
import { DocumentStatus } from "../modules/documents/document-status";
import { PhaseStatus } from "../modules/documents/phase-status";
import { QuotationEntity } from "../modules/quotations/quotation.entity";
import { QuotationItemEntity, type QuotationItemKind } from "../entities/quotation-item.entity";
import { QuotationStatus } from "../modules/quotations/quotation-status";
import { InvoiceEntity, InvoiceStatus } from "../entities/invoice.entity";
import { PaymentEntity, PaymentMethod } from "../modules/payments/payment.entity";
import { SubscriptionEntity } from "../modules/subscriptions/subscription.entity";

const DEMO_PASSWORD = "Demo1234!";
const DAY = 86_400_000;
const daysFromNow = (n: number) => new Date(Date.now() + n * DAY);
const dateOnly = (d: Date) => d.toISOString().slice(0, 10);
/** MXN money helper: given a subtotal, return {subtotal, tax (16% IVA), total} as fixed strings. */
function money(subtotal: number) {
  const tax = subtotal * 0.16;
  return { subtotal: subtotal.toFixed(2), tax: tax.toFixed(2), total: (subtotal + tax).toFixed(2) };
}

async function seed() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEMO_SEED !== "true") {
    throw new Error("Refusing to seed demo data in production. Set ALLOW_DEMO_SEED=true to override.");
  }
  await initializeDatabase();

  const users = AppDataSource.getRepository(UserEntity);
  const profiles = AppDataSource.getRepository(CustomerProfileEntity);
  const mgrAssign = AppDataSource.getRepository(CustomerManagerAssignmentEntity);
  const agentAssign = AppDataSource.getRepository(AgentCustomerAssignmentEntity);
  const categories = AppDataSource.getRepository(CategoryEntity);
  const services = AppDataSource.getRepository(ServiceEntity);
  const packages = AppDataSource.getRepository(PackageEntity);
  const industries = AppDataSource.getRepository(IndustryEntity);
  const locations = AppDataSource.getRepository(LocationEntity);
  const documents = AppDataSource.getRepository(DocumentEntity);
  const versions = AppDataSource.getRepository(DocumentVersionEntity);
  const phases = AppDataSource.getRepository(DocumentPhaseEntity);
  const quotations = AppDataSource.getRepository(QuotationEntity);
  const quotationItems = AppDataSource.getRepository(QuotationItemEntity);
  const invoices = AppDataSource.getRepository(InvoiceEntity);
  const payments = AppDataSource.getRepository(PaymentEntity);
  const subscriptions = AppDataSource.getRepository(SubscriptionEntity);

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  // ── Users ──────────────────────────────────────────────────────────────────
  async function upsertUser(
    email: string,
    name: string,
    role: UserRole,
    accountStatus: AccountStatus = AccountStatus.Approved,
    locale: UserLocale = UserLocale.EsMX,
  ) {
    let u = await users.findOne({ where: { email } });
    if (!u) u = users.create({ email });
    u.name = name;
    u.role = role;
    u.isActive = accountStatus !== AccountStatus.Suspended;
    u.accountStatus = accountStatus;
    u.preferredLocale = locale;
    u.passwordHash = passwordHash;
    u.isDemo = true;
    return users.save(u);
  }

  const admin = await upsertUser("admin@demo.g2h.test", "Administrador Demo", UserRole.Admin);
  const manager1 = await upsertUser("manager1@demo.g2h.test", "Mariana Hernández", UserRole.Manager);
  const manager2 = await upsertUser("manager2@demo.g2h.test", "Jorge Ramírez", UserRole.Manager);
  const agent1 = await upsertUser("agent1@demo.g2h.test", "Agente Demo", UserRole.Agent);

  type CustSpec = {
    email: string; name: string; persona: string; legalName: string; contact: string;
    state: string; city: string; status: AccountStatus; manager?: UserEntity; locale?: UserLocale;
  };
  const custSpecs: CustSpec[] = [
    { email: "cliente1@demo.g2h.test", name: "Construcciones del Golfo", persona: "company", legalName: "Construcciones del Golfo S.A. de C.V.", contact: "Laura Méndez", state: "Veracruz", city: "Xalapa", status: AccountStatus.Approved, manager: manager1 },
    { email: "cliente2@demo.g2h.test", name: "Industrias Monterrey", persona: "company", legalName: "Industrias Monterrey S.A.", contact: "Carlos Treviño", state: "Nuevo León", city: "Monterrey", status: AccountStatus.Approved, manager: manager2 },
    { email: "cliente3@demo.g2h.test", name: "Juan Pérez", persona: "individual", legalName: "Juan Pérez García", contact: "Juan Pérez", state: "Ciudad de México", city: "Ciudad de México", status: AccountStatus.Approved, manager: manager1, locale: UserLocale.En },
    { email: "cliente4@demo.g2h.test", name: "Comercializadora Jalisco", persona: "company", legalName: "Comercializadora Jalisco S.A. de C.V.", contact: "Ana López", state: "Jalisco", city: "Guadalajara", status: AccountStatus.PendingApproval },
    { email: "cliente5@demo.g2h.test", name: "Cuenta Suspendida", persona: "company", legalName: "Negocios Suspendidos S.A.", contact: "Pedro Ruiz", state: "Ciudad de México", city: "Ciudad de México", status: AccountStatus.Suspended, manager: manager2 },
  ];

  const customers: Record<string, UserEntity> = {};
  for (const c of custSpecs) {
    const u = await upsertUser(c.email, c.name, UserRole.Customer, c.status, c.locale ?? UserLocale.EsMX);
    customers[c.email] = u;

    // onboarding profile (1:1 on customer_id)
    let p = await profiles.findOne({ where: { customerId: u.id } });
    if (!p) p = profiles.create({ customerId: u.id });
    p.persona = c.persona;
    p.legalName = c.legalName;
    p.contactName = c.contact;
    p.notificationEmails = [`avisos+${c.email.split("@")[0]}@example.test`];
    p.phone = "+52 228 000 0000";
    p.state = c.state;
    p.city = c.city;
    p.needs = ["licencias", "fiscal"];
    p.completedAt = c.status === AccountStatus.PendingApproval ? null : daysFromNow(-20);
    await profiles.save(p);

    // manager assignment (approved/suspended only; pending has no manager yet)
    if (c.manager) {
      let a = await mgrAssign.findOne({ where: { customerId: u.id } });
      if (!a) a = mgrAssign.create({ customerId: u.id });
      a.managerId = c.manager.id;
      a.assignedBy = admin.id;
      a.isDemo = true;
      await mgrAssign.save(a);
    }
  }

  // one agent assignment for scoping demos
  {
    const cust = customers["cliente1@demo.g2h.test"];
    let a = await agentAssign.findOne({ where: { customerId: cust.id, agentId: agent1.id } });
    if (!a) a = agentAssign.create({ customerId: cust.id, agentId: agent1.id });
    a.assignedBy = admin.id;
    a.isDemo = true;
    await agentAssign.save(a);
  }

  // ── Catalogue: categories / services / packages ─────────────────────────────
  async function upsertCategory(slug: string, nameEn: string, nameEs: string, sort: number, icon: string) {
    let c = await categories.findOne({ where: { slug } });
    if (!c) c = categories.create({ slug });
    c.nameEn = nameEn; c.nameEs = nameEs; c.sortOrder = sort; c.isActive = true; c.icon = icon; c.isDemo = true;
    return categories.save(c);
  }
  const catFiscal = await upsertCategory("fiscal", "Tax & Fiscal", "Fiscal", 1, "receipt");
  const catLaboral = await upsertCategory("laboral", "Labor & Payroll", "Laboral", 2, "users");
  const catAmbiental = await upsertCategory("ambiental", "Environmental", "Ambiental", 3, "leaf");
  const catLicencias = await upsertCategory("licencias", "Licenses & Permits", "Licencias y permisos", 4, "badge-check");
  const catApertura = await upsertCategory("apertura", "Business Opening", "Apertura de negocio", 5, "store");

  async function upsertService(name: string, nameEs: string, descEn: string, descEs: string, basePrice: string, category: CategoryEntity) {
    let s = await services.findOne({ where: { name } });
    if (!s) s = services.create({ name });
    s.nameEn = name; s.nameEs = nameEs;
    s.description = descEn; s.descriptionEn = descEn; s.descriptionEs = descEs;
    s.basePrice = basePrice; s.isActive = true; s.categoryId = category.id; s.isDemo = true;
    return services.save(s);
  }
  const svcRfc = await upsertService("RFC & e-Signature Registration", "Alta de RFC y e.firma", "Register your RFC and electronic signature with the SAT.", "Tramitamos tu RFC y e.firma ante el SAT.", "8000", catFiscal);
  const svcAccounting = await upsertService("Monthly Electronic Accounting", "Contabilidad electrónica mensual", "Monthly CFDI accounting and tax filing.", "Contabilidad electrónica y declaraciones mensuales.", "12000", catFiscal);
  const svcImss = await upsertService("IMSS Employer Registration", "Registro patronal IMSS", "Register as an employer before the IMSS.", "Alta de registro patronal ante el IMSS.", "9000", catLaboral);
  const svcEnv = await upsertService("Environmental Licence (SEMARNAT)", "Licencia ambiental (SEMARNAT)", "Environmental permit processing before SEMARNAT.", "Gestión de licencia ambiental ante SEMARNAT.", "25000", catAmbiental);
  const svcLicense = await upsertService("Municipal Operating Licence", "Licencia de funcionamiento municipal", "Municipal operating licence processing.", "Trámite de licencia de funcionamiento municipal.", "6000", catLicencias);
  const svcLandUse = await upsertService("Land-Use Permit", "Uso de suelo", "Land-use authorisation for your premises.", "Autorización de uso de suelo para tu local.", "7000", catLicencias);
  const svcSare = await upsertService("Fast-Track Opening (SARE)", "Apertura rápida (SARE)", "Fast-track low-risk business opening via SARE.", "Apertura rápida de giros de bajo riesgo vía SARE.", "5000", catApertura);

  async function upsertPackage(name: string, nameEs: string, descEn: string, descEs: string, category: CategoryEntity, price: string, days: number, featured: boolean, sort: number, slugImg: string, svcs: ServiceEntity[]) {
    let p = await packages.findOne({ where: { name }, relations: { services: true } });
    if (!p) p = packages.create({ name });
    p.nameEn = name; p.nameEs = nameEs; p.descriptionEn = descEn; p.descriptionEs = descEs;
    p.categoryId = category.id; p.type = "compliance"; p.price = price; p.durationDays = days;
    p.isFeatured = featured; p.sortOrder = sort; p.isActive = true; p.isDemo = true;
    p.imageUrl = `/images/category-${slugImg}.jpg`;
    p.services = svcs;
    return packages.save(p);
  }
  const pkgApertura = await upsertPackage("Express Opening Package", "Paquete Apertura Express", "Everything to open a low-risk business fast.", "Todo para abrir un negocio de bajo riesgo rápido.", catApertura, "18000", 30, true, 1, "apertura", [svcSare, svcLandUse, svcRfc]);
  const pkgIntegral = await upsertPackage("Full Compliance Package", "Paquete Cumplimiento Integral", "Ongoing fiscal, labor and licensing compliance.", "Cumplimiento fiscal, laboral y de licencias continuo.", catFiscal, "45000", 90, true, 2, "fiscal", [svcRfc, svcAccounting, svcImss]);

  // ── Supporting pricing data (industry + locations) ──────────────────────────
  const industry = (await industries.findOne({ where: { name: "Construction" } }))
    ?? (await industries.save(industries.create({ name: "Construction", description: "General construction and contracting.", priceWeight: "1" })));
  async function upsertLocation(state: string, city: string, multiplier: string, cityFee: string) {
    return (await locations.findOne({ where: { state, city } }))
      ?? (await locations.save(locations.create({ state, city, multiplier, cityFee, isActive: true })));
  }
  const locXalapa = await upsertLocation("Veracruz", "Xalapa", "1.05", "2800");
  await upsertLocation("Nuevo León", "Monterrey", "1.10", "3000");
  await upsertLocation("Ciudad de México", "Ciudad de México", "1.15", "3500");

  // ── Documents (various statuses + phases) ───────────────────────────────────
  type PhaseSpec = { nameEn: string; nameEs: string; dept: string; status: PhaseStatus };
  async function upsertDocument(
    customer: UserEntity, service: ServiceEntity, fileName: string, status: DocumentStatus,
    phaseSpecs: PhaseSpec[], opts: { expiresInDays?: number; approvedBy?: UserEntity } = {},
  ) {
    let doc = await documents.findOne({ where: { customerId: customer.id, fileName } });
    if (!doc) doc = documents.create({ customerId: customer.id, fileName });
    doc.serviceId = service.id;
    doc.s3Key = `demo/${customer.id}/${fileName}`;
    doc.status = status;
    doc.isDemo = true;
    doc.expiresAt = opts.expiresInDays != null ? daysFromNow(opts.expiresInDays) : null;
    if (opts.approvedBy) {
      doc.approvedFileName = `aprobado-${fileName}`;
      doc.approvedS3Key = `demo/${customer.id}/approved-${fileName}`;
      doc.approvedUploadedBy = opts.approvedBy.id;
      doc.approvedUploadedAt = daysFromNow(-2);
    }
    doc = await documents.save(doc);

    // initial customer version
    let v = await versions.findOne({ where: { documentId: doc.id, versionNo: 1 } });
    if (!v) v = versions.create({ documentId: doc.id, versionNo: 1 });
    v.kind = "customer"; v.storageKey = doc.s3Key; v.fileName = fileName;
    v.mimeType = "application/pdf"; v.uploadedBy = customer.id; v.uploadedByRole = "customer"; v.status = "ready";
    v = await versions.save(v);
    if (!doc.currentVersionId) { doc.currentVersionId = v.id; await documents.save(doc); }

    // phases
    let pos = 1;
    for (const ps of phaseSpecs) {
      let ph = await phases.findOne({ where: { documentId: doc.id, position: pos } });
      if (!ph) ph = phases.create({ documentId: doc.id, position: pos });
      ph.nameEn = ps.nameEn; ph.nameEs = ps.nameEs; ph.department = ps.dept; ph.status = ps.status;
      ph.targetDate = daysFromNow(pos * 7);
      ph.completedAt = ps.status === PhaseStatus.Completed ? daysFromNow(-pos) : null;
      ph.completedBy = ps.status === PhaseStatus.Completed ? manager1.id : null;
      await phases.save(ph);
      pos++;
    }
    return doc;
  }

  const c1 = customers["cliente1@demo.g2h.test"];
  const c2 = customers["cliente2@demo.g2h.test"];
  const c3 = customers["cliente3@demo.g2h.test"];

  await upsertDocument(c1, svcLicense, "acta-constitutiva.pdf", DocumentStatus.Approved,
    [{ nameEn: "Intake review", nameEs: "Revisión inicial", dept: "Grupo G2H", status: PhaseStatus.Completed },
     { nameEn: "Municipal filing", nameEs: "Ingreso municipal", dept: "Municipio", status: PhaseStatus.Completed }],
    { approvedBy: manager1 });
  await upsertDocument(c1, svcLicense, "comprobante-domicilio.pdf", DocumentStatus.UnderReview,
    [{ nameEn: "Intake review", nameEs: "Revisión inicial", dept: "Grupo G2H", status: PhaseStatus.Completed },
     { nameEn: "Validation", nameEs: "Validación", dept: "Grupo G2H", status: PhaseStatus.InProgress }]);
  await upsertDocument(c1, svcLicense, "licencia-anterior.pdf", DocumentStatus.ExpiringSoon,
    [{ nameEn: "Renewal check", nameEs: "Revisión de renovación", dept: "Municipio", status: PhaseStatus.NotStarted }],
    { expiresInDays: 12 });
  await upsertDocument(c2, svcRfc, "constancia-rfc.pdf", DocumentStatus.SubmittedToGovernment,
    [{ nameEn: "Intake review", nameEs: "Revisión inicial", dept: "Grupo G2H", status: PhaseStatus.Completed },
     { nameEn: "SAT submission", nameEs: "Ingreso SAT", dept: "SAT", status: PhaseStatus.InProgress }]);
  await upsertDocument(c2, svcEnv, "dictamen-proteccion-civil.pdf", DocumentStatus.Rejected,
    [{ nameEn: "Intake review", nameEs: "Revisión inicial", dept: "Grupo G2H", status: PhaseStatus.Rejected }]);
  await upsertDocument(c3, svcRfc, "identificacion-oficial.pdf", DocumentStatus.Pending,
    [{ nameEn: "Intake review", nameEs: "Revisión inicial", dept: "Grupo G2H", status: PhaseStatus.NotStarted }]);

  // ── Quotations + items ──────────────────────────────────────────────────────
  async function upsertQuotation(
    customer: UserEntity, location: LocationEntity, workerCount: number, status: string,
    items: Array<{ service?: ServiceEntity; kind: QuotationItemKind; label: string; price: number }>,
  ) {
    const total = items.reduce((sum, i) => sum + i.price, 0);
    let q = await quotations.findOne({ where: { customerId: customer.id, totalPrice: total.toFixed(2), status } });
    const isNew = !q;
    if (!q) q = quotations.create({ customerId: customer.id });
    q.industryId = industry.id;
    q.locationId = location.id;
    q.workerCount = workerCount;
    q.totalPrice = total.toFixed(2);
    q.currency = "MXN";
    q.status = status;
    q.isDemo = true;
    q.sentAt = status !== QuotationStatus.Draft ? daysFromNow(-10) : null;
    q.acceptedAt = status === QuotationStatus.Accepted ? daysFromNow(-7) : null;
    q.expiresAt = daysFromNow(20);
    q = await quotations.save(q);
    if (isNew) {
      for (const it of items) {
        await quotationItems.save(quotationItems.create({
          quotationId: q.id,
          serviceId: it.service?.id ?? null,
          kind: it.kind,
          label: it.label,
          quantity: 1,
          unitPrice: it.price.toFixed(2),
          lineTotal: it.price.toFixed(2),
          price: it.price.toFixed(2),
        }));
      }
    }
    return q;
  }

  const q1 = await upsertQuotation(c1, locXalapa, 12, QuotationStatus.Accepted, [
    { service: svcRfc, kind: "service", label: "Alta de RFC y e.firma", price: 8000 },
    { service: svcAccounting, kind: "service", label: "Contabilidad mensual", price: 12000 },
    { kind: "gov_fee", label: "Derechos municipales", price: 2800 },
  ]);
  await upsertQuotation(c2, await locations.findOneOrFail({ where: { city: "Monterrey" } }), 40, QuotationStatus.Sent, [
    { service: svcEnv, kind: "service", label: "Licencia ambiental", price: 25000 },
  ]);
  await upsertQuotation(c3, await locations.findOneOrFail({ where: { city: "Ciudad de México" } }), 3, QuotationStatus.Draft, [
    { service: svcRfc, kind: "service", label: "Alta de RFC", price: 8000 },
  ]);

  // ── Invoices + payments (revenue) ───────────────────────────────────────────
  async function upsertInvoice(number: string, customer: UserEntity, subtotal: number, status: InvoiceStatus, dueInDays: number, quotation?: QuotationEntity) {
    const m = money(subtotal);
    let inv = await invoices.findOne({ where: { invoiceNumber: number } });
    if (!inv) inv = invoices.create({ invoiceNumber: number });
    inv.customerId = customer.id;
    inv.quotationId = quotation?.id ?? null;
    inv.amount = m.total; inv.subtotal = m.subtotal; inv.taxAmount = m.tax; inv.currency = "MXN";
    inv.status = status;
    inv.dueDate = dateOnly(daysFromNow(dueInDays));
    inv.paidAt = status === InvoiceStatus.Paid ? daysFromNow(-5) : null;
    inv.isDemo = true;
    inv = await invoices.save(inv);
    return inv;
  }
  async function upsertPayment(invoice: InvoiceEntity, method: PaymentMethod, recordedBy: UserEntity) {
    let p = await payments.findOne({ where: { invoiceId: invoice.id } });
    if (!p) p = payments.create({ invoiceId: invoice.id });
    p.amount = invoice.amount; p.method = method; p.reference = `DEMO-${invoice.invoiceNumber}`;
    p.paidAt = daysFromNow(-5); p.recordedBy = recordedBy.id; p.isDemo = true;
    return payments.save(p);
  }

  const inv1 = await upsertInvoice("INV-DEMO-0001", c1, 22800, InvoiceStatus.Paid, -5, q1);
  await upsertPayment(inv1, PaymentMethod.BankTransfer, admin);
  const inv2 = await upsertInvoice("INV-DEMO-0002", c2, 25000, InvoiceStatus.Paid, -2);
  await upsertPayment(inv2, PaymentMethod.Spei, admin);
  await upsertInvoice("INV-DEMO-0003", c2, 9000, InvoiceStatus.Issued, 15);
  await upsertInvoice("INV-DEMO-0004", c3, 6000, InvoiceStatus.Overdue, -3);

  // ── Subscriptions (active) ──────────────────────────────────────────────────
  async function upsertSubscription(customer: UserEntity, pkg: PackageEntity, status: string, startDaysAgo: number, durationDays: number) {
    let s = await subscriptions.findOne({ where: { customerId: customer.id, packageId: pkg.id } });
    if (!s) s = subscriptions.create({ customerId: customer.id, packageId: pkg.id });
    s.startDate = dateOnly(daysFromNow(-startDaysAgo));
    s.endDate = dateOnly(daysFromNow(durationDays - startDaysAgo));
    s.status = status;
    s.isDemo = true;
    return subscriptions.save(s);
  }
  await upsertSubscription(c1, pkgIntegral, "active", 20, 90);
  await upsertSubscription(c2, pkgApertura, "expiring_soon", 25, 30);

  // ── Summary ─────────────────────────────────────────────────────────────────
  const demoUserCount = await users.count({ where: { isDemo: true } });
  console.log(JSON.stringify({
    ok: true,
    password: DEMO_PASSWORD,
    counts: {
      users: demoUserCount,
      categories: await categories.count({ where: { isDemo: true } }),
      services: await services.count({ where: { isDemo: true } }),
      packages: await packages.count({ where: { isDemo: true } }),
      documents: await documents.count({ where: { isDemo: true } }),
      quotations: await quotations.count({ where: { isDemo: true } }),
      invoices: await invoices.count({ where: { isDemo: true } }),
      payments: await payments.count({ where: { isDemo: true } }),
      subscriptions: await subscriptions.count({ where: { isDemo: true } }),
    },
  }, null, 2));
}

seed()
  .catch((error) => { console.error("[seed-demo] failed", error); process.exitCode = 1; })
  .finally(() => closeDatabase());
