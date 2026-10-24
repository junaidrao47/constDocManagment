import { In } from "typeorm";
import { AppDataSource } from "../../config/database";
import { HttpError } from "../../utils/http-error";
import { buildLocalDownloadUrl, getDownloadUrl } from "../../utils/s3";
import { ServiceEntity } from "../../entities/service.entity";
import { assignmentService } from "../assignments/assignment.service";
import { invalidateSessionCache } from "../auth/session";
import { DocumentEntity } from "../documents/document.entity";
import { DocumentPhaseEntity } from "../documents/document-phase.entity";
import { computePhaseProgress } from "../documents/document.service";
import { PhaseStatus } from "../documents/phase-status";
import { InvoiceEntity } from "../../entities/invoice.entity";
import { SubscriptionEntity } from "../subscriptions/subscription.entity";
import { UserEntity, UserLocale } from "../users/user.entity";
import { CustomerProfileEntity } from "./customer-profile.entity";
import { PERSONAS } from "./persona";
import type { OnboardingInput } from "./customer.schema";

function assertDatabaseReady(): void {
  if (!AppDataSource.isInitialized) {
    throw new HttpError(503, "Database is not initialized");
  }
}

function profileRepo() {
  return AppDataSource.getRepository(CustomerProfileEntity);
}

/** The onboarding is "complete" once every field the client requires is present. */
function isOnboardingComplete(profile: CustomerProfileEntity): boolean {
  return Boolean(
    profile.persona &&
      profile.legalName &&
      profile.contactName &&
      (profile.notificationEmails?.length ?? 0) > 0 &&
      profile.phone &&
      profile.state &&
      profile.city,
  );
}

function serializeProfile(profile: CustomerProfileEntity | null) {
  if (!profile) {
    return {
      persona: null,
      legalName: null,
      contactName: null,
      notificationEmails: [] as string[],
      phone: null,
      state: null,
      city: null,
      needs: [] as string[],
      completedAt: null,
      completed: false,
    };
  }
  return {
    persona: profile.persona ?? null,
    legalName: profile.legalName ?? null,
    contactName: profile.contactName ?? null,
    notificationEmails: profile.notificationEmails ?? [],
    phone: profile.phone ?? null,
    state: profile.state ?? null,
    city: profile.city ?? null,
    needs: profile.needs ?? [],
    completedAt: profile.completedAt ?? null,
    completed: isOnboardingComplete(profile),
  };
}

function serializeUser(user: UserEntity) {
  return {
    id: user.id,
    email: user.email,
    name: user.name ?? null,
    phone: user.phone ?? null,
    role: user.role,
    isActive: user.isActive,
    accountStatus: user.accountStatus,
    preferredLocale: user.preferredLocale,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

async function resolveDocumentDownloadUrl(document: DocumentEntity): Promise<string> {
  const signedUrl = await getDownloadUrl({ key: document.s3Key });
  return signedUrl ?? buildLocalDownloadUrl(document.id);
}

async function serializeDocument(document: DocumentEntity) {
  const downloadUrl = await resolveDocumentDownloadUrl(document);
  const approvedDownloadUrl = document.approvedS3Key
    ? await resolveDocumentDownloadUrl({ ...document, s3Key: document.approvedS3Key } as DocumentEntity)
    : null;

  return {
    id: document.id,
    customerId: document.customerId,
    serviceId: document.serviceId ?? null,
    fileName: document.fileName,
    s3Key: document.s3Key,
    approvedFileName: document.approvedFileName ?? null,
    approvedS3Key: document.approvedS3Key ?? null,
    approvedUploadedBy: document.approvedUploadedBy ?? null,
    approvedUploadedAt: document.approvedUploadedAt ?? null,
    status: document.status,
    expiresAt: document.expiresAt ?? null,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    downloadUrl,
    previewUrl: downloadUrl,
    approvedDownloadUrl,
  };
}

export const customerService = {
  async getCustomerDashboard(customerId: string) {
    const [profile, documents, subscriptions, invoices, manager] = await Promise.all([
      customerService.getCustomerProfile(customerId),
      customerService.getMyDocuments(customerId),
      customerService.getMySubscriptions(customerId),
      customerService.getMyInvoices(customerId),
      customerService.getMyManager(customerId),
    ]);

    return {
      profile: profile.profile,
      stats: profile.stats,
      manager,
      documents: documents.slice(0, 5),
      subscriptions: subscriptions.slice(0, 5),
      invoices: invoices.slice(0, 5),
      attention: {
        documents: documents.filter((document) => ["pending", "rejected", "expiring_soon", "expired"].includes(document.status)).length,
        unpaidInvoices: invoices.filter((invoice) => invoice.status !== "paid").length,
      },
    };
  },

  async getCustomerProfile(customerId: string) {
    assertDatabaseReady();

    const userRepository = AppDataSource.getRepository(UserEntity);
    const documentRepository = AppDataSource.getRepository(DocumentEntity);
    const subscriptionRepository = AppDataSource.getRepository(SubscriptionEntity);
    const invoiceRepository = AppDataSource.getRepository(InvoiceEntity);

    const user = await userRepository.findOne({ where: { id: customerId } });

    if (!user) {
      throw new HttpError(404, "User not found");
    }

    const [documentsCount, subscriptionsCount, invoicesCount, activeSubscriptions] = await Promise.all([
      documentRepository.count({ where: { customerId } }),
      subscriptionRepository.count({ where: { customerId } }),
      invoiceRepository.count({ where: { customerId } }),
      subscriptionRepository.count({ where: { customerId, status: "active" } }),
    ]);

    return {
      profile: serializeUser(user),
      stats: {
        documentsCount,
        subscriptionsCount,
        invoicesCount,
        activeSubscriptions,
      },
    };
  },

  async getMyDocuments(customerId: string) {
    assertDatabaseReady();

    const documents = await AppDataSource.getRepository(DocumentEntity).find({
      where: { customerId },
      order: { createdAt: "DESC" },
    });

    // Enrich each document with its phase progress, the owning service's bilingual name,
    // and the next upcoming target date — so the customer dashboard can group by service
    // and draw a phase progress bar. Two batched queries, no per-document lookups.
    const docIds = documents.map((d) => d.id);
    const serviceIds = [...new Set(documents.map((d) => d.serviceId).filter((id): id is string => Boolean(id)))];
    const [phases, services] = await Promise.all([
      docIds.length
        ? AppDataSource.getRepository(DocumentPhaseEntity).find({ where: { documentId: In(docIds) } })
        : Promise.resolve([]),
      serviceIds.length
        ? AppDataSource.getRepository(ServiceEntity).find({ where: { id: In(serviceIds) } })
        : Promise.resolve([]),
    ]);
    const serviceById = new Map(services.map((s) => [s.id, s]));

    return Promise.all(
      documents.map(async (document) => {
        const docPhases = phases
          .filter((p) => p.documentId === document.id)
          .sort((a, b) => a.position - b.position);
        const service = document.serviceId ? serviceById.get(document.serviceId) : undefined;
        const upcoming = docPhases
          .filter((p) => p.status !== PhaseStatus.Completed && p.targetDate)
          .map((p) => p.targetDate as Date)
          .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
        const nextTargetDate = upcoming[0] ?? document.targetDate ?? null;

        return {
          ...(await serializeDocument(document)),
          targetDate: document.targetDate ?? null,
          nextTargetDate,
          service: service ? { id: service.id, nameEn: service.nameEn, nameEs: service.nameEs } : null,
          progress: computePhaseProgress(docPhases),
          phaseStatuses: docPhases.map((p) => p.status),
        };
      }),
    );
  },

  async getMySubscriptions(customerId: string) {
    assertDatabaseReady();

    const subscriptionRepository = AppDataSource.getRepository(SubscriptionEntity);
    const subscriptions = await subscriptionRepository.find({
      where: { customerId },
      order: { createdAt: "DESC" },
    });

    return subscriptions.map((subscription) => ({
      id: subscription.id,
      customerId: subscription.customerId,
      packageId: subscription.packageId,
      startDate: subscription.startDate,
      endDate: subscription.endDate,
      status: subscription.status,
      createdAt: subscription.createdAt,
      updatedAt: subscription.updatedAt,
    }));
  },

  async getMyInvoices(customerId: string) {
    assertDatabaseReady();

    const invoiceRepository = AppDataSource.getRepository(InvoiceEntity);
    const invoices = await invoiceRepository.find({
      where: { customerId },
      order: { createdAt: "DESC" },
    });

    return invoices.map((invoice) => ({
      id: invoice.id,
      customerId: invoice.customerId,
      subscriptionId: invoice.subscriptionId ?? null,
      amount: invoice.amount,
      status: invoice.status,
      dueDate: invoice.dueDate,
      paidAt: invoice.paidAt ?? null,
      createdAt: invoice.createdAt,
      updatedAt: invoice.updatedAt,
    }));
  },

  /** The customer's currently assigned manager as {id,name,email}, or null if none. */
  async getMyManager(customerId: string) {
    assertDatabaseReady();
    const managerId = await assignmentService.getManagerFor(customerId);
    if (!managerId) return null;
    const manager = await AppDataSource.getRepository(UserEntity).findOne({ where: { id: managerId } });
    return manager ? { id: manager.id, name: manager.name ?? null, email: manager.email } : null;
  },

  // ── Onboarding (PROJECT-BRIEF §11.4) ───────────────────────────────────────────

  /** The customer's onboarding profile, plus the persona list for the form. */
  async getOnboarding(customerId: string) {
    assertDatabaseReady();
    const profile = await profileRepo().findOne({ where: { customerId } });
    return { onboarding: serializeProfile(profile), personas: [...PERSONAS] };
  },

  /** Upsert the onboarding profile; sets the account's preferred locale and completion. */
  async putOnboarding(customerId: string, input: OnboardingInput) {
    assertDatabaseReady();

    const repository = profileRepo();
    const profile = (await repository.findOne({ where: { customerId } })) ?? repository.create({ customerId });

    if (input.persona !== undefined) profile.persona = input.persona;
    if (input.legalName !== undefined) profile.legalName = input.legalName;
    if (input.contactName !== undefined) profile.contactName = input.contactName;
    if (input.notificationEmails !== undefined) profile.notificationEmails = input.notificationEmails;
    if (input.phone !== undefined) profile.phone = input.phone;
    if (input.state !== undefined) profile.state = input.state;
    if (input.city !== undefined) profile.city = input.city;
    if (input.needs !== undefined) profile.needs = input.needs;

    profile.completedAt = isOnboardingComplete(profile) ? (profile.completedAt ?? new Date()) : null;

    const saved = await repository.save(profile);

    if (input.locale !== undefined) {
      const userRepository = AppDataSource.getRepository(UserEntity);
      const locale = input.locale === "en" ? UserLocale.En : UserLocale.EsMX;
      await userRepository.update({ id: customerId }, { preferredLocale: locale });
      // preferredLocale lives in the cached session state, so drop the cache.
      await invalidateSessionCache(customerId);
    }

    return { onboarding: serializeProfile(saved), personas: [...PERSONAS] };
  },
};