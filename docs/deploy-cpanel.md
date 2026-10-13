# Deploying the static demo to a cPanel subdomain

The public demo is a static site: `index.html`, an `assets/` folder and `.htaccess`. No
Node.js is needed on the server, because the game core runs in the browser (in-browser mock).

## 1. Build

```bash
npm ci
npm run build
```

The output is `apps/web/dist/`:

```
dist/
├─ .htaccess          caching, compression, security headers (HTTPS redirect commented)
├─ index.html
└─ assets/            hashed JS/CSS chunks (react-*, index-*, createMockGameServer-*, Pixi renderers)
```

The build uses relative URLs (`base: './'`), so it works from a subdomain's root or from any
sub-folder, unchanged.

To upload it as one file, zip the **contents** of `dist/` (not the folder itself), so that
`index.html` sits at the top level of the archive. `.htaccess` must be included.

## 2. Create the subdomain

1. cPanel → **Domains** (or **Subdomains** in older cPanel) → **Create a New Domain**.
2. Domain: e.g. `deepreef.example.com`.
3. Document root: cPanel suggests one, e.g. `public_html/deepreef` or `deepreef.example.com`.
   Note it down.

## 3. Upload

1. cPanel → **File Manager** → open the document root from step 2.
2. **Settings** (top right) → enable **Show Hidden Files (dotfiles)**, so you can see `.htaccess`.
3. **Upload** the zip → back in File Manager, select it → **Extract** into the document root.
4. Check that `index.html`, `.htaccess` and `assets/` are **directly** in the document root.
5. Delete the zip.

## 4. HTTPS

1. cPanel → **SSL/TLS Status** → select the subdomain → **Run AutoSSL**.
2. Once the certificate shows as valid, open `.htaccess` in File Manager (Edit) and uncomment
   the three `Rewrite…` lines under the HTTPS comment, so HTTP redirects to HTTPS.

The game also works over plain HTTP (it has a fallback for `crypto.randomUUID`), but HTTPS is
recommended.

## 5. Check

- `https://deepreef.example.com/`: the game loads with 10,000 credits and the
  "Демо — виртуални кредити" badge.
- `https://deepreef.example.com/?faults=1`: the red fault-mode badge appears.
- Browser dev tools → Network: `assets/*.js` are served with
  `Cache-Control: public, max-age=31536000, immutable`, and `index.html` with `no-cache`.

## Updating

Repeat steps 1 and 3. Asset names change with their content and `index.html` is never cached,
so visitors get the new version on their next visit. Files from older builds can stay or be
deleted; nothing references them anymore.
