# GPU Utilization Research Blog

A research blog on GPU utilization in deep learning, built with **Astro**, **React**, **MDX**, and **Tailwind CSS**.

## Structure

- **Sections** live in `src/content/sections/` as numbered MDX files (e.g. `01-introduction.mdx`). Edit these to write the blog.
- **Single-page layout**: All sections are composed in order on the index page with a sticky table of contents in the sidebar.
- **Interactive components**: Use `<Callout type="tip">`, `<Callout type="warning">`, etc., and `<CodeBlock lang="python">` in your MDX; they are wired globally.

## Commands

| Command        | Action                                      |
|----------------|---------------------------------------------|
| `npm run dev`  | Start dev server at `localhost:4321`        |
| `npm run build`| Build static site to `./dist/`              |
| `npm run preview` | Preview the production build locally    |

## Deploy to GitHub Pages

This repo includes [`.github/workflows/deploy-github-pages.yml`](.github/workflows/deploy-github-pages.yml). It builds with Astro’s [`site`](https://docs.astro.build/en/reference/configuration-reference/#site) and [`base`](https://docs.astro.build/en/reference/configuration-reference/#base) set from the repository name so the site works both as a **user/org site** (`username.github.io`) and as a **project site** (`username.github.io/repo-name/`).

1. Push this project as a GitHub repository (`.github/` must sit at the **repository root**). If this app lives in a subfolder of a larger repo, move the workflow to the repo root and add `defaults.run.working-directory` pointing at that folder on all `run` steps, or keep a separate repo for the site.
2. In the repo on GitHub: **Settings → Pages → Build and deployment**, set **Source** to **GitHub Actions**.
3. Push to `main` or `master` (or run the workflow manually). The site URL appears in the workflow run and under Pages settings.

To preview a project-page build locally (replace `your-repo` with the GitHub repo name):

```bash
SITE_URL=https://your-username.github.io BASE_PATH=/your-repo/ npm run build && npm run preview
```

## Sections (in order)

1. Introduction  
2. GPU Overview
3. What is the GPU Bottleneck?  
4. Optimizing Dataloaders  
5. Optimizing the Model  
6. Profiling  

To reorder or add sections, add or rename MDX files in `src/content/sections/` and set the `order` field in frontmatter if needed.
