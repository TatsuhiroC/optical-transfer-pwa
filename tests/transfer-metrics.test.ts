import { expect, it } from 'vitest';
import { formatBytes, formatDuration, formatRate, ReceptionEstimator } from '../src/transfer-metrics';

it('uses readable byte units at the actual unit boundaries', () => {
  expect(formatBytes(0)).toBe('0 B');
  expect(formatBytes(1023)).toBe('1023 B');
  expect(formatBytes(1024)).toBe('1.0 KB');
  expect(formatBytes(1024 ** 2)).toBe('1.0 MB');
  expect(formatBytes(7000 * 1024)).toBe('6.8 MB');
  expect(formatBytes(64 * 1024 ** 2)).toBe('64.0 MB');
  expect(formatBytes(1024 ** 3)).toBe('1.0 GB');
  expect(formatRate(0)).toBe('0.0 KB/s');
  expect(formatRate(30 * 1024)).toBe('30.0 KB/s');
  expect(formatRate(2 * 1024 ** 2)).toBe('2.0 MB/s');
});

it('formats seconds, minutes and hours without rounding ETA down to zero', () => {
  expect(formatDuration(0)).toBe('0:00');
  expect(formatDuration(0.1)).toBe('0:01');
  expect(formatDuration(61)).toBe('1:01');
  expect(formatDuration(3661)).toBe('1:01:01');
});

it('warms up, ignores duplicates, and estimates the remaining frame arrivals', () => {
  const meter = new ReceptionEstimator();
  expect(meter.estimate(0, 100).state).toBe('estimating');
  meter.record(0, 1); meter.record(500, 1);
  expect(meter.estimate(500, 100).state).toBe('estimating');
  for (let i = 1; i <= 10; i++) meter.record(i * 100, i + 1);
  expect(meter.estimate(1000, 100)).toEqual({ state: 'remaining', framesPerSecond: 10, seconds: 8.9 });
  // More scans of the same frame must not make ETA faster.
  meter.record(1000, 11);
  expect(meter.estimate(1000, 100).seconds).toBe(8.9);
});

it('waits through a gap and discards the old rate when arrivals resume', () => {
  const meter = new ReceptionEstimator();
  for (let i = 0; i <= 10; i++) meter.record(i * 100, i + 1);
  expect(meter.estimate(2600, 100)).toEqual({ state: 'waiting', framesPerSecond: 0 });
  meter.record(5000, 12);
  expect(meter.estimate(5000, 100).state).toBe('estimating');
  for (let i = 1; i <= 10; i++) meter.record(5000 + i * 100, 12 + i);
  expect(meter.estimate(6000, 100).framesPerSecond).toBe(10);
});

it('adapts to a new reception rate rather than averaging the entire transfer', () => {
  const meter = new ReceptionEstimator();
  for (let i = 0; i <= 100; i++) meter.record(i * 100, i + 1); // 10 fps
  for (let i = 1; i <= 40; i++) meter.record(10000 + i * 250, 101 + i); // 4 fps
  expect(meter.estimate(20000, 200).framesPerSecond).toBe(4);
});

it('does not promise zero time when fountain decoding needs additional frames', () => {
  const meter = new ReceptionEstimator();
  for (let i = 0; i <= 10; i++) meter.record(i * 100, i + 1);
  expect(meter.estimate(1000, 10).state).toBe('extra');
  expect(meter.estimate(1000, 10).seconds).toBeUndefined();
  meter.reset();
  expect(meter.estimate(1000, 10)).toEqual({ state: 'estimating', framesPerSecond: null });
});
