// lib/utils/floodRiskCalculator.js
//
// Mass-balance flood model for a user-drawn river path.
//
// Rain falling on the strip of land draining into each river segment enters
// the channel as lateral inflow:
//
//   Q_in = C * (R / 3.6e6) * L * Wc        [m³/s]
//
//     C  runoff coefficient (fraction of rain reaching the river)
//     R  rain rate in mm/h  (R/3.6e6 converts mm/h -> m/s of water depth)
//     L  segment length (m), Wc catchment strip width (m)
//
// That water is flushed downstream at the river's average speed v. The
// discharge at a point is the sum of upstream inflows close enough for
// their water to arrive within the forecast interval (travel time = d/v).
//
// A river of width w moving at v carries v*w m³/s for every meter of extra
// depth, so the level rise needed to evacuate a storm discharge Q is:
//
//   Δh = Q / (v * w)                        [m]
//
// Δh is what we map to flood risk: if the river must rise further than its
// banks allow, the surroundings flood.

// Haversine distance in meters
function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

export const RISK_LEVELS = [
  { level: "low", minRise: 0.1 },
  { level: "moderate", minRise: 0.5 },
  { level: "high", minRise: 1.5 },
  { level: "extreme", minRise: 3.0 },
];

export class FloodRiskCalculator {
  constructor(riverPath, options = {}) {
    const {
      riverSpeed = 1.5, // m/s — typical lowland river
      riverWidth = 50, // m
      runoffCoefficient = 0.5, // mixed terrain
      catchmentWidth = 2000, // m of land draining into the river (both sides)
    } = options;

    this.riverPath = riverPath;
    this.riverSpeed = Math.max(0.1, riverSpeed);
    this.riverWidth = Math.max(1, riverWidth);
    this.runoffCoefficient = Math.min(1, Math.max(0, runoffCoefficient));
    this.catchmentWidth = Math.max(1, catchmentWidth);
  }

  // Cumulative distance (m) along the path at each point
  calculatePathDistances() {
    if (this.riverPath.length < 2) return [0];

    const distances = [0];
    for (let i = 1; i < this.riverPath.length; i++) {
      const [lng1, lat1] = this.riverPath[i - 1];
      const [lng2, lat2] = this.riverPath[i];
      distances.push(
        distances[i - 1] + calculateDistance(lat1, lng1, lat2, lng2)
      );
    }
    return distances;
  }

  getTotalPathDistance() {
    const distances = this.calculatePathDistances();
    return distances[distances.length - 1] || 0;
  }

  // Flushing capacity: m³/s the river evacuates per meter of level rise
  getFlushCapacityPerMeter() {
    return this.riverSpeed * this.riverWidth;
  }

  riskLevelFromRise(riseM) {
    let level = "none";
    for (const { level: l, minRise } of RISK_LEVELS) {
      if (riseM >= minRise) level = l;
    }
    return level;
  }

  // Flood radius around a river point: channel half-width plus spill
  // proportional to the level rise.
  floodRadiusFromRise(riseM) {
    if (riseM < 0.1) return 0;
    const radius = this.riverWidth / 2 + 800 * riseM;
    return Math.max(50, Math.min(radius, 8000));
  }

  // Core computation. `rainfallPoints` is the per-point output of
  // PrecipitationAnalyzer.analyzeRainfallAlongPath (rateNow/rateNext/
  // accumulationMm per river path point); `intervalHours` is the time
  // between the two sampled weather parcels.
  analyze(rainfallPoints, intervalHours) {
    const distances = this.calculatePathDistances();
    const n = this.riverPath.length;
    if (n < 2 || !rainfallPoints || rainfallPoints.length < n) {
      return null;
    }

    const intervalSeconds = intervalHours * 3600;
    const travelWindow = this.riverSpeed * intervalSeconds; // m upstream that can drain past a point within the interval

    // Lateral inflow per segment, using the trapezoid-averaged rain rate
    // over the interval ((rateNow + rateNext)/2 at both endpoints).
    const segmentInflows = [];
    for (let i = 0; i < n - 1; i++) {
      const length = distances[i + 1] - distances[i];
      const rateA =
        (rainfallPoints[i].rateNow + rainfallPoints[i].rateNext) / 2;
      const rateB =
        (rainfallPoints[i + 1].rateNow + rainfallPoints[i + 1].rateNext) / 2;
      const meanRate = (rateA + rateB) / 2; // mm/h over the segment
      const inflow =
        this.runoffCoefficient *
        (meanRate / 3.6e6) *
        length *
        this.catchmentWidth; // m³/s
      segmentInflows.push({
        // Lateral inflow is spread along the segment; treat it as entering
        // at the midpoint for routing purposes.
        entryDistance: distances[i] + length / 2,
        inflow,
        meanRate,
        length,
      });
    }

    const flushPerMeter = this.getFlushCapacityPerMeter();

    const points = rainfallPoints.map((rain, i) => {
      const distance = distances[i];

      // Storm discharge: upstream inflows whose water reaches this point
      // within the forecast interval
      let discharge = 0;
      for (const seg of segmentInflows) {
        if (
          seg.entryDistance <= distance &&
          distance - seg.entryDistance <= travelWindow
        ) {
          discharge += seg.inflow;
        }
      }

      const riseM = discharge / flushPerMeter;
      return {
        segmentIndex: i,
        coordinates: rain.coordinates,
        distanceAlongPath: distance,
        rateNow: rain.rateNow,
        rateNext: rain.rateNext,
        accumulationMm: rain.accumulationMm,
        dischargeM3s: discharge,
        riseM,
        riskLevel: this.riskLevelFromRise(riseM),
        floodRadius: this.floodRadiusFromRise(riseM),
      };
    });

    const totalRainVolume = segmentInflows.reduce(
      (sum, seg) => sum + seg.inflow * intervalSeconds,
      0
    );

    return {
      points,
      intervalHours,
      riverSpeed: this.riverSpeed,
      riverWidth: this.riverWidth,
      summary: {
        peakDischargeM3s: Math.max(...points.map((p) => p.dischargeM3s)),
        peakRiseM: Math.max(...points.map((p) => p.riseM)),
        floodedPoints: points.filter((p) => p.riseM >= 0.1).length,
        totalPoints: points.length,
        totalRainVolumeM3: totalRainVolume,
        flushCapacityPerMeterRise: flushPerMeter,
        pathTravelTimeH: this.getTotalPathDistance() / this.riverSpeed / 3600,
      },
    };
  }

  // GeoJSON flood risk zones for the map, one buffer per at-risk point
  generateFloodRiskZones(analysis) {
    if (!analysis) {
      return { type: "FeatureCollection", features: [] };
    }

    const features = analysis.points
      .filter((p) => p.floodRadius > 0)
      .map((p) => ({
        type: "Feature",
        properties: {
          segmentIndex: p.segmentIndex,
          riskLevel: p.riskLevel,
          riseM: p.riseM,
          dischargeM3s: p.dischargeM3s,
          accumulationMm: p.accumulationMm,
          radius: p.floodRadius,
        },
        geometry: this.createCircularBuffer(p.coordinates, p.floodRadius),
      }));

    return { type: "FeatureCollection", features };
  }

  // Circular polygon around [lng, lat] with radius in meters
  createCircularBuffer(center, radiusInMeters, points = 32) {
    const coords = [];
    const earthRadius = 6371000;
    const latOffset = (radiusInMeters / earthRadius) * (180 / Math.PI);
    const lngOffset = latOffset / Math.cos((center[1] * Math.PI) / 180);

    for (let i = 0; i < points; i++) {
      const angle = (i * 2 * Math.PI) / points;
      coords.push([
        center[0] + lngOffset * Math.sin(angle),
        center[1] + latOffset * Math.cos(angle),
      ]);
    }
    coords.push(coords[0]);

    return { type: "Polygon", coordinates: [coords] };
  }
}
