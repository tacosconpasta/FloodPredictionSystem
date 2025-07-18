// lib/elevationFetcher.js

export const decodeTerrariumRGB = (r, g, b) => {
  return r * 256 + g + b / 256 - 32768;
};

export const lngLatToTile = (lon, lat, zoom) => {
  const tileCount = 1 << zoom;
  const x = Math.floor(((lon + 180) / 360) * tileCount);
  const y = Math.floor(
    ((1 -
      Math.log(
        Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)
      ) /
        Math.PI) /
      2) *
      tileCount
  );
  return { x, y };
};

export const lngLatToPixelInTile = (lon, lat, zoom, tileSize = 256) => {
  const scale = tileSize * Math.pow(2, zoom);
  const worldX = ((lon + 180) / 360) * scale;
  const sinLat = Math.sin((lat * Math.PI) / 180);
  const worldY =
    (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale;

  return {
    x: Math.floor(worldX % tileSize),
    y: Math.floor(worldY % tileSize),
  };
};

export const loadImage = async (url) => {
  const res = await fetch(url);
  const blob = await res.blob();
  const bitmap = await createImageBitmap(blob);
  return bitmap;
};

export const imageToCanvasContext = (imageBitmap) => {
  const canvas = document.createElement("canvas");
  canvas.width = imageBitmap.width;
  canvas.height = imageBitmap.height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(imageBitmap, 0, 0);
  return ctx;
};

export const getElevationsForPath = async (path, zoom = 14) => {
  const tileSize = 256;
  const elevations = [];

  for (const [lng, lat] of path) {
    const { x, y } = lngLatToTile(lng, lat, zoom);
    const { x: px, y: py } = lngLatToPixelInTile(lng, lat, zoom, tileSize);

    const tileUrl = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${zoom}/${x}/${y}.png`;

    try {
      const img = await loadImage(tileUrl);
      const ctx = imageToCanvasContext(img);
      const imageData = ctx.getImageData(px, py, 1, 1).data;
      const elevation = decodeTerrariumRGB(
        imageData[0],
        imageData[1],
        imageData[2]
      );

      elevations.push({
        coord: [lng, lat],
        elevation: Math.round(elevation * 100) / 100,
      });
    } catch (error) {
      console.warn("Failed to load elevation for", lng, lat, error);
      elevations.push({ coord: [lng, lat], elevation: null });
    }
  }

  return elevations;
};
