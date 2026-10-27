/**
 * Seeds the public homepage hero carousel (hero_slides) with a bilingual set of slides
 * and uploads each image to the PUBLIC images bucket via saveHeroObject.
 *
 * Idempotent: every run clears the existing hero slides (and their S3 objects) first, then
 * re-creates this set. Run with the stack up:
 *   docker compose exec api npx ts-node src/scripts/seed-hero.ts
 *   (or, from apps/api on the host:  npm run db:seed:hero)
 *
 * Images are license-free Unsplash photos (Unsplash License: free commercial use, no
 * attribution required) used as high-quality placeholders. Swap the `photo` ids below for
 * the client's own photography when it is delivered (PROJECT-BRIEF §8 open question).
 */
import { closeDatabase, initializeDatabase, AppDataSource } from "../config/database";
import { AppSettingEntity } from "../entities/app-setting.entity";
import { HeroSlideEntity, HeroTransition } from "../modules/cms/hero-slide.entity";
import { CMS_SETTING_KEYS } from "../modules/cms/cms-settings";
import { saveHeroObject, removeHeroObject } from "../utils/s3";

interface SlideSeed {
  photo: string; // Unsplash photo id
  alt: { en: string; es: string };
  headline: { en: string; es: string };
  subheadline: { en: string; es: string };
  cta: { labelEn: string; labelEs: string; url: string };
  overlayOpacity: number;
  focalX: number;
  focalY: number;
}

// Slower autoplay (each slide holds ~8s) with a 1s zoom-in transition between slides.
const DURATION_MS = 8000;
const TRANSITION_MS = 1000;
const SLIDE_TRANSITION = HeroTransition.Zoom;

const SLIDES: SlideSeed[] = [
  {
    photo: "photo-1486406146926-c627a92ad1ab",
    alt: {
      en: "Modern corporate towers viewed from below",
      es: "Torres corporativas modernas vistas desde abajo",
    },
    headline: {
      en: "Government approvals, handled from start to finish",
      es: "Trámites ante el gobierno, resueltos de principio a fin",
    },
    subheadline: {
      en: "Grupo G2H takes Mexican businesses and individuals through every permit, filing, and official approval — so your documents get stamped without the runaround.",
      es: "Grupo G2H acompaña a empresas y personas en México en cada permiso, trámite y aprobación oficial — para que tus documentos queden sellados sin vueltas.",
    },
    cta: { labelEn: "Request a quote", labelEs: "Solicitar cotización", url: "/contact" },
    overlayOpacity: 0.5,
    focalX: 50,
    focalY: 45,
  },
  {
    photo: "photo-1454165804606-c3d57bc86b40",
    alt: {
      en: "Professionals reviewing documents at a desk",
      es: "Profesionales revisando documentos en un escritorio",
    },
    headline: {
      en: "Upload once. We take it to the government.",
      es: "Súbelo una vez. Nosotros lo llevamos ante el gobierno.",
    },
    subheadline: {
      en: "Follow every document through each approval phase from your portal — real status, target dates, and the approved file waiting for you at the end.",
      es: "Da seguimiento a cada documento en todas sus fases desde tu portal — estatus real, fechas objetivo y el archivo aprobado listo para descargar.",
    },
    cta: { labelEn: "See our services", labelEs: "Ver servicios", url: "/services" },
    overlayOpacity: 0.56,
    focalX: 55,
    focalY: 50,
  },
  {
    photo: "photo-1517048676732-d65bc937f952",
    alt: {
      en: "Business team planning around a table",
      es: "Equipo de negocios planeando en una mesa",
    },
    headline: {
      en: "Clear packages. Transparent pricing in MXN.",
      es: "Paquetes claros. Precios transparentes en MXN.",
    },
    subheadline: {
      en: "Choose a package built for your industry and city, or get a tailored quote in minutes with our pricing calculator.",
      es: "Elige un paquete hecho para tu industria y ciudad, u obtén una cotización a la medida en minutos con nuestra calculadora de precios.",
    },
    cta: { labelEn: "View packages", labelEs: "Ver paquetes", url: "/packages" },
    overlayOpacity: 0.54,
    focalX: 50,
    focalY: 45,
  },
  {
    photo: "photo-1551836022-d5d88e9218df",
    alt: {
      en: "Advisor meeting with a client",
      es: "Asesora en reunión con una clienta",
    },
    headline: {
      en: "Compliance partners you can actually talk to",
      es: "Asesores de cumplimiento con los que sí puedes hablar",
    },
    subheadline: {
      en: "From Veracruz to CDMX, Grupo G2H keeps your paperwork on schedule — with a real person guiding every step.",
      es: "De Veracruz a CDMX, Grupo G2H mantiene tus trámites al día — con una persona real guiándote en cada paso.",
    },
    cta: { labelEn: "Create your account", labelEs: "Crea tu cuenta", url: "/register" },
    overlayOpacity: 0.56,
    focalX: 55,
    focalY: 45,
  },
];

function imageUrlFor(photo: string): string {
  return `https://images.unsplash.com/${photo}?w=1920&h=1080&fit=crop&q=72&fm=jpg`;
}

async function fetchImage(photo: string): Promise<Buffer> {
  const res = await fetch(imageUrlFor(photo));
  if (!res.ok) throw new Error(`Failed to fetch ${photo}: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Upserts a global CMS hero setting in app_settings (JSONB value, addressed by key). */
async function putSetting(key: string, value: unknown): Promise<void> {
  const repo = AppDataSource.getRepository(AppSettingEntity);
  const existing = await repo.findOne({ where: { key } });
  if (existing) {
    await (repo as any).update({ key }, { value, updatedAt: new Date() });
  } else {
    await repo.save(repo.create({ key, value, updatedBy: null, updatedAt: new Date() } as any));
  }
}

async function seed(): Promise<void> {
  await initializeDatabase();
  const repo = AppDataSource.getRepository(HeroSlideEntity);

  // Global carousel behaviour: slower autoplay, 1s transition, autoplay + loop + pause-on-hover.
  await putSetting(CMS_SETTING_KEYS.heroTransitionMs, TRANSITION_MS);
  await putSetting(CMS_SETTING_KEYS.heroDefaultDurationMs, DURATION_MS);
  await putSetting(CMS_SETTING_KEYS.heroAutoplay, true);
  await putSetting(CMS_SETTING_KEYS.heroLoop, true);
  await putSetting(CMS_SETTING_KEYS.heroPauseOnHover, true);
  console.log(`Settings: transition=${TRANSITION_MS}ms, duration=${DURATION_MS}ms, autoplay+loop on.`);

  // Clear existing slides and their stored objects so the run is idempotent.
  const existing = await repo.find();
  for (const slide of existing) {
    await removeHeroObject(slide.imageKey);
  }
  if (existing.length > 0) {
    await repo.remove(existing);
    console.log(`Removed ${existing.length} existing hero slide(s).`);
  }

  for (let i = 0; i < SLIDES.length; i += 1) {
    const def = SLIDES[i];
    const buffer = await fetchImage(def.photo);
    const stored = await saveHeroObject(`${def.photo}.jpg`, buffer, "image/jpeg");
    const entity = repo.create({
      imageKey: stored.key,
      imageUrl: stored.url,
      altEn: def.alt.en,
      altEs: def.alt.es,
      headlineEn: def.headline.en,
      headlineEs: def.headline.es,
      subheadlineEn: def.subheadline.en,
      subheadlineEs: def.subheadline.es,
      ctaLabelEn: def.cta.labelEn,
      ctaLabelEs: def.cta.labelEs,
      ctaUrl: def.cta.url,
      position: i,
      isActive: true,
      durationMs: DURATION_MS,
      transition: SLIDE_TRANSITION,
      overlayOpacity: def.overlayOpacity,
      focalX: def.focalX,
      focalY: def.focalY,
    });
    await repo.save(entity);
    console.log(`Seeded slide ${i + 1}: "${def.headline.en}" -> ${stored.url}`);
  }

  console.log(`\nDone. ${SLIDES.length} hero slides seeded.`);
}

seed()
  .then(() => closeDatabase())
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error("Hero seed failed:", err?.message ?? err);
    await closeDatabase().catch(() => undefined);
    process.exit(1);
  });
