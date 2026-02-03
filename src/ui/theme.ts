import Phaser from 'phaser';

export const COLORS = {
  bg: 0x0a0a12,
  bgDark: 0x050508,
  bgGrid: 0x1a1a2e,

  neonCyan: 0x00f5ff,
  neonMagenta: 0xff00ff,
  neonPurple: 0x8b5cf6,
  neonGreen: 0x00ff88,
  neonYellow: 0xf2b134,
  neonRed: 0xff3366,

  text: 0xeef2ff,
  textDim: 0x8892b0,

  glassFill: 0x1a1a2e,
  glassStroke: 0x00f5ff,
  glassFillAlpha: 0.4,
  glassStrokeAlpha: 0.8,

  white: 0xffffff,
  black: 0x000000,
};

export const SIZES = {
  cornerRadius: 12,
  panelPadding: 16,
  lineGlowWidth: 6,
  lineWidth: 2,
  neonBlur: 8,
};

export const FONTS = {
  ui: '"ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "Consolas", monospace',
  display: '"Orbitron", "ui-monospace", monospace',
};

export interface GlassPanelOptions {
  x: number;
  y: number;
  width: number;
  height: number;
  fillColor?: number;
  fillAlpha?: number;
  strokeColor?: number;
  strokeAlpha?: number;
  strokeWidth?: number;
  cornerRadius?: number;
}

export function drawGlassPanel(
  graphics: Phaser.GameObjects.Graphics,
  options: GlassPanelOptions
): void {
  const {
    x,
    y,
    width,
    height,
    fillColor = COLORS.glassFill,
    fillAlpha = COLORS.glassFillAlpha,
    strokeColor = COLORS.glassStroke,
    strokeAlpha = COLORS.glassStrokeAlpha,
    strokeWidth = 2,
    cornerRadius = SIZES.cornerRadius,
  } = options;

  // Outer glow
  graphics.lineStyle(strokeWidth + 4, strokeColor, strokeAlpha * 0.3);
  graphics.strokeRoundedRect(x, y, width, height, cornerRadius);

  // Fill
  graphics.fillStyle(fillColor, fillAlpha);
  graphics.fillRoundedRect(x, y, width, height, cornerRadius);

  // Main stroke
  graphics.lineStyle(strokeWidth, strokeColor, strokeAlpha);
  graphics.strokeRoundedRect(x, y, width, height, cornerRadius);

  // Top highlight
  graphics.lineStyle(1, COLORS.white, 0.1);
  graphics.beginPath();
  graphics.moveTo(x + cornerRadius, y + 1);
  graphics.lineTo(x + width - cornerRadius, y + 1);
  graphics.strokePath();
}

export interface NeonLineOptions {
  glowColor?: number;
  coreColor?: number;
  glowWidth?: number;
  coreWidth?: number;
  glowAlpha?: number;
}

export function drawNeonLine(
  graphics: Phaser.GameObjects.Graphics,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  options: NeonLineOptions = {}
): void {
  const {
    glowColor = COLORS.neonCyan,
    coreColor = COLORS.white,
    glowWidth = SIZES.lineGlowWidth,
    coreWidth = SIZES.lineWidth,
    glowAlpha = 0.4,
  } = options;

  // Outer glow layer
  graphics.lineStyle(glowWidth + 4, glowColor, glowAlpha * 0.3);
  graphics.lineBetween(x1, y1, x2, y2);

  // Main glow
  graphics.lineStyle(glowWidth, glowColor, glowAlpha);
  graphics.lineBetween(x1, y1, x2, y2);

  // Core bright line
  graphics.lineStyle(coreWidth, coreColor, 1);
  graphics.lineBetween(x1, y1, x2, y2);
}

export function applyNeonText(
  text: Phaser.GameObjects.Text,
  color: number = COLORS.neonCyan,
  glowStrength: number = 8
): void {
  const hexColor = '#' + color.toString(16).padStart(6, '0');
  text.setColor(hexColor);
  text.setShadow(0, 0, hexColor, glowStrength, true, true);
}

export function createNeonTextStyle(
  color: number = COLORS.neonCyan,
  fontSize: string = '18px'
): Phaser.Types.GameObjects.Text.TextStyle {
  const hexColor = '#' + color.toString(16).padStart(6, '0');
  return {
    fontFamily: FONTS.ui,
    fontSize,
    color: hexColor,
    shadow: {
      offsetX: 0,
      offsetY: 0,
      color: hexColor,
      blur: 8,
      fill: true,
      stroke: true,
    },
  };
}

export function hexToString(hex: number): string {
  return '#' + hex.toString(16).padStart(6, '0');
}
