# Public S3 bucket for website / CMS images

This bucket holds **only** public website assets — homepage hero slides and catalog
(service / package) images. These are rendered to anonymous visitors as plain
`<img src="https://…">` URLs, so the bucket must allow **public read**.

It is deliberately **separate** from the private documents bucket (`S3_BUCKET`), which
stays locked down (Block Public Access ON) and is only ever reached through short-lived
presigned URLs. **Customer documents must never land in this public bucket.**

| Bucket env var | Purpose | Public? | How it is served |
|---|---|---|---|
| `S3_BUCKET` | Customer documents, phase result files | No — keep locked | Presigned GET URLs |
| `S3_PUBLIC_BUCKET` | Hero slides + service/package images | **Yes, read-only** | Plain public URL stored in DB |

Object key prefixes written into the public bucket by the API (see `apps/api/src/utils/s3.ts`):

- `public/hero/<uuid>.<ext>` — homepage hero carousel slides
- `services/<serviceId>/{main,gallery}/<uuid>.<ext>` — service images
- `packages/<packageId>/{main,gallery}/<uuid>.<ext>` — package images

---

## Step-by-step: create the bucket (AWS Console)

Suggested name (dev): **`constdocs3dev-public`**. Use a different name per environment,
e.g. `grupog2h-public-prod` for production. If you pick another name, update:

1. `S3_PUBLIC_BUCKET` in `.env`, and
2. the ARN in `docs/s3-public-bucket-policy.json`.

### 1. Create the bucket
1. AWS Console → **S3** → **Create bucket**.
2. **AWS Region:** `us-east-1` (must match `AWS_REGION` in `.env`).
3. **Bucket name:** `constdocs3dev-public`.
4. **Object Ownership:** leave as **ACLs disabled (Bucket owner enforced)** — the default.
   We grant public read through a *bucket policy*, not object ACLs (the API never sets
   an ACL on upload).
5. **Block Public Access:** **uncheck "Block all public access"**. A confirmation box
   appears — tick **"I acknowledge…"**. (For a locked-down setup you may leave the two
   *ACL* blocks checked and only uncheck the two *bucket policy* blocks; the simplest
   working option is to uncheck all four on this public bucket.)
6. **Bucket Versioning:** Disabled (fine for images).
7. **Default encryption:** leave **SSE-S3** (default).
8. Click **Create bucket**.

### 2. Attach the public-read bucket policy
1. Open the bucket → **Permissions** tab → **Bucket policy** → **Edit**.
2. Paste the contents of [`s3-public-bucket-policy.json`](./s3-public-bucket-policy.json).
   Make sure the `Resource` ARN matches your bucket name, ending in `/*`.
3. **Save changes.** S3 will label the bucket "Publicly accessible" — expected for this bucket.

### 3. (Recommended) Add CORS
Only needed if a browser ever fetches these via `fetch()`/`next/image` rather than a plain
`<img>`. Harmless to add now.
1. Same **Permissions** tab → **Cross-origin resource sharing (CORS)** → **Edit**.
2. Paste [`s3-public-bucket-cors.json`](./s3-public-bucket-cors.json). Tighten
   `AllowedOrigins` to your real domains before production.
3. **Save changes.**

### 4. Grant the app's IAM user write access to the bucket
The API uses the same AWS credentials as for `S3_BUCKET` — the IAM user **`constdocs3user`**.
Its existing policy only covers the documents bucket, so uploads to the new bucket fail with:

```
AccessDenied: User .../constdocs3user is not authorized to perform s3:PutObject
on arn:aws:s3:::cosntdoc-images/... because no identity-based policy allows the action
```

You do **not** need a separate IAM user. Attach the read/write policy to the existing one:

1. AWS Console → **IAM** → **Users** → **constdocs3user** → **Add permissions** →
   **Create inline policy** → **JSON** tab.
2. Paste [`s3-public-bucket-iam-policy.json`](./s3-public-bucket-iam-policy.json)
   (grants `s3:PutObject`, `s3:DeleteObject`, `s3:GetObject` on
   `arn:aws:s3:::cosntdoc-images/*`). Confirm the ARN matches your bucket name.
3. Name it e.g. `website-images-rw` and **Create policy**.

This is the IAM (identity-based) policy that lets the *app* write/delete. It is separate from
the *bucket* policy in step 2, which lets *anonymous visitors* read.

On EC2 in production, add the same three actions for this bucket to the instance role instead.

### 5. Point the app at the bucket
1. In `constDocManagment/.env` set:
   ```
   S3_PUBLIC_BUCKET=constdocs3dev-public
   ```
2. Recreate the API (and worker) so the new env value is loaded — a plain
   `docker compose restart` does **not** re-read `.env`:
   ```
   docker compose up -d --force-recreate api worker
   ```

### 6. Verify
Upload a hero slide or a service image from the admin portal, then open its URL. A missing
key on a correctly-public bucket returns `NoSuchKey` (404), not `AccessDenied` (403):

```
curl -I "https://constdocs3dev-public.s3.us-east-1.amazonaws.com/public/hero/<some-key>.jpg"
# 200 for a real object; 404 NoSuchKey (not 403) proves the bucket is public.
```

---

## Notes
- **Existing rows:** any hero/catalog images uploaded *before* this switch still point at
  the old (private) `S3_BUCKET` URL and will stay broken. Re-upload them, or copy the
  objects across with `aws s3 cp`. (The dev DB currently has no hero slides, so this is a
  non-issue right now.)
- **Fallback:** with `S3_PUBLIC_BUCKET` unset, images continue to use `S3_BUCKET` exactly
  as before — no behaviour change until you complete step 5.
- **Production hardening:** put CloudFront in front of this bucket (cache + HTTPS on your
  own domain) and restrict the bucket policy to the CloudFront OAC instead of `Principal: *`.
