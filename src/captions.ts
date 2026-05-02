import type { CaptionSegment, CaptionStyle, CaptionStylePreset } from './types.js';

export const STYLE_PRESETS: Record<CaptionStylePreset, CaptionStyle> = {
  hormozi: {
    preset: 'hormozi',
    fontFamily: 'Impact, "Arial Black", sans-serif',
    fontSize: 64,
    fontWeight: '900',
    color: '#FFFFFF',
    strokeColor: '#000000',
    strokeWidth: 4,
    backgroundColor: 'transparent',
    backgroundPadding: 0,
    backgroundRadius: 0,
    position: 'bottom',
    textAlign: 'center',
    lineHeight: 1.1,
    maxWidth: 0.9,
    shadow: true,
    shadowColor: 'rgba(0,0,0,0.9)',
    shadowBlur: 6,
    shadowOffsetX: 2,
    shadowOffsetY: 2,
    uppercase: true,
    wordHighlight: true,
    wordHighlightColor: '#FFD700',
    wordHighlightTextColor: '#000000',
  },
  modern: {
    preset: 'modern',
    fontFamily: '"Inter", "Helvetica Neue", Arial, sans-serif',
    fontSize: 42,
    fontWeight: '700',
    color: '#FFFFFF',
    strokeColor: 'transparent',
    strokeWidth: 0,
    backgroundColor: 'rgba(0,0,0,0.65)',
    backgroundPadding: 12,
    backgroundRadius: 8,
    position: 'bottom',
    textAlign: 'center',
    lineHeight: 1.3,
    maxWidth: 0.85,
    shadow: false,
    shadowColor: 'transparent',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    uppercase: false,
    wordHighlight: false,
    wordHighlightColor: '#3B82F6',
    wordHighlightTextColor: '#FFFFFF',
  },
  minimal: {
    preset: 'minimal',
    fontFamily: '"Helvetica Neue", Arial, sans-serif',
    fontSize: 36,
    fontWeight: '400',
    color: '#FFFFFF',
    strokeColor: 'transparent',
    strokeWidth: 0,
    backgroundColor: 'transparent',
    backgroundPadding: 0,
    backgroundRadius: 0,
    position: 'bottom',
    textAlign: 'center',
    lineHeight: 1.4,
    maxWidth: 0.8,
    shadow: true,
    shadowColor: 'rgba(0,0,0,0.8)',
    shadowBlur: 8,
    shadowOffsetX: 0,
    shadowOffsetY: 2,
    uppercase: false,
    wordHighlight: false,
    wordHighlightColor: '#FFFFFF',
    wordHighlightTextColor: '#000000',
  },
  bold: {
    preset: 'bold',
    fontFamily: '"Arial Black", "Helvetica Neue", Arial, sans-serif',
    fontSize: 56,
    fontWeight: '900',
    color: '#FFFF00',
    strokeColor: '#000000',
    strokeWidth: 5,
    backgroundColor: 'transparent',
    backgroundPadding: 0,
    backgroundRadius: 0,
    position: 'center',
    textAlign: 'center',
    lineHeight: 1.2,
    maxWidth: 0.88,
    shadow: true,
    shadowColor: 'rgba(0,0,0,1)',
    shadowBlur: 4,
    shadowOffsetX: 3,
    shadowOffsetY: 3,
    uppercase: true,
    wordHighlight: false,
    wordHighlightColor: '#FF0000',
    wordHighlightTextColor: '#FFFFFF',
  },
};

export function mergeStyle(
  base: CaptionStyle,
  overrides?: Partial<CaptionStyle>
): CaptionStyle {
  return overrides ? { ...base, ...overrides } : base;
}

export function getActiveCaptions(
  segments: CaptionSegment[],
  currentTime: number
): CaptionSegment[] {
  return segments.filter(
    (seg) => currentTime >= seg.startTime && currentTime < seg.endTime
  );
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export function renderCaption(
  ctx: CanvasRenderingContext2D,
  segment: CaptionSegment,
  resolvedStyle: CaptionStyle,
  canvasWidth: number,
  canvasHeight: number
): void {
  const style = resolvedStyle;
  const text = style.uppercase ? segment.text.toUpperCase() : segment.text;

  ctx.save();

  const scaledFontSize = (style.fontSize / 1080) * canvasHeight;
  ctx.font = `${style.fontWeight} ${scaledFontSize}px ${style.fontFamily}`;
  ctx.textAlign = style.textAlign;
  ctx.textBaseline = 'bottom';

  const maxPx = style.maxWidth * canvasWidth;
  const lines = wrapText(ctx, text, maxPx);
  const lineH = scaledFontSize * style.lineHeight;
  const totalH = lines.length * lineH;

  let baseY: number;
  if (style.position === 'top') {
    baseY = scaledFontSize * 1.5;
  } else if (style.position === 'center') {
    baseY = canvasHeight / 2 - totalH / 2 + lineH;
  } else {
    // Anchor the LAST line at the bottom margin so multi-line captions don't overflow.
    baseY = canvasHeight - scaledFontSize * 1.2 - (lines.length - 1) * lineH;
    if (baseY < lineH) baseY = lineH; // clamp: don't let first line go above canvas
  }

  const cx = canvasWidth / 2;

  lines.forEach((line, i) => {
    const y = baseY + i * lineH;

    // Background box
    if (style.backgroundColor && style.backgroundColor !== 'transparent') {
      const metrics = ctx.measureText(line);
      const bw = metrics.width + style.backgroundPadding * 2;
      const bh = lineH + style.backgroundPadding;
      const bx = cx - bw / 2;
      const by = y - lineH;

      ctx.fillStyle = style.backgroundColor;
      if (style.backgroundRadius > 0) {
        roundRect(ctx, bx, by, bw, bh, style.backgroundRadius);
        ctx.fill();
      } else {
        ctx.fillRect(bx, by, bw, bh);
      }
    }

    // Shadow
    if (style.shadow) {
      ctx.shadowColor = style.shadowColor;
      ctx.shadowBlur = style.shadowBlur;
      ctx.shadowOffsetX = style.shadowOffsetX;
      ctx.shadowOffsetY = style.shadowOffsetY;
    }

    // Stroke
    if (style.strokeWidth > 0 && style.strokeColor !== 'transparent') {
      ctx.lineWidth = style.strokeWidth;
      ctx.strokeStyle = style.strokeColor;
      ctx.strokeText(line, cx, y);
    }

    // Fill
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.fillStyle = style.color;
    ctx.fillText(line, cx, y);
  });

  ctx.restore();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
