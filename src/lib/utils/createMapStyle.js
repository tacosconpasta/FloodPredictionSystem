export const createMapStyle = ({
  predictionTime,
  rainOpacity,
  riverPath = [],
  floodRiskZones = null,
}) => {
  const baseStyle = {
    version: 8,
    sources: {
      osm: {
        type: "raster",
        tiles: ["https://a.tile.openstreetmap.org/{z}/{x}/{y}.png"],
        tileSize: 256,
        attribution: "&copy; OpenStreetMap Contributors",
        maxzoom: 19,
      },
      terrainSource: {
        type: "raster-dem",
        tiles: [
          "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png",
        ],
        encoding: "terrarium",
        tileSize: 256,
      },
      rainOverlay: {
        type: "raster",
        tiles: [
          `https://weather.openportguide.de/tiles/actual/precipitation_shaded/${predictionTime}h/{z}/{x}/{y}.png`,
        ],
        tileSize: 256,
        // The weather tile server only publishes zooms 0-7; deeper requests
        // 404 (and the 404 page lacks CORS headers). MapLibre overzooms
        // the z7 tiles beyond this.
        maxzoom: 7,
        attribution: "© OpenPortGuide.de",
      },
    },
    layers: [
      {
        id: "osm",
        type: "raster",
        source: "osm",
      },
      {
        id: "terrain",
        type: "hillshade",
        source: "terrainSource",
        paint: {
          "hillshade-shadow-color": "#444",
          "hillshade-highlight-color": "#fff",
          "hillshade-exaggeration": 0.1,
        },
      },
      {
        id: "rain-overlay",
        type: "raster",
        source: "rainOverlay",
        paint: {
          "raster-opacity": rainOpacity,
        },
      },
    ],
    terrain: {
      source: "terrainSource",
      exaggeration: 4,
    },
  };

  // Add flood risk zones (rendered below the river path)
  if (floodRiskZones && floodRiskZones.features?.length > 0) {
    baseStyle.sources.floodRiskZones = {
      type: "geojson",
      data: floodRiskZones,
    };

    const riskColor = [
      "match",
      ["get", "riskLevel"],
      "low",
      "#fbbf24", // amber
      "moderate",
      "#f97316", // orange
      "high",
      "#ef4444", // red
      "extreme",
      "#7f1d1d", // dark red
      "#94a3b8", // fallback slate
    ];

    baseStyle.layers.push(
      {
        id: "flood-risk-fill",
        type: "fill",
        source: "floodRiskZones",
        paint: {
          "fill-color": riskColor,
          "fill-opacity": 0.35,
        },
      },
      {
        id: "flood-risk-outline",
        type: "line",
        source: "floodRiskZones",
        paint: {
          "line-color": riskColor,
          "line-width": 1.5,
          "line-opacity": 0.8,
        },
      }
    );
  }

  // Add river path if it exists
  if (riverPath && riverPath.length > 0) {
    baseStyle.sources.riverPath = {
      type: "geojson",
      data: {
        type: "Feature",
        properties: {},
        geometry: {
          type: "LineString",
          coordinates: riverPath,
        },
      },
    };

    // Add river path layer
    baseStyle.layers.push({
      id: "river-path",
      type: "line",
      source: "riverPath",
      paint: {
        "line-color": "#0ea5e9",
        "line-width": ["interpolate", ["linear"], ["zoom"], 6, 2, 10, 4, 16, 8],
        "line-opacity": 0.8,
      },
    });

    // Add river path points
    baseStyle.sources.riverPathPoints = {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: riverPath.map((point, index) => ({
          type: "Feature",
          properties: {
            index: index,
            isStart: index === 0,
            isEnd: index === riverPath.length - 1,
          },
          geometry: {
            type: "Point",
            coordinates: point,
          },
        })),
      },
    };

    baseStyle.layers.push({
      id: "river-path-points",
      type: "circle",
      source: "riverPathPoints",
      paint: {
        "circle-radius": [
          "case",
          ["get", "isStart"],
          8,
          ["get", "isEnd"],
          8,
          4,
        ],
        "circle-color": [
          "case",
          ["get", "isStart"],
          "#10b981", // Green for start
          ["get", "isEnd"],
          "#ef4444", // Red for end
          "#0ea5e9", // Blue for middle points
        ],
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 2,
        "circle-opacity": 0.9,
      },
    });
  }

  return baseStyle;
};
