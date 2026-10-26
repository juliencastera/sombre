import type { CDPSession, Page } from '@playwright/test';
import { PIXEL_STRIDE, THRESHOLDS } from '../config.ts';
import { decodePng, meanLightness } from './image.ts';

export interface FlashStats {
  /** Frames painted after the new document committed. */
  frames: number;
  /** Frames whose mean lightness exceeds the flash threshold. */
  lightFrames: number;
  /** Mean lightness of the first committed frame (what the user sees first). */
  firstFrameL: number | null;
  /** Mean lightness per frame, in order, for the report sparkline. */
  timeline: number[];
}

interface Frame {
  receivedAt: number;
  data: string;
}

/**
 * Navigate to `url` while recording a CDP screencast, then report how many
 * painted frames of the new document were light. Frames from before the
 * navigation committed (previous page, browser canvas) are excluded: no
 * extension can affect them.
 */
export async function navigateAndCaptureFlash(
  page: Page,
  cdp: CDPSession,
  url: string,
  settle: () => Promise<void>,
): Promise<FlashStats> {
  const frames: Frame[] = [];
  let committedAt = Number.POSITIVE_INFINITY;

  const onFrame = (event: { data: string; sessionId: number }) => {
    frames.push({ receivedAt: Date.now(), data: event.data });
    cdp.send('Page.screencastFrameAck', { sessionId: event.sessionId }).catch(() => {});
  };
  const onNavigated = (event: { frame: { parentId?: string } }) => {
    if (!event.frame.parentId) committedAt = Math.min(committedAt, Date.now());
  };

  await cdp.send('Page.enable');
  cdp.on('Page.screencastFrame', onFrame);
  cdp.on('Page.frameNavigated', onNavigated);
  await cdp.send('Page.startScreencast', { format: 'png', maxWidth: 640, maxHeight: 400, everyNthFrame: 1 });
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForLoadState('load', { timeout: 15_000 }).catch(() => {});
    await settle();
  } finally {
    await cdp.send('Page.stopScreencast').catch(() => {});
    cdp.off('Page.screencastFrame', onFrame);
    cdp.off('Page.frameNavigated', onNavigated);
  }

  const timeline = frames
    .filter((frame) => frame.receivedAt >= committedAt)
    .map((frame) => meanLightness(decodePng(Buffer.from(frame.data, 'base64')), PIXEL_STRIDE));

  return {
    frames: timeline.length,
    lightFrames: timeline.filter((l) => l > THRESHOLDS.lightFrameMeanL).length,
    firstFrameL: timeline[0] ?? null,
    timeline: timeline.map((l) => Math.round(l * 1000) / 1000),
  };
}
