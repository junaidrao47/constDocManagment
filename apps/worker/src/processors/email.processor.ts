import fs from "fs";
import path from "path";
import Handlebars from "handlebars";
import { Job, Worker } from "bullmq";
import { redisConnection } from "../config/redis";
import { sendEmail } from "../utils/email";
import { emailDeadLetterQueue, EMAIL_QUEUE_NAME, type EmailJobData, type FailedEmailJobData } from "../queues/email.queue";

const templateCache = new Map<string, Handlebars.TemplateDelegate>();
const templateNames: ReadonlySet<EmailJobData["templateName"]> = new Set([
  "document-approved", "document-rejected", "quotation-ready", "quotation-accepted", "quotation-rejected", "invoice", "payment-recorded", "renewal-reminder", "contact-inquiry", "phase-completed", "phase-rejected", "account-approved",
]);
const defaultSubjects: Record<EmailJobData["templateName"], string> = {
  "document-approved": "Your document was approved",
  "document-rejected": "Action required for your document",
  "quotation-ready": "Your quotation is ready",
  "quotation-accepted": "Your quotation was accepted",
  "quotation-rejected": "Your quotation was rejected",
  invoice: "Your invoice is ready",
  "payment-recorded": "Your payment was recorded",
  "renewal-reminder": "Renewal reminder",
  "contact-inquiry": "New website inquiry",
  "phase-completed": "A document phase was completed",
  "phase-rejected": "A document phase needs attention",
  "account-approved": "Your account has been approved",
};

/** Resolve the templates directory, preferring compiled output, falling back to src. */
function templatesDir(): string {
  const compiledDir = path.join(__dirname, "..", "templates");
  const sourceDir = path.join(process.cwd(), "src", "templates");
  return fs.existsSync(compiledDir) ? compiledDir : sourceDir;
}

// Shared branded layout partial (PROJECT-BRIEF §7.7). Registered once; templates that
// want it reference {{> layout}}. Resolved the same way as full templates.
let partialsRegistered = false;
function registerPartials(): void {
  if (partialsRegistered) return;
  const layoutPath = path.join(templatesDir(), "_layout.hbs");
  if (fs.existsSync(layoutPath)) {
    Handlebars.registerPartial("layout", fs.readFileSync(layoutPath, "utf8"));
  }
  partialsRegistered = true;
}

/**
 * Renders `templateName` in `locale`, preferring `<name>.<locale>.hbs` and falling
 * back to `<name>.hbs` for templates that are not yet localized. Cached per
 * (template, resolved file).
 */
function renderTemplate(templateName: EmailJobData["templateName"], data: Record<string, unknown>, locale?: EmailJobData["locale"]): string {
  if (!templateNames.has(templateName)) throw new Error(`Unknown email template: ${templateName}`);
  registerPartials();

  const dir = templatesDir();
  const resolvedLocale = locale ?? "es-MX";
  const localizedPath = path.join(dir, `${templateName}.${resolvedLocale}.hbs`);
  const genericPath = path.join(dir, `${templateName}.hbs`);
  const templatePath = fs.existsSync(localizedPath) ? localizedPath : genericPath;

  let template = templateCache.get(templatePath);
  if (!template) {
    const source = fs.readFileSync(templatePath, "utf8");
    template = Handlebars.compile(source, { strict: true });
    templateCache.set(templatePath, template);
  }
  return template(data);
}

function toText(html: string): string {
  return html.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

export async function processEmailJob(job: Job<EmailJobData>): Promise<void> {
  const html = renderTemplate(job.data.templateName, job.data.data, job.data.locale);
  const result = await sendEmail({ to: job.data.to, subject: job.data.subject ?? defaultSubjects[job.data.templateName], html, text: toText(html) });
  if (!result.delivered) throw new Error(`Email delivery failed via ${result.transport} transport`);
}

export function processEmailJobs(): Worker<EmailJobData> {
  const worker = new Worker<EmailJobData>(EMAIL_QUEUE_NAME, processEmailJob, {
    connection: redisConnection,
    concurrency: 5,
  });
  worker.on("failed", async (job, error) => {
    if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
      const deadLetter: FailedEmailJobData = { ...job.data, failure: error.message, failedAt: new Date().toISOString() };
      await emailDeadLetterQueue.add("failed-email", deadLetter);
    }
  });
  worker.on("error", (error) => console.error(`[worker:email] ${error.message}`));
  return worker;
}
