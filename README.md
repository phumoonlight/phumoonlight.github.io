# phumoonlight.github.io

Personal site. Next.js static export, built and deployed to GitHub Pages by Actions.

Live at **https://phumoonlight.github.io**

## Stack

- Next.js 16 (App Router, `output: "export"`)
- React 19 · TypeScript · Tailwind CSS 4
- three.js — the homepage globe

## Develop

```bash
npm install
npm run dev          # http://localhost:3000
```

## Build and deploy

```bash
npm run build        # -> out/
npm run preview      # serve out/ locally, as Pages will
```

Push to `master` and [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)
builds the site and uploads `out/` to Pages. No build output is committed —
`out/` is gitignored.

One-time repository setup: **Settings → Pages → Source: GitHub Actions**.

The workflow serves the artifact directly, so Jekyll never runs and no
`.nojekyll` file is needed. A custom domain, if you add one later, is configured
under Settings → Pages rather than with a `CNAME` file.

### Static export constraints

No SSR, API routes, middleware, ISR, or server actions. `next/image`
optimization is off (`images.unoptimized`), so images are served as authored.
Everything else — App Router, build-time RSC, client components, dynamic routes
via `generateStaticParams` — works normally.

## The globe

[`app/components/globe/`](app/components/globe/). Drag to rotate; it auto-spins
when idle and keeps momentum on release.

A low-poly, cartoon Earth. The continents come from a real land/sea mask, so the
shape stays recognisable, but nothing else is photographic — flat facets,
stepped coastlines, hand-picked colours.

[`planet.ts`](app/components/globe/planet.ts) builds the surface as a single
flat-shaded icosphere with per-vertex colours. `IcosahedronGeometry` is
non-indexed, so each triangle owns its three vertices and can be pushed to its
own radius and painted its own colour without splitting anything. Each face is
classified by sampling the mask at its centroid plus four neighbours — a face
whose surroundings disagree with it is a coast, which is where the beaches and
shallows come from. Small per-terrain radius steps then make the coastline read
as relief rather than as a painted line.

Note that three.js splits each icosahedron edge into `detail + 1` segments, so
the face count is 20 · (detail + 1)², not the 20 · 4^detail the name suggests.
Detail 14 is 4500 faces.

Clouds are clusters of squashed icospheres rather than a texture, with an
emissive floor so their undersides never darken into grey rocks. The atmosphere
is a thin backface fresnel shell, kept thin on purpose: a wide one reads as a
hard-edged donut, because a backside sphere cannot fade out past its own
silhouette.

Respects `prefers-reduced-motion` (drag still works, auto-spin stops), caps
device pixel ratio at 2, reframes the camera on resize, lifts the globe clear of
the copy in portrait, and falls back to a CSS sphere if WebGL is unavailable.

## Landmarks

Seven pins — US, Russia, Europe, Thailand, Japan, China, Australia. Click one and
the camera dives at it while a fade covers the swap to an isometric diorama: a
floating island carrying that country's landmark, orthographic camera, its own
sky palette and its own trees.

**The hash is the single source of truth.** `#japan` opens that diorama
directly, pin clicks and the back button only _write_ to the hash, and a
sync effect drives the scene from it. That makes every location linkable and
browser Back work without any extra bookkeeping.

| Route       | Landmark          | Route        | Landmark         |
| ----------- | ----------------- | ------------ | ---------------- |
| `#us`       | Statue of Liberty | `#japan`     | Mount Fuji       |
| `#russia`   | St Basil's        | `#china`     | Temple of Heaven |
| `#europe`   | Eiffel Tower      | `#australia` | Opera House      |
| `#thailand` | Wat Arun          |              |                  |

Landmarks live in [`landmarks.ts`](app/components/globe/landmarks.ts) and are
silhouette studies, not models — at diorama scale only the outline carries, so
the effort goes into proportion and colour. `LatheGeometry` does most of the
heavy lifting: revolving a 2D profile is the cheapest way to get onion domes,
temple spires and the Eiffel Tower's flare. The Opera House shells are sphere
wedges (`sail()` in [`parts.ts`](app/components/globe/parts.ts)) — narrow in phi
and deep in theta, since a wide wedge reads as a dome rather than a sail.

`latLonToVector3` in [`locations.ts`](app/components/globe/locations.ts) has to
invert the mask sampler exactly, or pins drift off their coastlines. Verified by
sampling the mask at all seven: six read as land, and two mid-ocean controls read
as ocean, which rules out an accidental alignment. Sydney reads as ocean because
it is coastal and the 1024×512 texel straddles the shoreline.

Each location declares its own `clearance` radius, because landmark footprints
differ enormously — Fuji's base is wider than the Eiffel Tower's entire diorama —
and props scattered without it land on top of the mountain.

### The one asset

`public/earth-land-mask.jpg` — 1024×512, single channel, **41 KB**. White over
land, black over ocean. Derived from the green channel of `three.js`'s
`earth_bump_roughness_clouds_4096.jpg`, originally
[NASA Visible Earth](https://visibleearth.nasa.gov/) imagery (public domain).

It is read once into a canvas at startup and sampled per face; nothing is
uploaded to the GPU as a texture. The realistic version needed four photographic
maps totalling 632 KB.
