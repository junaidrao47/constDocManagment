# Image Credits & Slots (W6)

> **Status: DONE (7/7 fetched 2026-10-25).** Photos fetched via the official Unsplash API using the owner's
> local `UNSPLASH_ACCESS_KEY` (demo tier). The required `download_location` endpoint was triggered for each photo
> per Unsplash guidelines. Files self-hosted in `customer-portal/public/images/` (not hotlinked); Next/Image
> serves responsive AVIF/WebP at delivery. Machine-readable credits: `customer-portal/public/images/_credits.json`.
>
> Wired in `customer-portal/src/data/site-images.ts`: `heroImage`, `aboutImage`, and `AVAILABLE_CATEGORY_IMAGES`
> (the 5 category photos are staged against the PROPOSAL slugs and show once W1 seeds matching categories).

## Image slots the UI already reads
| Slot | File path (expected) | How to enable | Suggested Unsplash search |
|---|---|---|---|
| Home hero | `public/images/hero.jpg` | set `heroImage` in `site-images.ts` | "modern office building Mexico City facade", "government building Mexico architecture" |
| Category: fiscal | `public/images/category-fiscal.jpg` | add `fiscal` to `AVAILABLE_CATEGORY_IMAGES` | "tax documents desk calculator", "accounting paperwork office" |
| Category: laboral | `public/images/category-laboral.jpg` | add slug | "team meeting office workers", "HR office Mexico" |
| Category: ambiental | `public/images/category-ambiental.jpg` | add slug | "industrial facility green compliance", "environmental inspection industry" |
| Category: licencias | `public/images/category-licencias.jpg` | add slug | "storefront business permit sign", "small business owner Mexico" |
| Category: apertura | `public/images/category-apertura.jpg` | add slug | "new store opening", "entrepreneur opening shop Mexico" |
| About / Quiénes somos | `public/images/about.jpg` (new slot) | add a slot to `site-images.ts` | "professional services team Mexico office" |

> Keep license-safe stock only. Never hotlink Unsplash URLs; download + self-host (S3/CloudFront in prod).

## Interim (no key)
- Leave slots `null` → gradient/icon fallbacks (current, intentional).
- Or commission/receive real client photos → drop at the paths above, flip the flags.

## Credits (fetched 2026-10-25, Unsplash)
| File | Photographer | Profile | Source |
|---|---|---|---|
| hero.jpg | Anton Lukin | https://unsplash.com/@antonlukin | https://unsplash.com/photos/aX6HmZ1noy8 |
| about.jpg | Aalo Lens | https://unsplash.com/@aalolens | https://unsplash.com/photos/tUcVQwXsNck |
| category-fiscal.jpg | Jakub Żerdzicki | https://unsplash.com/@jakubzerdzicki | https://unsplash.com/photos/8wLZi9OhsWU |
| category-laboral.jpg | Austin Distel | https://unsplash.com/@austindistel | https://unsplash.com/photos/mpN7xjKQ_Ns |
| category-ambiental.jpg | Patrick Hendry | https://unsplash.com/@worldsbetweenlines | https://unsplash.com/photos/6xeDIZgoPaw |
| category-licencias.jpg | Tem Rysh | https://unsplash.com/@tem_rysh | https://unsplash.com/photos/F6-U5fGAOik |
| category-apertura.jpg | Mike Petrucci | https://unsplash.com/@mikepetrucci | https://unsplash.com/photos/c9FQyqIECds |

> Note: `category-ambiental.jpg` (factory + smoke) reads as *pollution* more than *green compliance* —
> swap candidate if the client prefers a positive environmental tone.
