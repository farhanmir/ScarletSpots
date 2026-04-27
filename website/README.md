# ScarletSpots Website

Public marketing site plus privacy and terms pages for ScarletSpots.

## Stack

- Vite
- React
- Framer Motion

## Run locally

```bash
cd website
npm install
npm run dev
```

Build for release:

```bash
npm run build
```

## Important files

- `src/App.jsx`
  Landing page content and CTA wiring.
- `src/index.css`
  Global reset and tokens.
- `index.html`
  Title, meta description, canonical URL, and Open Graph tags.
- `public/privacy.html`
- `public/terms.html`
- `public/robots.txt`
- `public/sitemap.xml`

## Important note

`src/App.jsx` still uses a generic `https://apps.apple.com` placeholder as the App Store link. Replace it with the real listing before launch.

Last reviewed: 2026-04-26
