// Ad layouts for the export sizes. Pure geometry, shared by the still and clip renderers.

export const EXPORT_SIZES = ["9:16", "1:1", "16:9"] as const;
export type ExportSize = (typeof EXPORT_SIZES)[number];

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ExportLayout {
  width: number;
  height: number;
  /** Where the creative sits; the source is cover-fitted into it. */
  media: Box;
  /** Brand panel for logo and copy; null when copy sits over the media. */
  panel: Box | null;
  /** Copy line block, inside the panel or over a gradient at the media's foot. */
  copy: Box;
  logo: Box;
  /** AI-disclosure badge: a corner of the media, away from the centered product. */
  badge: Box;
}

const CANVAS: Record<ExportSize, { width: number; height: number }> = {
  "9:16": { width: 1080, height: 1920 },
  "1:1": { width: 1080, height: 1080 },
  "16:9": { width: 1920, height: 1080 },
};

const MARGIN = 64;
const BADGE = { width: 236, height: 52, inset: 32 };

function badgeAt(media: Box): Box {
  return { x: media.x + media.width - BADGE.width - BADGE.inset, y: media.y + BADGE.inset, width: BADGE.width, height: BADGE.height };
}

export function exportLayout(size: ExportSize): ExportLayout {
  const { width, height } = CANVAS[size];
  if (size === "9:16") {
    // 4:5 creative on top at full width, brand panel underneath.
    const media = { x: 0, y: 0, width, height: Math.round((width * 5) / 4) };
    const panel = { x: 0, y: media.height, width, height: height - media.height };
    return {
      width,
      height,
      media,
      panel,
      copy: { x: MARGIN, y: panel.y + MARGIN, width: width - 2 * MARGIN, height: 220 },
      logo: { x: (width - 200) / 2, y: height - MARGIN - 118, width: 200, height: 118 },
      badge: badgeAt(media),
    };
  }
  if (size === "16:9") {
    // 4:5 creative on the left at full height, brand panel on the right.
    const media = { x: 0, y: 0, width: Math.round((height * 4) / 5), height };
    const panel = { x: media.width, y: 0, width: width - media.width, height };
    return {
      width,
      height,
      media,
      panel,
      copy: { x: panel.x + 96, y: 420, width: panel.width - 192, height: 300 },
      logo: { x: panel.x + 96, y: 180, width: 240, height: 141 },
      badge: badgeAt(media),
    };
  }
  // 1:1: the creative fills the square, copy over a dark gradient at the foot.
  const media = { x: 0, y: 0, width, height };
  return {
    width,
    height,
    media,
    panel: null,
    copy: { x: MARGIN, y: height - MARGIN - 130, width: width - 2 * MARGIN - 180, height: 130 },
    logo: { x: width - MARGIN - 150, y: height - MARGIN - 88, width: 150, height: 88 },
    badge: badgeAt(media),
  };
}
