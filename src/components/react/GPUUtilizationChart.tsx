/**
 * W&B-style GPU utilization chart: sawtooth (bottleneck) or optimized (steady ~95%).
 * Same Roofline-style container (light) for both variants.
 */

import { useMemo } from 'react';
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const STEPS = 100;
const IDLE_STEPS = 5; // CPU loading data
const SPIKE_STEPS = 2; // GPU computing
const CYCLE = IDLE_STEPS + SPIKE_STEPS;
const NOISE = 2; // ±2%

function noise(): number {
  return (Math.random() - 0.5) * 2 * NOISE;
}

function generateSawtoothData(): { step: number; utilization: number }[] {
  const data: { step: number; utilization: number }[] = [];
  for (let step = 0; step < STEPS; step++) {
    const posInCycle = step % CYCLE;
    let util: number;
    if (posInCycle < IDLE_STEPS) {
      util = 0 + noise();
    } else {
      util = 98 + (Math.random() * 4 - 2); // 96–100% with slight variation
    }
    data.push({
      step,
      utilization: Math.max(0, Math.min(100, Math.round(util * 10) / 10)),
    });
  }
  return data;
}

/** Steady ~95% utilization with slight oscillations between 90–100% (optimized pipeline). */
function generateOptimizedData(): { step: number; utilization: number }[] {
  const data: { step: number; utilization: number }[] = [];
  for (let step = 0; step < STEPS; step++) {
    const util = 95 + (Math.random() * 10 - 5); // 90–100, centered at 95
    data.push({
      step,
      utilization: Math.max(90, Math.min(100, Math.round(util * 10) / 10)),
    });
  }
  return data;
}

const CHART_COLOR = '#22d3ee'; // vibrant cyan (W&B style)
const CHART_COLOR_DARK = '#06b6d4';

interface TooltipPayloadItem {
  payload?: { step: number; utilization: number };
  value?: number;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: number;
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload?.length || payload[0].payload == null) return null;
  const { step, utilization } = payload[0].payload;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-lg ring-1 ring-slate-200">
      <div className="text-xs text-slate-500">Step: {step}</div>
      <div
        className="text-sm font-bold"
        style={{ color: CHART_COLOR }}
      >
        Volatile GPU-Util: {utilization}%
      </div>
    </div>
  );
}

export type GPUUtilizationChartVariant = 'sawtooth' | 'optimized';

const AXIS_LIGHT = { stroke: 'rgb(100 116 139)', fill: 'rgb(71 85 105)' };

export default function GPUUtilizationChart({
  variant = 'sawtooth',
}: {
  variant?: GPUUtilizationChartVariant;
}) {
  const gradientId = `gpuUtilFill-${variant}`;
  const axis = AXIS_LIGHT;
  const data = useMemo(
    () => (variant === 'optimized' ? generateOptimizedData() : generateSawtoothData()),
    [variant]
  );

  const containerClass = 'my-8 rounded-xl border border-slate-200 bg-slate-50/80 p-6';

  return (
    <div className={containerClass}>
      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart
            data={data}
            margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CHART_COLOR} stopOpacity={0.4} />
                <stop offset="100%" stopColor={CHART_COLOR_DARK} stopOpacity={0.08} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="step"
              type="number"
              domain={[0, STEPS - 1]}
              tickCount={6}
              axisLine={{ stroke: axis.stroke }}
              tick={{ fill: axis.fill, fontSize: 11 }}
              tickLine={false}
              hide={false}
              label={{
                value: 'Steps',
                position: 'insideBottom',
                offset: -4,
                fill: axis.fill,
                fontSize: 12,
              }}
            />
            <YAxis
              domain={[0, 100]}
              axisLine={{ stroke: axis.stroke }}
              tick={{ fill: axis.fill, fontSize: 11 }}
              tickLine={false}
              width={36}
              label={{
                value: 'GPU Utilization (%)',
                angle: -90,
                position: 'insideLeft',
                fill: axis.fill,
                fontSize: 12,
              }}
            />
            <Tooltip
              content={<CustomTooltip />}
              cursor={{ stroke: axis.stroke, strokeWidth: 1 }}
            />
            <Area
              type="monotone"
              dataKey="utilization"
              stroke={CHART_COLOR}
              strokeWidth={2}
              fill={`url(#${gradientId})`}
              isAnimationActive={true}
              animationDuration={800}
              activeDot={{
                r: 5,
                fill: CHART_COLOR,
                stroke: 'rgb(248 250 252)',
                strokeWidth: 2,
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
