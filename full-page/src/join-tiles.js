// Joins image tiles from top to bottom into one PNG with sharp.
// The result is always PNG: a WebP image cannot be taller than 16,383 px.
import sharp from 'sharp';

export async function joinTiles(tiles) {
  const sizes = await Promise.all(tiles.map((tile) => sharp(tile).metadata()));
  const layers = [];
  let top = 0;
  for (const [index, tile] of tiles.entries()) {
    layers.push({ input: tile, left: 0, top });
    top += sizes[index].height;
  }
  // The joined image is held in memory: width x height x 4 bytes.
  return sharp({
    create: { width: sizes[0].width, height: top, channels: 4, background: '#ffffff' },
    limitInputPixels: false,
  }).composite(layers).png().toBuffer();
}
