# An Interactive Guide to GPU Utilization

This repository is the source for a **long-form, interactive article** about keeping GPUs busy in deep learning workflows. It is written for researchers and engineers who use PyTorch day to day and want a clear mental model of **why** training or inference feels slow—and **what** to change first (most of the time without touching CUDA).

The published site is a **single scrolling page** with a table of contents, prose sections, and embedded visuals you can explore (charts, timelines, and similar components) so ideas like the CPU–GPU pipeline, PCIe transfers, and utilization metrics are easier to reason about than in a static PDF alone.

## Live site

**[https://dcunhrya.github.io/gpu-utilization-blog/](https://dcunhrya.github.io/gpu-utilization-blog/)**

*(If the link is not live yet, the site is deployed from this repo via GitHub Pages.)*

## What you’ll find

The piece walks from high-level hardware intuition to practical PyTorch-oriented guidance:

1. **Introduction** — Why GPU efficiency matters in modern ML and how CPU-side work can leave the GPU idle.  
2. **GPU overview** — CPUs vs GPUs, VRAM, caches, the PCIe bridge, and how to read utilization and memory metrics.  
3. **The bottleneck** — How the CPU–GPU split shows up in practice, including the **roofline** idea (memory-bound vs compute-bound regimes) with an interactive visualization.  
4. **Optimizing the data pipeline** — Keeping the GPU fed: monitoring, `DataLoader` workers, pinning memory, and related choices.  
5. **Compute and memory on the GPU** — Model-side levers that affect how hard the device works and how data moves.  
6. **Conclusion** — Takeaways that tie the threads together.  
7. **References** — Citations and further reading.

## Authors

- **Ryan D’Cunha** — Stanford University  
- **Jason Fries**

## About the implementation

The article is authored as **MDX** (Markdown with interactive components), built as a static site with **Astro**, and styled with **Tailwind CSS**. Charts and other interactive pieces use **React** where needed. The same content powers both local development and the GitHub Pages deployment in `.github/workflows/`.

If you are looking to **edit** the article or **run** the project locally, the section files live under `src/content/sections/`; the entry page is `src/pages/index.astro`.
