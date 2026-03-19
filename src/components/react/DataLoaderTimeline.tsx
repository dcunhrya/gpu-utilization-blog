/**
 * Training loop timeline simulation: computes CPU and GPU block times
 * for 12 batches given num_workers and prefetch_factor.
 * Uses variable CPU prep times (I/O spikes on batches 4, 7, 11) so that
 * prefetch_factor visibly affects GPU idle: low prefetch → GPU starves during spikes.
 */

const CPU_PREP_BASE_MS = 150;
const CPU_PREP_SPIKE_MS = 800;
const GPU_COMPUTE_MS = 100;
const TOTAL_BATCHES = 12;

/** Batches with deterministic I/O spikes (slow disk, network hiccup, etc.) */
const IO_SPIKE_BATCHES = new Set([4, 7, 11]);

function getCpuPrepMs(batchIndex: number): number {
  return IO_SPIKE_BATCHES.has(batchIndex) ? CPU_PREP_SPIKE_MS : CPU_PREP_BASE_MS;
}

export interface Block {
  batchIndex: number; // 1..12
  startMs: number;
  endMs: number;
}

export interface TimelineResult {
  cpuBlocks: Block[];
  gpuBlocks: Block[];
  totalEpochMs: number;
  gpuComputeMs: number;
  /** Row label per "lane": GPU, then Main Process or Worker 1, 2, ... */
  cpuRowLabels: string[];
  /** For each batch 1..12, which CPU row index (0 = first CPU row) */
  batchToCpuRow: number[];
}

function computeTimeline(numWorkers: number, prefetchFactor: number): TimelineResult {
  const cpuBlocks: Block[] = [];
  const gpuBlocks: Block[] = [];
  const batchToCpuRow: number[] = [];

  if (numWorkers === 0) {
    // Sequential: Main process does CPU then GPU for each batch (variable CPU prep)
    const cpuRowLabels = ['Main Process'];
    let gpuEndPrev = 0;
    for (let b = 1; b <= TOTAL_BATCHES; b++) {
      const prepMs = getCpuPrepMs(b);
      const cpuStart = gpuEndPrev;
      const cpuEnd = cpuStart + prepMs;
      const gpuStart = cpuEnd;
      const gpuEnd = gpuStart + GPU_COMPUTE_MS;
      gpuEndPrev = gpuEnd;
      cpuBlocks.push({ batchIndex: b, startMs: cpuStart, endMs: cpuEnd });
      gpuBlocks.push({ batchIndex: b, startMs: gpuStart, endMs: gpuEnd });
      batchToCpuRow[b - 1] = 0;
    }
    const lastGpu = gpuBlocks[TOTAL_BATCHES - 1];
    return {
      cpuBlocks,
      gpuBlocks,
      totalEpochMs: lastGpu.endMs,
      gpuComputeMs: TOTAL_BATCHES * GPU_COMPUTE_MS,
      cpuRowLabels,
      batchToCpuRow,
    };
  }

  // Parallel workers: assign batch b to worker (b-1) % numWorkers.
  // prefetch_factor = max batches a worker can have "in flight" (prepared, not yet taken by GPU).
  // Worker can start next batch when: finished previous AND (in_flight < prefetch_factor).
  // So when starting k-th batch we need: if k <= prefetch_factor, start at cpuEnd[prevB];
  // else wait until GPU has started our (k - prefetch_factor)-th batch → gpuStart[b - prefetch_factor * numWorkers].
  const cpuRowLabels = Array.from({ length: numWorkers }, (_, i) => `Worker ${i + 1}`);
  const cpuStart: number[] = [];
  const cpuEnd: number[] = [];
  const gpuStart: number[] = [];
  const gpuEnd: number[] = [];

  for (let b = 1; b <= TOTAL_BATCHES; b++) {
    const w = (b - 1) % numWorkers;
    const prevB = b - numWorkers; // previous batch of same worker (or <= 0)
    const k = Math.floor((b - 1 - w) / numWorkers) + 1; // 1-based index of this batch among worker's batches

    if (prevB <= 0) {
      cpuStart[b] = 0;
    } else if (k <= prefetchFactor) {
      // Can have up to prefetch_factor in flight; start next as soon as previous finishes
      cpuStart[b] = cpuEnd[prevB];
    } else {
      // Must wait until GPU has taken one of our batches so in_flight < prefetch_factor
      const bFree = b - prefetchFactor * numWorkers;
      if (bFree >= 1) {
        cpuStart[b] = Math.max(cpuEnd[prevB], gpuStart[bFree]);
      } else {
        cpuStart[b] = cpuEnd[prevB];
      }
    }
    cpuEnd[b] = cpuStart[b] + getCpuPrepMs(b);

    const prevGpuEnd = b === 1 ? 0 : gpuEnd[b - 1];
    gpuStart[b] = Math.max(cpuEnd[b], prevGpuEnd);
    gpuEnd[b] = gpuStart[b] + GPU_COMPUTE_MS;

    cpuBlocks.push({ batchIndex: b, startMs: cpuStart[b], endMs: cpuEnd[b] });
    gpuBlocks.push({ batchIndex: b, startMs: gpuStart[b], endMs: gpuEnd[b] });
    batchToCpuRow[b - 1] = w;
  }

  const totalEpochMs = gpuEnd[TOTAL_BATCHES];
  return {
    cpuBlocks,
    gpuBlocks,
    totalEpochMs,
    gpuComputeMs: TOTAL_BATCHES * GPU_COMPUTE_MS,
    cpuRowLabels,
    batchToCpuRow,
  };
}

// --- Component ---

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';

const ROW_HEIGHT = 44;
const LABEL_WIDTH = 152;
const LABEL_AND_GAP = 160; // label width + gap so chart width = container - this
const BLOCK_MIN_WIDTH = 8; // small min so blocks don't overlap when scaled to fit

export default function DataLoaderTimeline() {
  const [numWorkers, setNumWorkers] = useState(0);
  const [prefetchFactor, setPrefetchFactor] = useState(2);
  const [chartWidthPx, setChartWidthPx] = useState(600);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width } = entries[0]?.contentRect ?? {};
      if (typeof width === 'number' && width > 0) {
        setChartWidthPx(Math.max(200, width - LABEL_AND_GAP));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const timeline = useMemo(
    () => computeTimeline(numWorkers, numWorkers === 0 ? 2 : prefetchFactor),
    [numWorkers, prefetchFactor]
  );

  const { totalEpochMs, gpuComputeMs, cpuBlocks, gpuBlocks, cpuRowLabels, batchToCpuRow } = timeline;
  const gpuUtilization = (gpuComputeMs / totalEpochMs) * 100;

  // Scale time to chart width so full timeline fits without horizontal scroll
  const x = (ms: number) => (ms / totalEpochMs) * chartWidthPx;
  const blockWidthPx = (start: number, end: number) =>
    Math.max(BLOCK_MIN_WIDTH, x(end) - x(start));

  // GPU idle segments: gaps on GPU row between gpu blocks
  const gpuIdleSegments: { startMs: number; endMs: number }[] = [];
  let t = 0;
  for (const block of gpuBlocks) {
    if (block.startMs > t) gpuIdleSegments.push({ startMs: t, endMs: block.startMs });
    t = block.endMs;
  }

  const tickCount = Math.ceil(totalEpochMs / 1000) || 1;
  const tickWidthPx = chartWidthPx / tickCount;

  return (
    <div className="my-8 rounded-xl border border-slate-200 bg-slate-50/80 p-6">
      {/* Header: sliders */}
      <div className="mb-6 grid gap-6 sm:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            num_workers: <span className="font-semibold text-slate-900">{numWorkers}</span>
          </label>
          <input
            type="range"
            min={0}
            max={8}
            value={numWorkers}
            onChange={(e) => setNumWorkers(Number(e.target.value))}
            className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-slate-200 accent-slate-600"
          />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            prefetch_factor: <span className="font-semibold text-slate-900">{prefetchFactor}</span>
          </label>
          <input
            type="range"
            min={1}
            max={4}
            value={prefetchFactor}
            onChange={(e) => setPrefetchFactor(Number(e.target.value))}
            disabled={numWorkers === 0}
            className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-slate-200 accent-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
          />
          {numWorkers === 0 && (
            <p className="mt-1 text-xs text-slate-500">Disabled when num_workers is 0</p>
          )}
        </div>
      </div>

      {/* Stats bar */}
      <div className="mb-4 flex flex-wrap gap-6 rounded-lg bg-white px-4 py-3 shadow-sm ring-1 ring-slate-200">
        <div>
          <span className="text-sm text-slate-500">Total Epoch Time</span>
          <p className="text-lg font-semibold text-slate-800">{totalEpochMs} ms</p>
        </div>
        <div>
          <span className="text-sm text-slate-500">GPU Utilization</span>
          <p
            className={`text-lg font-semibold ${
              gpuUtilization < 50
                ? 'text-red-600'
                : gpuUtilization >= 90
                  ? 'text-green-600'
                  : 'text-slate-800'
            }`}
          >
            {gpuUtilization.toFixed(1)}%
          </p>
        </div>
      </div>

      {/* Gantt chart - fills container width, no horizontal scroll */}
      <div ref={containerRef} className="w-full rounded-lg border border-slate-200 bg-white p-4">
        {/* Time axis */}
        <div className="mb-1 flex items-center gap-2 border-b border-slate-200 pb-1">
          <div style={{ width: LABEL_WIDTH }} className="shrink-0" aria-hidden />
          <div
            className="flex shrink-0 border-slate-200"
            style={{ width: chartWidthPx }}
          >
            {Array.from({ length: tickCount }, (_, i) => i).map((s) => (
              <div
                key={s}
                className="shrink-0 text-xs text-slate-500"
                style={{ width: tickWidthPx }}
              >
                {s}s
              </div>
            ))}
          </div>
        </div>

        {/* GPU row */}
        <div className="flex items-center gap-2" style={{ height: ROW_HEIGHT }}>
          <div
            className="flex shrink-0 items-center justify-end pr-2 text-sm font-medium text-slate-700"
            style={{ width: LABEL_WIDTH }}
          >
            GPU
          </div>
          <div
            className="relative shrink-0 overflow-hidden rounded"
            style={{ height: ROW_HEIGHT - 4, width: chartWidthPx }}
          >
              {/* Idle (striped red) */}
              {gpuIdleSegments.map((seg) => (
                <motion.div
                  key={`idle-${seg.startMs}`}
                  className="absolute inset-y-0 rounded"
                  style={{
                    left: x(seg.startMs),
                    width: x(seg.endMs) - x(seg.startMs),
                    minWidth: 2,
                    background:
                      'repeating-linear-gradient( -45deg, #fecaca, #fecaca 4px, #fca5a5 4px, #fca5a5 8px )',
                  }}
                  layout
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                />
              ))}
              {/* GPU blocks */}
              {gpuBlocks.map((block) => (
                <motion.div
                  key={`gpu-${block.batchIndex}`}
                  className="absolute inset-y-0 flex items-center justify-center rounded bg-emerald-500 font-medium text-white shadow-sm overflow-hidden"
                  style={{
                    left: x(block.startMs),
                    width: blockWidthPx(block.startMs, block.endMs),
                    minWidth: BLOCK_MIN_WIDTH,
                    fontSize: 10,
                  }}
                  layout
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                  title={`Batch ${block.batchIndex}`}
                >
                  <span className="truncate px-0.5">B{block.batchIndex}</span>
                </motion.div>
              ))}
            </div>
          </div>

        {/* CPU rows */}
        {cpuRowLabels.map((label, rowIndex) => (
          <div
            key={label}
            className="flex items-center gap-2"
            style={{ height: ROW_HEIGHT }}
          >
            <div
              className="flex shrink-0 items-center justify-end pr-2 text-sm font-medium text-slate-700"
              style={{ width: LABEL_WIDTH }}
            >
              {label}
            </div>
            <div
              className="relative shrink-0 overflow-hidden rounded"
              style={{ height: ROW_HEIGHT - 4, width: chartWidthPx }}
            >
                {cpuBlocks
                  .filter((_, i) => batchToCpuRow[i] === rowIndex)
                  .map((block) => (
                    <motion.div
                      key={`cpu-${block.batchIndex}`}
                      className="absolute inset-y-0 flex items-center justify-center rounded bg-blue-500 font-medium text-white shadow-sm overflow-hidden"
                      style={{
                        left: x(block.startMs),
                        width: blockWidthPx(block.startMs, block.endMs),
                        minWidth: BLOCK_MIN_WIDTH,
                        fontSize: 10,
                      }}
                      layout
                      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                      title={`Batch ${block.batchIndex}`}
                    >
                      <span className="truncate px-0.5">B{block.batchIndex}</span>
                    </motion.div>
                  ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
