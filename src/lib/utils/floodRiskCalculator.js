// lib/utils/floodRiskCalculator.js

// Helper function for distance calculation
function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 6371e3; // Earth's radius in meters
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

export class FloodRiskCalculator {
  constructor(riverPath, flowVelocity = 18) {
    // 18 m/s default
    this.riverPath = riverPath;
    this.flowVelocity = flowVelocity; // meters per second
    this.precipitationData = new Map(); // Store precipitation data over time
    this.waterParcels = []; // Track water parcels moving downstream
  }

  // Calculate cumulative distance along river path
  calculatePathDistances() {
    if (this.riverPath.length < 2) return [];

    const distances = [0];
    let cumulativeDistance = 0;

    for (let i = 1; i < this.riverPath.length; i++) {
      const [lng1, lat1] = this.riverPath[i - 1];
      const [lng2, lat2] = this.riverPath[i];
      const segmentDistance = calculateDistance(lat1, lng1, lat2, lng2);
      cumulativeDistance += segmentDistance;
      distances.push(cumulativeDistance);
    }

    return distances;
  }

  // Add precipitation data at a specific time
  addPrecipitationData(timestamp, precipitationIntensity, affectedSegments) {
    this.precipitationData.set(timestamp, {
      intensity: precipitationIntensity,
      segments: affectedSegments,
    });

    // Create water parcels for each affected segment
    affectedSegments.forEach((segmentIndex) => {
      if (segmentIndex < this.riverPath.length) {
        this.waterParcels.push({
          id: `${timestamp}-${segmentIndex}`,
          originalSegment: segmentIndex,
          currentPosition: this.getSegmentDistance(segmentIndex),
          intensity: precipitationIntensity,
          birthTime: timestamp,
        });
      }
    });
  }

  // Get distance of a segment along the river path
  getSegmentDistance(segmentIndex) {
    const distances = this.calculatePathDistances();
    return distances[segmentIndex] || 0;
  }

  // Calculate current water positions at given time
  calculateWaterPositions(currentTime) {
    const activeWaterParcels = [];

    this.waterParcels.forEach((parcel) => {
      const timeElapsed = (currentTime - parcel.birthTime) / 1000; // Convert to seconds
      const distanceTraveled = this.flowVelocity * timeElapsed;
      const currentPosition = parcel.currentPosition + distanceTraveled;

      // Check if water parcel is still within the river path
      const totalPathDistance = this.getTotalPathDistance();
      if (currentPosition <= totalPathDistance) {
        activeWaterParcels.push({
          ...parcel,
          currentPosition,
          distanceTraveled,
          timeElapsed,
        });
      }
    });

    return activeWaterParcels;
  }

  // Get total distance of the river path
  getTotalPathDistance() {
    const distances = this.calculatePathDistances();
    return distances[distances.length - 1] || 0;
  }

  // Convert distance along path to geographic coordinates
  distanceToCoordinates(distance) {
    const distances = this.calculatePathDistances();

    // Find the segment where this distance falls
    for (let i = 0; i < distances.length - 1; i++) {
      if (distance >= distances[i] && distance <= distances[i + 1]) {
        const segmentStart = distances[i];
        const segmentEnd = distances[i + 1];
        const segmentDistance = segmentEnd - segmentStart;
        const positionInSegment = distance - segmentStart;
        const ratio = positionInSegment / segmentDistance;

        // Interpolate coordinates
        const [lng1, lat1] = this.riverPath[i];
        const [lng2, lat2] = this.riverPath[i + 1];

        const lng = lng1 + (lng2 - lng1) * ratio;
        const lat = lat1 + (lat2 - lat1) * ratio;

        return [lng, lat];
      }
    }

    // If distance is beyond path, return last point
    return this.riverPath[this.riverPath.length - 1];
  }

  // Generate flood risk zones with dynamic radius along river path
  generateFloodRiskZones(currentTime, precipitationData = null) {
    const waterPositions = this.calculateWaterPositions(currentTime);
    const riskZones = [];

    waterPositions.forEach((parcel) => {
      const coordinates = this.distanceToCoordinates(parcel.currentPosition);

      // Get current precipitation intensity at this position if available
      let currentPrecipitation = 0;
      if (precipitationData) {
        const nearestSegment = this.findNearestSegmentIndex(
          parcel.currentPosition
        );
        const precipData = precipitationData.find(
          (p) => p.segmentIndex === nearestSegment
        );
        if (precipData) {
          currentPrecipitation = precipData.intensity;
        }
      }

      // Calculate dynamic radius based on both historical and current precipitation
      const historicalIntensity = parcel.intensity;
      const effectiveIntensity = Math.max(
        historicalIntensity,
        currentPrecipitation
      );
      const radius = this.calculateDynamicRadius(
        effectiveIntensity,
        coordinates
      );

      // Create buffer around water position with dynamic radius
      const bufferFeature = this.createCircularBuffer(coordinates, radius);

      riskZones.push({
        type: "Feature",
        properties: {
          parcelId: parcel.id,
          historicalIntensity: historicalIntensity,
          currentIntensity: currentPrecipitation,
          effectiveIntensity: effectiveIntensity,
          radius: radius,
          timeElapsed: parcel.timeElapsed,
          riskLevel: this.calculateRiskLevel(effectiveIntensity),
          segmentIndex: this.findNearestSegmentIndex(parcel.currentPosition),
        },
        geometry: bufferFeature.geometry,
      });
    });

    return {
      type: "FeatureCollection",
      features: riskZones,
    };
  }

  // Calculate dynamic radius based on precipitation intensity and location factors
  calculateDynamicRadius(intensity, coordinates, baseRadius = 500) {
    // Base radius scaling by precipitation intensity
    let radiusMultiplier = 1;

    if (intensity <= 0.2) return 0; // No flood risk
    if (intensity <= 0.5) radiusMultiplier = 0.3;
    else if (intensity <= 1.0) radiusMultiplier = 0.6;
    else if (intensity <= 2.0) radiusMultiplier = 1.0;
    else if (intensity <= 5.0) radiusMultiplier = 1.5;
    else if (intensity <= 10.0) radiusMultiplier = 2.5;
    else if (intensity <= 20.0) radiusMultiplier = 4.0;
    else if (intensity <= 50.0) radiusMultiplier = 6.0;
    else radiusMultiplier = 8.0; // Extreme precipitation >50mm/h

    // Additional factors that could affect radius:
    // - Terrain slope (flatter areas = larger radius)
    // - Distance from source (accumulation effect)
    // - Soil saturation level
    // - Channel capacity

    const dynamicRadius = baseRadius * radiusMultiplier;

    // Minimum and maximum radius constraints
    return Math.max(100, Math.min(dynamicRadius, 5000));
  }

  // Find nearest segment index based on distance along path
  findNearestSegmentIndex(distanceAlongPath) {
    const distances = this.calculatePathDistances();

    for (let i = 0; i < distances.length - 1; i++) {
      if (
        distanceAlongPath >= distances[i] &&
        distanceAlongPath <= distances[i + 1]
      ) {
        return i;
      }
    }

    return Math.max(0, distances.length - 2);
  }

  // Generate static flood risk zones along entire river path based on current precipitation
  generateStaticRiskZonesAlongPath(precipitationData, baseRadius = 500) {
    if (!precipitationData || precipitationData.length === 0) {
      return {
        type: "FeatureCollection",
        features: [],
      };
    }

    const staticZones = [];

    // Create risk zones for each river segment with precipitation
    for (let i = 0; i < this.riverPath.length - 1; i++) {
      const precipData = precipitationData.find((p) => p.segmentIndex === i);

      if (precipData && precipData.intensity > 0.2) {
        const startCoord = this.riverPath[i];
        const endCoord = this.riverPath[i + 1];

        // Calculate dynamic radius for this segment
        const radius = this.calculateDynamicRadius(
          precipData.intensity,
          startCoord,
          baseRadius
        );

        // Create buffer zones along the segment
        const segmentLength = this.calculateSegmentDistance(i);
        const numPoints = Math.max(3, Math.floor(segmentLength / 200)); // Point every 200m minimum

        for (let j = 0; j < numPoints; j++) {
          const ratio = j / (numPoints - 1);
          const lng = startCoord[0] + (endCoord[0] - startCoord[0]) * ratio;
          const lat = startCoord[1] + (endCoord[1] - startCoord[1]) * ratio;
          const coordinates = [lng, lat];

          // Vary radius slightly along segment for more natural appearance
          const radiusVariation = 1 + Math.sin(ratio * Math.PI) * 0.2; // ±20% variation
          const adjustedRadius = radius * radiusVariation;

          const bufferFeature = this.createCircularBuffer(
            coordinates,
            adjustedRadius
          );

          staticZones.push({
            type: "Feature",
            properties: {
              segmentIndex: i,
              pointIndex: j,
              intensity: precipData.intensity,
              radius: adjustedRadius,
              riskLevel: this.calculateRiskLevel(precipData.intensity),
              isStatic: true,
              coordinates: coordinates,
            },
            geometry: bufferFeature.geometry,
          });
        }
      }
    }

    return {
      type: "FeatureCollection",
      features: staticZones,
    };
  }

  // Calculate distance of a specific segment
  calculateSegmentDistance(segmentIndex) {
    if (segmentIndex >= this.riverPath.length - 1) return 0;

    const [lng1, lat1] = this.riverPath[segmentIndex];
    const [lng2, lat2] = this.riverPath[segmentIndex + 1];
    return calculateDistance(lat1, lng1, lat2, lng2);
  }

  // Generate combined flood risk zones (both moving water and static precipitation zones)
  generateCombinedFloodRiskZones(currentTime, precipitationData = null) {
    const movingWaterZones = this.generateFloodRiskZones(
      currentTime,
      precipitationData
    );
    const staticPrecipZones = precipitationData
      ? this.generateStaticRiskZonesAlongPath(precipitationData)
      : { type: "FeatureCollection", features: [] };

    return {
      type: "FeatureCollection",
      features: [...staticPrecipZones.features, ...movingWaterZones.features],
    };
  }

  // Create circular buffer around a point
  createCircularBuffer(center, radiusInMeters) {
    const points = 32;
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

    return {
      type: "Polygon",
      coordinates: [coords],
    };
  }

  // Calculate risk level based on intensity
  calculateRiskLevel(intensity) {
    if (intensity < 1.0) return "low";
    if (intensity < 5.0) return "moderate";
    if (intensity < 20.0) return "high";
    return "extreme";
  }

  // Clean up old water parcels that have moved past the river end
  cleanupOldParcels(currentTime) {
    const totalDistance = this.getTotalPathDistance();

    this.waterParcels = this.waterParcels.filter((parcel) => {
      const timeElapsed = (currentTime - parcel.birthTime) / 1000;
      const distanceTraveled = this.flowVelocity * timeElapsed;
      const currentPosition = parcel.currentPosition + distanceTraveled;

      return currentPosition <= totalDistance;
    });
  }
}
