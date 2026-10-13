# Deploying the static demo to a cPanel subdomain

The public demo is a static site: `index.html`, an `assets/` folder and `.htaccess`. No
Node.js is needed on the server, because the game core runs in the browser (in-browser mock).

## 1. Build and package

```bash
npm ci
npm run package:web
```

This builds the site and writes `release/deep-reef-web-<commit>.zip`: paths use `/`,
directories are 755 and files 644, and the content is deterministic. Upload that file as is.

The build output it packs is `apps/web/dist/`:

```
dist/
├─ .htaccess          caching, compression, security headers (HTTPS redirect commented)
├─ index.html
└─ assets/            hashed JS/CSS chunks (react-*, index-*, createMockGameServer-*, Pixi renderers)
```

The build uses relative URLs (`base: './'`), so it works from a subdomain's root or from any
sub-folder, unchanged.

The archive holds the **contents** of `dist/` (`index.html` at the top level, `.htaccess`
included). Avoid zipping it by hand on Windows: PowerShell 5's `Compress-Archive` writes
backslashes in paths, which Linux extractors turn into broken file names.

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
2. `.htaccess` redirects HTTP to HTTPS, except `/.well-known/`, which certificate validation
   uses. On a host **without** a certificate, comment out the `<IfModule mod_rewrite.c>`
   block, or the site becomes unreachable.

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
