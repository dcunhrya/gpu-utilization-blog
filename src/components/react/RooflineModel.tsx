import { useMemo, useState } from 'react';

// Roofline: P = min(P_peak, I * bandwidth)
// Ridge point = P_peak / bandwidth (arithmetic intensity where we switch from memory to compute bound)
// Log-log plot: x = arithmetic intensity (FLOP/byte), y = performance (GFLOPS)

const WIDTH = 560;
const HEIGHT = 320;
const MARGIN = { top: 24, right: 24, bottom: 44, left: 52 };
const PLOT_W = WIDTH - MARGIN.left - MARGIN.right;
const PLOT_H = HEIGHT - MARGIN.top - MARGIN.bottom;

// Typical GPU ballpark: ~1.5 TB/s HBM, ~100+ TFLOPS → ridge ~67 FLOP/byte
const BANDWIDTH_GB_S = 900; // GB/s
const PEAK_TFLOPS_FP32 = 80;
const PEAK_TFLOPS_FP16 = 160; // fp16 often ~2x

const AI_MIN = 0.01;
const AI_MAX = 1000;
const PERF_MAX_FP32 = 100;
const PERF_MAX_FP16 = 200;

function logScale(x: number, min: number, max: number): number {
  const logMin = Math.log10(min);
  const logMax = Math.log10(max);
  return (Math.log10(x) - logMin) / (logMax - logMin);
}

function invLogScale(t: number, min: number, max: number): number {
  const logMin = Math.log10(min);
  const logMax = Math.log10(max);
  return Math.pow(10, logMin + t * (logMax - logMin));
}

export default function RooflineModel() {
  const [batchSize, setBatchSize] = useState(8);
  const [precision, setPrecision] = useState<'fp32' | 'fp16'>('fp32');

  const peakTFLOPS = precision === 'fp32' ? PEAK_TFLOPS_FP32 : PEAK_TFLOPS_FP16;
  const bandwidthGBs = precision === 'fp32' ? BANDWIDTH_GB_S : BANDWIDTH_GB_S * 1.5; // fp16 often higher effective BW
  const ridgePoint = (peakTFLOPS * 1000) / bandwidthGBs; // FLOP/byte

  // Arithmetic intensity increases with batch size (more reuse)
  const workloadAI = useMemo(() => {
    const t = (batchSize - 1) / 127; // 1..128 -> 0..1
    return invLogScale(t, 0.05, 500);
  }, [batchSize]);

  const workloadPerf = Math.min(
    (workloadAI * bandwidthGBs) / 1000,
    peakTFLOPS
  );

  const perfMax = precision === 'fp32' ? PERF_MAX_FP32 : PERF_MAX_FP16;

  const x = (v: number) => MARGIN.left + logScale(v, AI_MIN, AI_MAX) * PLOT_W;
  const y = (v: number) => MARGIN.top + PLOT_H - (v / perfMax) * PLOT_H;

  const ridgeX = x(ridgePoint);
  const ridgeY = y(peakTFLOPS);

  const roofPath = [
    `M ${x(AI_MIN)} ${y(Math.min((AI_MIN * bandwidthGBs) / 1000, peakTFLOPS))}`,
    `L ${x(ridgePoint)} ${ridgeY}`,
    `L ${x(AI_MAX)} ${ridgeY}`,
  ].join(' ');

  const workloadX = x(workloadAI);
  const workloadY = y(workloadPerf);
  const isMemoryBound = workloadAI < ridgePoint;

  const xTicks = [0.01, 0.1, 1, 10, 100, 1000].filter((v) => v >= AI_MIN && v <= AI_MAX);
  const yTicks = [10, 50, 100, 150, 200].filter((v) => v <= perfMax);

  return (
    <div className="my-8 rounded-xl border border-slate-200 bg-slate-50/80 p-6">
      <p className="mb-4 text-slate-700">
        Try dragging the <strong>Batch Size</strong> slider or adjusting <strong>Precision</strong> (that is discussed later on) below to see the Roofline Model in action.
        Notice how increasing the batch size shifts your workload to the right. You move out of
        the slanted <strong>Memory-Bound</strong> region, where you are limited by PCIe or VRAM
        bandwidth, and up into the flat <strong>Compute-Bound</strong> region, where you are
        finally maxing out the GPU&apos;s actual compute limit.
      </p>

      <figure className="overflow-x-auto" aria-label="Roofline model chart">
        <svg
          width={WIDTH}
          height={HEIGHT}
          className="mx-auto block"
          role="img"
        >
          <defs>
            <linearGradient id="memoryBound" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0%" stopColor="rgb(59, 130, 246)" stopOpacity="0.25" />
              <stop offset="100%" stopColor="rgb(59, 130, 246)" stopOpacity="0.05" />
            </linearGradient>
            <linearGradient id="computeBound" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="rgb(34, 197, 94)" stopOpacity="0.15" />
              <stop offset="100%" stopColor="rgb(34, 197, 94)" stopOpacity="0.05" />
            </linearGradient>
          </defs>

          {/* Memory-bound fill (under diagonal) */}
          <path
            fill="url(#memoryBound)"
            d={`M ${x(AI_MIN)} ${y(0)} L ${x(AI_MIN)} ${y((AI_MIN * bandwidthGBs) / 1000)} L ${x(ridgePoint)} ${ridgeY} L ${x(ridgePoint)} ${y(0)} Z`}
          />
          {/* Compute-bound fill (flat roof) */}
          <path
            fill="url(#computeBound)"
            d={`M ${x(ridgePoint)} ${y(0)} L ${x(ridgePoint)} ${ridgeY} L ${x(AI_MAX)} ${ridgeY} L ${x(AI_MAX)} ${y(0)} Z`}
          />

          {/* Roofline */}
          <path
            d={roofPath}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-slate-700"
          />

          {/* Ridge point marker */}
          <circle cx={ridgeX} cy={ridgeY} r="4" fill="currentColor" className="text-slate-600" />

          {/* Workload point */}
          <circle
            cx={workloadX}
            cy={workloadY}
            r="8"
            fill={isMemoryBound ? 'rgb(59, 130, 246)' : 'rgb(34, 197, 94)'}
            stroke="white"
            strokeWidth="2"
          />

          {/* Axis lines */}
          <line
            x1={MARGIN.left}
            y1={MARGIN.top}
            x2={MARGIN.left}
            y2={MARGIN.top + PLOT_H}
            stroke="currentColor"
            strokeWidth="1"
            className="text-slate-400"
          />
          <line
            x1={MARGIN.left}
            y1={MARGIN.top + PLOT_H}
            x2={MARGIN.left + PLOT_W}
            y2={MARGIN.top + PLOT_H}
            stroke="currentColor"
            strokeWidth="1"
            className="text-slate-400"
          />

          {/* X ticks */}
          {xTicks.map((v) => (
            <g key={v}>
              <line
                x1={x(v)}
                y1={MARGIN.top + PLOT_H}
                x2={x(v)}
                y2={MARGIN.top + PLOT_H + 4}
                stroke="currentColor"
                className="text-slate-400"
              />
              <text
                x={x(v)}
                y={MARGIN.top + PLOT_H + 18}
                textAnchor="middle"
                className="fill-slate-500 text-[10px]"
              >
                {v >= 1 ? v : v.toFixed(2)}
              </text>
            </g>
          ))}

          {/* Y ticks */}
          {yTicks.map((v) => (
            <g key={v}>
              <line
                x1={MARGIN.left - 4}
                y1={y(v)}
                x2={MARGIN.left}
                y2={y(v)}
                stroke="currentColor"
                className="text-slate-400"
              />
              <text
                x={MARGIN.left - 8}
                y={y(v) + 4}
                textAnchor="end"
                className="fill-slate-500 text-[10px]"
              >
                {v}
              </text>
            </g>
          ))}

          {/* Labels */}
          <text
            x={MARGIN.left + PLOT_W / 2}
            y={HEIGHT - 6}
            textAnchor="middle"
            className="fill-slate-600 text-xs font-medium"
          >
            Arithmetic Intensity (FLOP/byte) →
          </text>
          <text
            x={12}
            y={MARGIN.top + PLOT_H / 2}
            textAnchor="middle"
            className="fill-slate-600 text-xs font-medium"
            transform={`rotate(-90, 12, ${MARGIN.top + PLOT_H / 2})`}
          >
            Performance (TFLOPS) ↑
          </text>

          {/* Region labels */}
          <text
            x={x(Math.sqrt(AI_MIN * ridgePoint))}
            y={y((Math.sqrt(AI_MIN * ridgePoint) * bandwidthGBs) / 2000)}
            textAnchor="middle"
            className="fill-blue-600 text-[11px] font-medium"
          >
            Memory-bound
          </text>
          <text
            x={x(Math.sqrt(ridgePoint * AI_MAX))}
            y={ridgeY - 10}
            textAnchor="middle"
            className="fill-emerald-600 text-[11px] font-medium"
          >
            Compute-bound
          </text>
        </svg>
      </figure>

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Batch size: <span className="font-semibold text-slate-900">{batchSize}</span>
          </label>
          <input
            type="range"
            min={1}
            max={128}
            value={batchSize}
            onChange={(e) => setBatchSize(Number(e.target.value))}
            className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-slate-200 accent-slate-600"
          />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Precision
          </label>
          <div className="flex gap-4">
            {(['fp32', 'fp16'] as const).map((p) => (
              <label key={p} className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="precision"
                  checked={precision === p}
                  onChange={() => setPrecision(p)}
                  className="accent-slate-600"
                />
                <span className="text-sm text-slate-700">{p.toUpperCase()}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      <p className="mt-4 text-sm text-slate-600">
        Workload point: <strong>{workloadAI.toFixed(2)}</strong> FLOP/byte,{' '}
        <strong>{workloadPerf.toFixed(1)}</strong> TFLOPS —{' '}
        <span className={isMemoryBound ? 'text-blue-600' : 'text-emerald-600'}>
          {isMemoryBound ? 'Memory-bound' : 'Compute-bound'}
        </span>
      </p>
    </div>
  );
}
