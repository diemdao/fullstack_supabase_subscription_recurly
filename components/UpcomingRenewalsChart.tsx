import type { ChartBucket } from '@/lib/subscriptions';
import { formatWholeCurrency } from '@/lib/utils';
import clsx from 'clsx';
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import Svg, { Line } from 'react-native-svg';

interface UpcomingRenewalsChartProps {
  data: ChartBucket[];
  /** Caption above the headline figure, e.g. "Due this week". */
  totalLabel: string;
  /** Shown in place of the tap hint when nothing is due in the range. */
  emptyMessage: string;
}

/** Pixel height of the tallest bar. */
const TRACK_HEIGHT = 150;
/** Bars with nothing due still show a sliver so the day stays tappable. */
const EMPTY_BAR_HEIGHT = 4;
/** Reserve for the weekday label + its margin, used to float the tooltip. */
const LABEL_BLOCK = 26;
/** Headroom above the tallest bar so the tooltip is never clipped. */
const TOOLTIP_SPACE = 42;
/** Left gutter reserved for the axis value labels. */
const AXIS_GUTTER = 40;
/** Height of a gridline row, so `items-center` lands the 1px rule on target. */
const GRID_ROW_HEIGHT = 12;
/** Roughly how many gridlines to aim for above the baseline. */
const TARGET_TICKS = 4;
/**
 * Gridlines are drawn with react-native-svg rather than a dashed View border:
 * a single-side dashed border renders solid on Android, so the dashes would
 * silently disappear on half the devices.
 */
const GRID_STROKE = 'rgba(0, 0, 0, 0.16)';
const AXIS_STROKE = 'rgba(0, 0, 0, 0.32)';
const DASH_PATTERN = '4 5';

/** Snaps a raw interval up to a readable 1 / 2 / 2.5 / 5 / 10 multiple. */
const niceStep = (rawStep: number): number => {
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const snapped =
    normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
  return snapped * magnitude;
};

/**
 * Builds a readable value axis: evenly spaced ticks on round numbers, with a
 * maximum at or just above the tallest bar. Rounding only the ceiling would
 * leave quarter-step labels like $13 and $38, which defeats the purpose.
 */
const buildAxis = (max: number): { axisMax: number; ticks: number[] } => {
  if (max <= 0) return { axisMax: 0, ticks: [0] };

  const step = niceStep(max / TARGET_TICKS);
  const axisMax = Math.ceil(max / step) * step;

  const ticks: number[] = [];
  for (let value = 0; value <= axisMax + step / 1000; value += step) {
    ticks.push(Number(value.toFixed(4)));
  }
  return { axisMax, ticks };
};

const UpcomingRenewalsChart = ({
  data,
  totalLabel,
  emptyMessage,
}: UpcomingRenewalsChartProps) => {
  const maxTotal = Math.max(...data.map((bucket) => bucket.total), 0);
  // Bars are measured against the rounded axis top, so the gridlines mean something.
  const { axisMax, ticks } = React.useMemo(() => buildAxis(maxTotal), [maxTotal]);

  // Preselect the busiest day so the chart opens with something highlighted
  // rather than looking inert.
  const busiestIndex = React.useMemo(() => {
    if (maxTotal <= 0) return null;
    return data.findIndex((bucket) => bucket.total === maxTotal);
  }, [data, maxTotal]);

  const [selectedIndex, setSelectedIndex] = React.useState<number | null>(busiestIndex);

  // Re-point the selection when the underlying data changes shape.
  React.useEffect(() => {
    setSelectedIndex(busiestIndex);
  }, [busiestIndex]);

  const weekTotal = data.reduce((sum, bucket) => sum + bucket.total, 0);

  return (
    <View className="chart-card">
      <Text className="chart-total-label">{totalLabel}</Text>
      <Text className="chart-total-value">{formatWholeCurrency(weekTotal)}</Text>

      <View
        className="chart-plot"
        style={{ height: TRACK_HEIGHT + LABEL_BLOCK + TOOLTIP_SPACE }}
      >
        {/* Drawn first so the bars paint over them. */}
        <View className="absolute left-0 right-0 top-0 bottom-0" pointerEvents="none">
          {ticks.map((tick) => {
            const fraction = axisMax > 0 ? tick / axisMax : 0;
            return (
              <View
                key={tick}
                className="chart-grid-row"
                style={{
                  height: GRID_ROW_HEIGHT,
                  bottom: LABEL_BLOCK + fraction * TRACK_HEIGHT - GRID_ROW_HEIGHT / 2,
                }}
              >
                <Text className="chart-grid-label">{formatWholeCurrency(tick)}</Text>
                <View className="chart-grid-line">
                  <Svg width="100%" height={1}>
                    <Line
                      x1="0"
                      y1={0.5}
                      x2="100%"
                      y2={0.5}
                      stroke={tick === 0 ? AXIS_STROKE : GRID_STROKE}
                      strokeWidth={1}
                      strokeDasharray={DASH_PATTERN}
                    />
                  </Svg>
                </View>
              </View>
            );
          })}
        </View>

        <View className="chart-row" style={{ paddingLeft: AXIS_GUTTER }}>
        {data.map((bucket, index) => {
          const isSelected = selectedIndex === index;
          const hasRenewals = bucket.total > 0;
          const barHeight =
            hasRenewals && axisMax > 0
              ? Math.max(EMPTY_BAR_HEIGHT, (bucket.total / axisMax) * TRACK_HEIGHT)
              : EMPTY_BAR_HEIGHT;

          return (
            <Pressable
              key={bucket.key}
              className="chart-column"
              // Tapping the highlighted bar clears it, so the tooltip can be dismissed.
              onPress={() => setSelectedIndex(isSelected ? null : index)}
              accessibilityRole="button"
              accessibilityLabel={
                hasRenewals
                  ? `${bucket.label}, ${formatWholeCurrency(bucket.total)} across ${bucket.count} ${
                      bucket.count === 1 ? 'subscription' : 'subscriptions'
                    }`
                  : `${bucket.label}, nothing due`
              }
            >
              {isSelected && (
                <View
                  className="chart-tooltip-anchor"
                  style={{ bottom: barHeight + LABEL_BLOCK + 8 }}
                  pointerEvents="none"
                >
                  <View className="chart-tooltip">
                    <Text className="chart-tooltip-text">{formatWholeCurrency(bucket.total)}</Text>
                  </View>
                  <View className="chart-tooltip-arrow" />
                </View>
              )}

              <View
                className={clsx(
                  'chart-bar',
                  !hasRenewals && 'chart-bar-empty',
                  hasRenewals && isSelected && 'chart-bar-active'
                )}
                style={{ height: barHeight }}
              />

              <Text
                className={clsx(
                  'chart-day',
                  bucket.isCurrent && 'chart-day-today',
                  isSelected && 'chart-day-active'
                )}
              >
                {bucket.label}
              </Text>
            </Pressable>
          );
        })}
        </View>
      </View>

      <Text className="chart-caption">
        {weekTotal > 0
          ? 'Tap a bar to see its exact total.'
          : emptyMessage}
      </Text>
    </View>
  );
};

export default UpcomingRenewalsChart;
