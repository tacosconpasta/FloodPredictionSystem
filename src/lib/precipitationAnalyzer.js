// lib/utils/precipitationAnalyzer.js

export class PrecipitationAnalyzer {
  constructor() {
    this.precipitationRanges = [
      { hslRange: [0, 179], intensity: 0.0 },
      { hslRange: [179, 180], intensity: 0.2 },
      { hslRange: [188, 198], intensity: 0.4 },
      { hslRange: [199, 210], intensity: 0.7 },
      { hslRange: [210, 218], intensity: 1.0 },
      { hslRange: [218, 228], intensity: 2.0 },
      { hslRange: [229, 239], intensity: 5.5 },
      { hslRange: [300, 300], intensity: { min: 7, max: 70 } }, // Special case for hue 300
    ];
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

  // Convert tile coordinates to pixel coordinates within the tile
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

  // Convert RGB to HSL
  rgbToHsl(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h, s, l;

    l = (max + min) / 2;

    if (max === min) {
      h = s = 0; // achromatic
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

      switch (max) {
        case r:
          h = (g - b) / d + (g < b ? 6 : 0);
          break;
        case g:
          h = (b - r) / d + 2;
          break;
        case b:
          h = (r - g) / d + 4;
          break;
      }
      h /= 6;
    }

    return {
      h: Math.round(h * 360),
      s: Math.round(s * 100),
      l: Math.round(l * 100),
    };
  }

  // Determine precipitation intensity from HSL values
  getIntensityFromHsl(h, s, l) {
    // Special case for hue 300 (magenta range)
    if (h >= 295 && h <= 305) {
      if (l < 25) return 7; // Bottom ceiling
      // Linear interpolation between 7 and 70 based on luminosity
      const intensityRange = 70 - 7;
      const luminosityFactor = Math.max(0, (l - 25) / (100 - 25));
      return 7 + intensityRange * luminosityFactor;
    }

    // Check other ranges
    for (const range of this.precipitationRanges) {
      const [minHue, maxHue] = range.hslRange;
      if (h >= minHue && h <= maxHue) {
        return typeof range.intensity === "number"
          ? range.intensity
          : range.intensity.min;
      }
    }

    return 0; // No precipitation
  }

  // Fetch and analyze precipitation tile
  async fetchAndAnalyzeTile(tileUrl) {
    try {
      const response = await fetch(tileUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch tile: ${response.status}`);
      }

      const blob = await response.blob();
      return await this.analyzeTileImage(blob);
    } catch (error) {
      console.error("Error fetching precipitation tile:", error);
      return null;
    }
  }

  // Analyze tile image to extract precipitation data
  async analyzeTileImage(imageBlob) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";

      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        canvas.width = img.width;
        canvas.height = img.height;

        ctx.drawImage(img, 0, 0);

        try {
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          resolve({
            imageData: imageData,
            width: canvas.width,
            height: canvas.height,
          });
        } catch (error) {
          reject(error);
        }
      };

      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = URL.createObjectURL(imageBlob);
    });
  }

  // Get precipitation intensity at specific pixel coordinates
  getPixelIntensity(imageData, x, y, width) {
    if (x < 0 || x >= width || y < 0 || y >= imageData.height) {
      return 0;
    }

    const index = (y * width + x) * 4;
    const r = imageData.data[index];
    const g = imageData.data[index + 1];
    const b = imageData.data[index + 2];
    const a = imageData.data[index + 3];

    // Skip transparent pixels
    if (a < 128) return 0;

    const hsl = this.rgbToHsl(r, g, b);
    return this.getIntensityFromHsl(hsl.h, hsl.s, hsl.l);
  }

  // Analyze precipitation along river path
  async analyzePrecipitationAlongPath(riverPath, timeOffset = 0, zoom = 10) {
    const precipitationData = [];
    const tileCache = new Map();

    for (let i = 0; i < riverPath.length; i++) {
      const [lng, lat] = riverPath[i];
      const tile = this.latLngToTile(lat, lng, zoom);
      const tileKey = `${tile.z}-${tile.x}-${tile.y}`;

      // Check if we already have this tile
      let tileData = tileCache.get(tileKey);

      if (!tileData) {
        // Fetch and analyze new tile
        const tileUrl = `https://weather.openportguide.de/tiles/actual/precipitation_shaded/${timeOffset}h/${tile.z}/${tile.x}/${tile.y}.png`;
        tileData = await this.fetchAndAnalyzeTile(tileUrl);

        if (tileData) {
          tileCache.set(tileKey, tileData);
        } else {
          console.warn(`Failed to fetch tile for point ${i}`);
          continue;
        }
      }

      if (tileData) {
        // Get pixel coordinates within the tile
        const pixel = this.latLngToPixel(lat, lng, tile.x, tile.y, zoom);

        // Get precipitation intensity at this pixel
        const intensity = this.getPixelIntensity(
          tileData.imageData,
          pixel.x,
          pixel.y,
          tileData.width
        );

        precipitationData.push({
          segmentIndex: i,
          coordinates: [lng, lat],
          intensity: intensity,
          tile: tile,
          pixel: pixel,
        });
      }
    }

    return precipitationData;
  }

  // Calculate average precipitation intensity along path segments
  calculateSegmentIntensities(precipitationData) {
    if (precipitationData.length === 0) return [];

    const segments = [];

    for (let i = 0; i < precipitationData.length - 1; i++) {
      const current = precipitationData[i];
      const next = precipitationData[i + 1];

      const avgIntensity = (current.intensity + next.intensity) / 2;

      segments.push({
        segmentIndex: i,
        startCoord: current.coordinates,
        endCoord: next.coordinates,
        startIntensity: current.intensity,
        endIntensity: next.intensity,
        averageIntensity: avgIntensity,
        maxIntensity: Math.max(current.intensity, next.intensity),
      });
    }

    return segments;
  }

  // Get affected segments based on intensity threshold
  getAffectedSegments(precipitationData, minIntensity = 0.5) {
    const segments = this.calculateSegmentIntensities(precipitationData);

    return segments
      .filter((segment) => segment.maxIntensity >= minIntensity)
      .map((segment) => ({
        segmentIndex: segment.segmentIndex,
        intensity: segment.maxIntensity,
        coordinates: segment.startCoord,
      }));
  }

  // Calculate flood risk radius based on precipitation intensity with enhanced scaling
  calculateFloodRadius(intensity, baseRadius = 500, coordinates = null) {
    // Enhanced exponential scaling for flood radius based on precipitation intensity
    if (intensity <= 0.2) return 0;

    let radiusMultiplier;
    if (intensity <= 0.5) radiusMultiplier = 0.4;
    else if (intensity <= 1.0) radiusMultiplier = 0.7;
    else if (intensity <= 2.0) radiusMultiplier = 1.0;
    else if (intensity <= 5.0) radiusMultiplier = 1.6;
    else if (intensity <= 10.0) radiusMultiplier = 2.8;
    else if (intensity <= 20.0) radiusMultiplier = 4.5;
    else if (intensity <= 50.0) radiusMultiplier = 7.0;
    else radiusMultiplier = 10.0; // Extreme precipitation >50mm/h

    // Additional location-based factors could be added here:
    // - Terrain slope analysis
    // - Proximity to confluence points
    // - Historical flood data
    // - Soil absorption capacity

    const calculatedRadius = baseRadius * radiusMultiplier;

    // Apply practical constraints
    return Math.max(50, Math.min(calculatedRadius, 8000)); // 50m to 8km range
  }

  // Compare precipitation between current predictionTime and a reference time
  async comparePrecipitationData(
    riverPath,
    currentTimeOffset,
    referenceTimeOffset = 0,
    zoom = 10
  ) {
    console.log(
      `Comparing precipitation: ${currentTimeOffset}h vs ${referenceTimeOffset}h`
    );

    const [currentData, referenceData] = await Promise.all([
      this.analyzePrecipitationAlongPath(riverPath, currentTimeOffset, zoom),
      this.analyzePrecipitationAlongPath(riverPath, referenceTimeOffset, zoom),
    ]);

    const changes = [];

    for (
      let i = 0;
      i < Math.min(currentData.length, referenceData.length);
      i++
    ) {
      const current = currentData[i];
      const reference = referenceData[i];

      const intensityChange = current.intensity - reference.intensity;

      if (intensityChange > 0.5 || current.intensity > 1.0) {
        // Significant increase OR high current intensity
        const floodRadius = this.calculateFloodRadius(
          current.intensity,
          500,
          current.coordinates
        );

        changes.push({
          segmentIndex: i,
          coordinates: current.coordinates,
          referenceIntensity: reference.intensity,
          currentIntensity: current.intensity,
          intensityChange: intensityChange,
          floodRadius: floodRadius,
          riskLevel: this.determineRiskLevel(current.intensity),
          timestamp: Date.now(),
          timeOffset: currentTimeOffset,
        });
      }
    }

    return {
      currentData,
      referenceData,
      changes,
      timeOffsets: {
        current: currentTimeOffset,
        reference: referenceTimeOffset,
      },
      summary: {
        totalSegments: currentData.length,
        affectedSegments: changes.length,
        maxIntensity: Math.max(...currentData.map((d) => d.intensity)),
        averageIntensity:
          currentData.reduce((sum, d) => sum + d.intensity, 0) /
          currentData.length,
      },
    };
  }

  // Determine risk level based on precipitation intensity
  determineRiskLevel(intensity) {
    if (intensity < 1.0) return "low";
    if (intensity < 5.0) return "moderate";
    if (intensity < 20.0) return "high";
    return "extreme";
  }

  // Generate detailed flood risk zones along river path
  generateRiverPathFloodZones(precipitationData, baseRadius = 500) {
    const floodZones = [];

    precipitationData.forEach((data) => {
      if (data.intensity > 0.2) {
        // Only create zones for significant precipitation
        const radius = this.calculateFloodRadius(
          data.intensity,
          baseRadius,
          data.coordinates
        );
        const riskLevel = this.determineRiskLevel(data.intensity);

        // Create circular buffer around the point
        const bufferCoords = this.createCircularBuffer(
          data.coordinates,
          radius
        );

        floodZones.push({
          type: "Feature",
          properties: {
            segmentIndex: data.segmentIndex,
            intensity: data.intensity,
            radius: radius,
            riskLevel: riskLevel,
            isPrecipitationZone: true,
            timestamp: Date.now(),
          },
          geometry: {
            type: "Polygon",
            coordinates: [bufferCoords],
          },
        });
      }
    });

    return {
      type: "FeatureCollection",
      features: floodZones,
    };
  }

  // Create circular buffer coordinates
  createCircularBuffer(center, radiusInMeters, points = 32) {
    const coords = [];
    const earthRadius = 6371000; // Earth's radius in meters

    for (let i = 0; i < points; i++) {
      const angle = (i * 2 * Math.PI) / points;
      const latOffset = (radiusInMeters / earthRadius) * (180 / Math.PI);
      const lngOffset =
        ((radiusInMeters / earthRadius) * (180 / Math.PI)) /
        Math.cos((center[1] * Math.PI) / 180);

      const lat = center[1] + latOffset * Math.cos(angle);
      const lng = center[0] + lngOffset * Math.sin(angle);

      coords.push([lng, lat]);
    }

    // Close the polygon
    coords.push(coords[0]);

    return coords;
  }
}

// Usage example
export const createPrecipitationAnalyzer = () => {
  return new PrecipitationAnalyzer();
};

// Helper function to integrate with existing flood risk system
export const integratePrecipitationAnalysis = (
  floodRiskCalculator,
  precipitationAnalyzer
) => {
  return {
    async updateWithRealPrecipitation(
      riverPath,
      currentTimeOffset,
      referenceTimeOffset = 0
    ) {
      const comparison = await precipitationAnalyzer.comparePrecipitationData(
        riverPath,
        currentTimeOffset,
        referenceTimeOffset
      );

      // Add precipitation data to flood risk calculator
      const timestamp = Date.now() - currentTimeOffset * 3600000;

      comparison.changes.forEach((change) => {
        floodRiskCalculator.addPrecipitationData(
          timestamp,
          change.currentIntensity,
          [change.segmentIndex]
        );
      });

      return {
        precipitationData: comparison,
        floodRiskZones: floodRiskCalculator.generateCombinedFloodRiskZones(
          Date.now(),
          comparison.currentData
        ),
      };
    },
  };
};
