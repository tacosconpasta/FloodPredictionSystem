// lib/precipitationAnalyzer.js
//
// Reads precipitation rates from the public weather.openportguide.de
// "precipitation_shaded" raster tiles and estimates accumulated rainfall
// between consecutive forecast parcels.
//
// Color scale (official legend, verified 2026-07 by pixel-sampling live
// tiles — tiles contain exactly these RGBA values, no anti-aliasing):
//
//   RGB              rate (mm/h)
//   0,255,255        >= 0.1
//   0,204,255        >= 0.2
//   0,153,255        >= 0.4
//   0,102,255        >= 0.7
//   0,51,255         >= 1
//   0,0,215          >= 2
//   0,0,139          >= 4
//   128,0,128        >= 7
//   173,0,173        >= 10
//   219,0,219        >= 20
//   252,88,252       >= 40
//   252,151,252      >= 70
//   transparent      < 0.1 (treated as 0)
//
// Units are mm/m²·h (= liters/m²/h = mm/h). Each tile is a forward-looking
// average: the 0h and 6h timesteps average the next 6 hours, the 12h+
// timesteps average the next 12 hours.

// Forecast timesteps published by the free tile service.
export const AVAILABLE_TIMESTEPS = [0, 6, 12, 24, 36, 48, 60, 72];

// Deepest zoom the tile server publishes; z8+ returns 404. One z7 pixel is
// ~1.2 km at the equator, well below the ~25 km resolution of the
// underlying GFS forecast, so nothing is lost sampling at z7.
export const MAX_TILE_ZOOM = 7;

// Each bucket spans [minRate, maxRate) mm/h; `rate` is the midpoint used as
// the representative value. The open-ended top bucket is capped at 100 mm/h.
export const PRECIPITATION_COLOR_SCALE = [
  { rgb: [0, 255, 255], minRate: 0.1, maxRate: 0.2 },
  { rgb: [0, 204, 255], minRate: 0.2, maxRate: 0.4 },
  { rgb: [0, 153, 255], minRate: 0.4, maxRate: 0.7 },
  { rgb: [0, 102, 255], minRate: 0.7, maxRate: 1.0 },
  { rgb: [0, 51, 255], minRate: 1.0, maxRate: 2.0 },
  { rgb: [0, 0, 215], minRate: 2.0, maxRate: 4.0 },
  { rgb: [0, 0, 139], minRate: 4.0, maxRate: 7.0 },
  { rgb: [128, 0, 128], minRate: 7.0, maxRate: 10.0 },
  { rgb: [173, 0, 173], minRate: 10.0, maxRate: 20.0 },
  { rgb: [219, 0, 219], minRate: 20.0, maxRate: 40.0 },
  { rgb: [252, 88, 252], minRate: 40.0, maxRate: 70.0 },
  { rgb: [252, 151, 252], minRate: 70.0, maxRate: 100.0 },
].map((bucket) => ({
  ...bucket,
  rate: (bucket.minRate + bucket.maxRate) / 2,
}));

// Hours each timestep's tile averages over (server definition).
export const getAveragingWindowHours = (timeOffset) =>
  timeOffset <= 6 ? 6 : 12;

// Next published parcel after the given one (e.g. 0 -> 6, 6 -> 12, 72 -> null).
export const getNextTimestep = (timeOffset) => {
  const next = AVAILABLE_TIMESTEPS.find((t) => t > timeOffset);
  return next !== undefined ? next : null;
};

// Accumulated rainfall depth (mm) over `hours` given the rain rate at the
// start and end of the interval, via the trapezoidal rule:
//
//   depth = hours * (rateStart + rateEnd) / 2
//
// With 1h parcels this integrates the rate curve directly. With the current
// 6h parcels — which are already forward averages — it blends the two
// parcels' estimates of the interval, damping the error from rain that
// starts/stops mid-window.
export const estimateAccumulatedRainfall = (rateStart, rateEnd, hours) =>
  (hours * (rateStart + rateEnd)) / 2;

export class PrecipitationAnalyzer {
  constructor() {
    this.tileCache = new Map(); // "offset-z-x-y" -> decoded tile
  }

  // Convert latitude/longitude to tile coordinates
  latLngToTile(lat, lng, zoom) {
    const latRad = (lat * Math.PI) / 180;
    const n = Math.pow(2, zoom);
    const x = Math.floor(((lng + 180) / 360) * n);
    const y = Math.floor(
      ((1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2) * n
    );
    return { x, y, z: zoom };
  }

  // Convert lat/lng to pixel coordinates within the tile
  latLngToPixel(lat, lng, tileX, tileY, zoom, tileSize = 256) {
    const scale = tileSize * Math.pow(2, zoom);
    const worldX = ((lng + 180) / 360) * scale;
    const worldY =
      ((1 -
        Math.log(
          Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)
        ) /
          Math.PI) /
        2) *
      scale;

    const pixelX = Math.floor(worldX - tileX * tileSize);
    const pixelY = Math.floor(worldY - tileY * tileSize);

    return { x: pixelX, y: pixelY };
  }

  // Map a pixel color to a precipitation rate (mm/h). Tiles use the exact
  // legend palette, so try an exact match first; fall back to
  // nearest-neighbor in RGB space for resampled pixels.
  rateFromColor(r, g, b, a) {
    if (a < 128) return 0; // transparent = no measurable rain

    let best = null;
    let bestDist = Infinity;
    for (const bucket of PRECIPITATION_COLOR_SCALE) {
      const [br, bg, bb] = bucket.rgb;
      const dist = (r - br) ** 2 + (g - bg) ** 2 + (b - bb) ** 2;
      if (dist === 0) return bucket.rate;
      if (dist < bestDist) {
        bestDist = dist;
        best = bucket;
      }
    }

    // An opaque pixel far from every legend color is not rain data
    // (border artifacts, attribution text, etc.)
    return bestDist <= 60 * 60 ? best.rate : 0;
  }

  // Fetch and decode a precipitation tile (cached per analyzer instance)
  async getTile(timeOffset, tile) {
    const key = `${timeOffset}-${tile.z}-${tile.x}-${tile.y}`;
    if (this.tileCache.has(key)) return this.tileCache.get(key);

    const url = `https://weather.openportguide.de/tiles/actual/precipitation_shaded/${timeOffset}h/${tile.z}/${tile.x}/${tile.y}.png`;
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch tile: ${response.status}`);
      }
      const blob = await response.blob();
      const tileData = await this.decodeTileImage(blob);
      this.tileCache.set(key, tileData);
      return tileData;
    } catch (error) {
      console.error(`Error fetching precipitation tile ${url}:`, error);
      return null;
    }
  }

  // Decode a tile image blob to raw pixel data
  async decodeTileImage(imageBlob) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(imageBlob);

      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        try {
          resolve({
            imageData: ctx.getImageData(0, 0, canvas.width, canvas.height),
            width: canvas.width,
            height: canvas.height,
          });
        } catch (error) {
          reject(error);
        }
      };

      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Failed to load image"));
      };
      img.src = objectUrl;
    });
  }

  // Precipitation rate (mm/h) at pixel coordinates within a decoded tile
  getPixelRate(tileData, x, y) {
    const { imageData, width, height } = tileData;
    if (x < 0 || x >= width || y < 0 || y >= height) return 0;

    const index = (y * width + x) * 4;
    return this.rateFromColor(
      imageData.data[index],
      imageData.data[index + 1],
      imageData.data[index + 2],
      imageData.data[index + 3]
    );
  }

  // Sample the rain rate (mm/h) at each river path point for one timestep
  async sampleRatesAlongPath(riverPath, timeOffset = 0, zoom = MAX_TILE_ZOOM) {
    const clampedZoom = Math.min(zoom, MAX_TILE_ZOOM);
    const rates = [];

    for (const [lng, lat] of riverPath) {
      const tile = this.latLngToTile(lat, lng, clampedZoom);
      const tileData = await this.getTile(timeOffset, tile);

      if (!tileData) {
        rates.push(null); // tile unavailable — distinguish from "no rain"
        continue;
      }

      const pixel = this.latLngToPixel(lat, lng, tile.x, tile.y, clampedZoom);
      rates.push(this.getPixelRate(tileData, pixel.x, pixel.y));
    }

    return rates;
  }

  // Main analysis: sample the parcel at `timeOffset` and the next published
  // parcel at every river point, and estimate the rainfall accumulated on
  // that spot across the interval between them.
  async analyzeRainfallAlongPath(riverPath, timeOffset = 0, zoom = MAX_TILE_ZOOM) {
    const startOffset = AVAILABLE_TIMESTEPS.includes(timeOffset)
      ? timeOffset
      : 0;
    const nextOffset = getNextTimestep(startOffset);
    const intervalHours =
      nextOffset !== null
        ? nextOffset - startOffset
        : getAveragingWindowHours(startOffset);

    const [ratesNow, ratesNext] = await Promise.all([
      this.sampleRatesAlongPath(riverPath, startOffset, zoom),
      nextOffset !== null
        ? this.sampleRatesAlongPath(riverPath, nextOffset, zoom)
        : Promise.resolve(riverPath.map(() => null)),
    ]);

    const points = riverPath.map(([lng, lat], i) => {
      const rateNow = ratesNow[i] ?? 0;
      // If the next parcel is missing, assume the rate holds (rectangle rule)
      const rateNext = ratesNext[i] ?? rateNow;
      return {
        segmentIndex: i,
        coordinates: [lng, lat],
        rateNow,
        rateNext,
        accumulationMm: estimateAccumulatedRainfall(
          rateNow,
          rateNext,
          intervalHours
        ),
      };
    });

    const rates = points.map((p) => p.rateNow);
    return {
      points,
      timeOffsets: { current: startOffset, next: nextOffset },
      intervalHours,
      summary: {
        totalPoints: points.length,
        rainingPoints: points.filter((p) => p.rateNow > 0).length,
        maxRate: rates.length ? Math.max(...rates) : 0,
        averageRate: rates.length
          ? rates.reduce((sum, r) => sum + r, 0) / rates.length
          : 0,
        maxAccumulationMm: points.length
          ? Math.max(...points.map((p) => p.accumulationMm))
          : 0,
      },
    };
  }
}

export const createPrecipitationAnalyzer = () => new PrecipitationAnalyzer();
