import { AppDataSource } from "../../config/database";
import { HttpError } from "../../utils/http-error";
import { buildLocalDownloadUrl, getDownloadUrl } from "../../utils/s3";
import { DocumentEntity } from "../documents/document.entity";
import { InvoiceEntity } from "../../entities/invoice.entity";
import { SubscriptionEntity } from "../subscriptions/subscription.entity";
import { UserEntity } from "../users/user.entity";

function assertDatabaseReady(): void {
  if (!AppDataSource.isInitialized) {
    throw new HttpError(503, "Database is not initialized");
  }
}

function serializeUser(user: UserEntity) {
  return {
    id: user.id,
    email: user.email,
    name: user.name ?? null,
    phone: user.phone ?? null,
    role: user.role,
    isActive: user.isActive,
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

  return {
    id: document.id,
    customerId: document.customerId,
    serviceId: document.serviceId ?? null,
    fileName: document.fileName,
    s3Key: document.s3Key,
    status: document.status,
    expiresAt: document.expiresAt ?? null,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    downloadUrl,
    previewUrl: downloadUrl,
  };
}

export const customerService = {
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

    const documentRepository = AppDataSource.getRepository(DocumentEntity);
    const documents = await documentRepository.find({
      where: { customerId },
      order: { createdAt: "DESC" },
    });

    return Promise.all(documents.map((document) => serializeDocument(document)));
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
};