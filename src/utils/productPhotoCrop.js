export const initialPhotoCrop = { x: 0.5, y: 0.5, zoom: 1 };

export function getProductPhotoCrop({ width, height }, { x, y, zoom }) {
  const size = Math.min(width, height) / zoom;
  const originX = Math.max(0, Math.min(width - size, x * width - size / 2));
  const originY = Math.max(0, Math.min(height - size, y * height - size / 2));

  return { originX, originY, width: size, height: size };
}

export function toPixelCrop(crop) {
  const size = Math.max(1, Math.floor(crop.width));
  return {
    originX: Math.floor(crop.originX),
    originY: Math.floor(crop.originY),
    width: size,
    height: size,
  };
}
