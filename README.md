# AIFocused.dev

Bilingual Astro blog about AI engineering, pipelines, and practical workflows.

## Local development

Use Node.js 22.12 or later.

```sh
npm ci
npm run dev
npm run typecheck
npm run lint
npm run build
npm run preview
```

English pages use `/` and `/about/`. Russian pages use `/ru/` and `/ru/about/`.
The root follows the saved language, the browser language, then English.

## Articles

Copy `src/content/articles/ru/template.md` to a new Markdown file. Replace the title,
description, date, and translation key. Write the body below the front matter. Use
second-level headings for sections. Set `draft: false` to include the article in the site.
An optional `cover` accepts `src` and `alt`. For local assets, put the file in `public/`
and use a root-relative URL in `src`.

Use the same lowercase, hyphenated `translationKey` for the English version under
`src/content/articles/en/` and set its `locale` to `en`. The key becomes the URL slug.
The language selector links to the corresponding published version when it exists.

## GitHub Pages

The build produces `dist/`. Pushes and pull requests for `main` run checks and build
the site. Deployment runs only when **Build and deploy GitHub Pages** is started manually
from `main`.

When ready to publish, push `main`, select **GitHub Actions** as the source in the
repository's Pages settings, and configure `aifocused.dev` as the custom domain with
the corresponding DNS records. Then run the workflow. The Astro site URL and
`public/CNAME` are already set to `aifocused.dev`.
