import starlight from "@astrojs/starlight";
import { defineConfig, passthroughImageService } from "astro/config";
import starlightLinksValidator from "starlight-links-validator";
import { BASE, REPO, SITE } from "./scripts/lib/site.ts";

// https://fabiovincenzi.github.io/fairhour/ (GitHub Pages project site, served from /fairhour/).
export default defineConfig({
  site: SITE,
  base: BASE,
  // GitHub Pages serves `/page/` from `page/index.html` and redirects `/page` to `/page/`.
  trailingSlash: "always",
  // The site only has SVG artwork, so images need no processing: this keeps `sharp` (a native
  // dependency that pnpm would not expose to the build) out of the picture. Switch to the default
  // service, and add `sharp`, if raster screenshots are added.
  image: { service: passthroughImageService() },
  integrations: [
    starlight({
      title: "Fairhour",
      description:
        "Open-source, self-hostable time tracking that tells you exactly what to put on your invoice. Every hour, fairly billed.",
      logo: { src: "./src/assets/logo.svg", alt: "" },
      social: [{ icon: "github", label: "GitHub", href: REPO.url }],
      editLink: { baseUrl: `${REPO.url}/edit/${REPO.branch}/apps/docs/` },
      customCss: ["./src/styles/brand.css"],
      defaultLocale: "root",
      locales: {
        root: { label: "English", lang: "en" },
        it: { label: "Italiano", lang: "it" },
      },
      plugins: [
        starlightLinksValidator({
          // Pages that are not translated fall back to English by design.
          errorOnFallbackPages: false,
          // Absolute links to this very site are checked like internal links.
          sameSitePolicy: "validate",
        }),
      ],
      sidebar: [
        {
          label: "Getting started",
          translations: { it: "Per iniziare" },
          items: [{ autogenerate: { directory: "getting-started" } }],
        },
        {
          label: "User guide",
          translations: { it: "Guida utente" },
          items: [{ autogenerate: { directory: "guides" } }],
        },
        {
          label: "Self-hosting",
          items: [{ autogenerate: { directory: "self-hosting" } }],
        },
        {
          label: "Tax packs",
          translations: { it: "Pacchetti fiscali" },
          items: [{ autogenerate: { directory: "tax-packs" } }],
        },
        { label: "API", items: [{ autogenerate: { directory: "api" } }] },
        {
          label: "Contributing",
          translations: { it: "Contribuire" },
          collapsed: true,
          items: [{ autogenerate: { directory: "contributing" } }],
        },
        {
          label: "Architecture",
          translations: { it: "Architettura" },
          collapsed: true,
          items: [
            {
              label: "Design",
              translations: { it: "Progettazione" },
              items: [{ autogenerate: { directory: "design" } }],
            },
            {
              label: "Decision records (ADRs)",
              translations: { it: "Decisioni architetturali (ADR)" },
              items: [{ autogenerate: { directory: "adr" } }],
            },
          ],
        },
        {
          label: "Maintainers",
          translations: { it: "Manutentori" },
          collapsed: true,
          items: [{ autogenerate: { directory: "maintainers" } }],
        },
        { slug: "license", translations: { it: "Licenza" } },
      ],
    }),
  ],
});
