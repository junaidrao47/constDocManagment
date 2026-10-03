import fs from "fs";
import path from "path";
import Handlebars from "handlebars";
import { Job, Worker } from "bullmq";
import { redisConnection } from "../config/redis";
import { sendEmail } from "../utils/email";
import { emailDeadLetterQueue, EMAIL_QUEUE_NAME, type EmailJobData, type FailedEmailJobData } from "../queues/email.queue";

const templateCache = new Map<string, Handlebars.TemplateDelegate>();
const templateNames: ReadonlySet<EmailJobData["templateName"]> = new Set([
  "document-approved", "document-rejected", "quotation-ready", "invoice", "renewal-reminder",
]);
const defaultSubjects: Record<EmailJobData["templateName"], string> = {
  "document-approved": "Your document was approved",
  "document-rejected": "Action required for your document",
  "quotation-ready": "Your quotation is ready",
  invoice: "Your invoice is ready",
  "renewal-reminder": "Renewal reminder",
};

function renderTemplate(templateName: EmailJobData["templateName"], data: Record<string, unknown>): string {
  if (!templateNames.has(templateName)) throw new Error(`Unknown email template: ${templateName}`);
  let template = templateCache.get(templateName);
  if (!template) {
    const compiledTemplatePath = path.join(__dirname, "..", "templates", `${templateName}.hbs`);
    const sourceTemplatePath = path.join(process.cwd(), "src", "templates", `${templateName}.hbs`);
    const templatePath = fs.existsSync(compiledTemplatePath) ? compiledTemplatePath : sourceTemplatePath;
    const source = fs.readFileSync(templatePath, "utf8");
    template = Handlebars.compile(source, { strict: true });
    templateCache.set(templateName, template);
  }
  return template(data);
}

function toText(html: string): string {
  return html.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

export async function processEmailJob(job: Job<EmailJobData>): Promise<void> {
  const html = renderTemplate(job.data.templateName, job.data.data);
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
