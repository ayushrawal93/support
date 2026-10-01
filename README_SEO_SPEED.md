# FV4 — HTML + Lightweight Node/Express SEO/Speed Build

This build keeps the existing HTML/CSS/JS + Node/Express architecture and optimizes delivery rather than introducing React, Angular, or Next.js.

## What changed

- Public page remains server-delivered HTML.
- Removed AOS JavaScript/CSS from the critical path and removed `data-aos` attributes so content is visible immediately.
- Swiper is lazy-loaded only when the testimonials section approaches the viewport.
- Raster images were converted to WebP and the unused banner image was removed.
- Added Brotli/GZIP precompressed assets and server-side content-encoding selection without adding a compression runtime dependency.
- Added long-lived immutable caching for static assets.
- Added stronger canonical, robots, Open Graph, Twitter, WebSite/WebPage structured data, sitemap and robots rules for `https://assignmenthelp.site/`.
- Removed unused CORS and express-rate-limit dependencies from the package manifests.
- Prevented public access to backend source, package manifests, environment files and Git data.
- Added `site.webmanifest` and a small PNG favicon.
- Made the assignment form initialization safe even if JavaScript is delivered after `DOMContentLoaded`.

## Railway

Use the extracted files directly in the GitHub repository root. Do not upload this ZIP as the only repository file.

Recommended Railway settings:

- Build Command: empty
- Start Command: `npm start`
- Root Directory: `/`
- Node: 18+

## Important SEO note

The source still contains some restaurant-template wording/content in lower sections because this optimization pass is intentionally technical and layout-preserving. For stronger topical relevance for Assignment Help, replace those remaining restaurant/menu/testimonial/footer phrases with unique, genuinely useful assignment-help content and create dedicated service pages. That content work is separate from the speed conversion.
