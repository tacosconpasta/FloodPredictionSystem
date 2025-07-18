// components/FloodRiskManager.jsx
import { useState, useEffect, useRef, useCallback } from "react";
import { FloodRiskCalculator } from "../lib/utils/floodRiskCalculator.js";
import { PrecipitationAnalyzer } from "../lib/precipitationAnalyzer.js";

const FloodRiskManager = ({
  riverPath,
  predictionTime,
  onFloodRiskUpdate,
  flowVelocity = 18, // m/s
}) => {
  const [isActive, setIsActive] = useState(false);
  const [riskZones, setRiskZones] = useState(null);
  const [precipitationData, setPrecipitationData] = useState(null);
  const [analysisStats, setAnalysisStats] = useState(null);
  const [debugInfo, setDebugInfo] = useState("");
  const floodCalculatorRef = useRef(null);
  const precipitationAnalyzerRef = useRef(null);
  const intervalRef = useRef(null);

  // Initialize flood risk calculator and precipitation analyzer when river path changes
  useEffect(() => {
    if (riverPath && riverPath.length > 1) {
      floodCalculatorRef.current = new FloodRiskCalculator(
        riverPath,
        flowVelocity
      );
      precipitationAnalyzerRef.current = new PrecipitationAnalyzer();
    }
  }, [riverPath, flowVelocity]);

  // Analyze real precipitation data along river path using current predictionTime
  const analyzePrecipitationAlongPath = useCallback(async () => {
    if (
      !precipitationAnalyzerRef.current ||
      !riverPath ||
      riverPath.length < 2
    ) {
      setDebugInfo("No analyzer or river path too short");
      return null;
    }

    try {
      setDebugInfo("Starting precipitation analysis...");
      const currentTimeOffset = parseInt(predictionTime) || 0;
      const referenceTimeOffset = currentTimeOffset === 0 ? 6 : 0;

      setDebugInfo(
        `Analyzing ${currentTimeOffset}h vs ${referenceTimeOffset}h...`
      );

      const comparison =
        await precipitationAnalyzerRef.current.comparePrecipitationData(
          riverPath,
          currentTimeOffset,
          referenceTimeOffset,
          10 // zoom level
        );

      setDebugInfo(
        `Analysis complete. Found ${comparison.currentData.length} data points`
      );
      console.log("Precipitation comparison result:", comparison);

      setPrecipitationData(comparison);
      setAnalysisStats(comparison.summary);

      return comparison;
    } catch (error) {
      console.error("Error analyzing precipitation data:", error);
      setDebugInfo(`Error: ${error.message}`);
      return null;
    }
  }, [riverPath, predictionTime]);

  // Update flood risk with real precipitation data using predictionTime
  const updateFloodRiskWithRealData = useCallback(async () => {
    if (
      !floodCalculatorRef.current ||
      !precipitationAnalyzerRef.current ||
      !isActive
    ) {
      return;
    }

    try {
      const comparison = await analyzePrecipitationAlongPath();

      if (comparison && comparison.changes.length > 0) {
        const currentTimeOffset = parseInt(predictionTime) || 0;
        const timestamp = Date.now() - currentTimeOffset * 3600000;

        // Add precipitation changes to flood risk calculator
        comparison.changes.forEach((change) => {
          floodCalculatorRef.current.addPrecipitationData(
            timestamp,
            change.currentIntensity,
            [change.segmentIndex]
          );
        });
      }

      // Generate updated flood risk zones with current precipitation data
      const currentTime = Date.now();
      const currentPrecipitationData = comparison
        ? comparison.currentData
        : null;

      // Use the enhanced method that considers both moving water and current precipitation
      const riskZones =
        floodCalculatorRef.current.generateCombinedFloodRiskZones(
          currentTime,
          currentPrecipitationData
        );

      setRiskZones(riskZones);

      // Clean up old water parcels
      floodCalculatorRef.current.cleanupOldParcels(currentTime);

      // Notify parent component of updated risk zones
      if (onFloodRiskUpdate) {
        onFloodRiskUpdate(riskZones);
      }

      return { riskZones, precipitationData: comparison };
    } catch (error) {
      console.error("Error updating flood risk with real data:", error);
      return null;
    }
  }, [
    isActive,
    predictionTime,
    analyzePrecipitationAlongPath,
    onFloodRiskUpdate,
  ]);

  // Start flood risk monitoring with real precipitation analysis
  const startMonitoring = async () => {
    setIsActive(true);

    // Perform initial analysis
    await updateFloodRiskWithRealData();

    // Start real-time updates every 2 minutes
    intervalRef.current = setInterval(() => {
      updateFloodRiskWithRealData();
    }, 120000); // Update every 2 minutes (to avoid overwhelming the tile server)
  };

  // Stop flood risk monitoring
  const stopMonitoring = () => {
    setIsActive(false);
    setRiskZones(null);

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // Clear risk zones from map
    if (onFloodRiskUpdate) {
      onFloodRiskUpdate(null);
    }
  };

  // Handle prediction time changes - reanalyze precipitation
  useEffect(() => {
    if (isActive && predictionTime !== undefined) {
      // Re-analyze precipitation when prediction time changes
      updateFloodRiskWithRealData();
    }
  }, [predictionTime, isActive, updateFloodRiskWithRealData]);

  return (
    <div className="flex flex-col gap-4 p-4 bg-white/80 backdrop-blur-md rounded-xl">
      <h3 className="text-lg font-semibold">Flood Risk Analysis</h3>

      {!riverPath || riverPath.length < 2 ? (
        <div className="text-sm text-gray-500">
          Please create a river path first to analyze flood risk.
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <div className="text-sm">
              <div>River Path Length: {riverPath.length} points</div>
              <div>Flow Velocity: {flowVelocity} m/s</div>
              <div>Status: {isActive ? "Active" : "Inactive"}</div>
              <div>
                Prediction Time: {predictionTime}h{" "}
                {predictionTime === "0" ? "(Current)" : "(Forecast)"}
              </div>
            </div>

            {debugInfo && (
              <div className="text-xs bg-gray-100 p-2 rounded">
                <div className="font-medium">Debug Info:</div>
                <div>{debugInfo}</div>
              </div>
            )}

            {analysisStats && (
              <div className="text-sm bg-blue-50 p-2 rounded">
                <div className="font-medium text-blue-800">
                  Precipitation Analysis
                </div>
                <div>
                  Affected Segments: {analysisStats.affectedSegments}/
                  {analysisStats.totalSegments}
                </div>
                <div>
                  Max Intensity: {analysisStats.maxIntensity.toFixed(1)} mm/h
                </div>
                <div>
                  Average Intensity: {analysisStats.averageIntensity.toFixed(1)}{" "}
                  mm/h
                </div>
                {precipitationData?.timeOffsets && (
                  <div className="text-xs text-gray-600">
                    Comparing {precipitationData.timeOffsets.current}h vs{" "}
                    {precipitationData.timeOffsets.reference}h
                  </div>
                )}
              </div>
            )}

            {riskZones && (
              <div className="text-sm bg-red-50 p-2 rounded">
                <div className="font-medium text-red-800">Flood Risk Zones</div>
                <div>Active Risk Zones: {riskZones.features.length}</div>
                {riskZones.features.length > 0 && (
                  <div className="text-xs text-gray-600">
                    Risk Levels:{" "}
                    {[
                      ...new Set(
                        riskZones.features.map((f) => f.properties.riskLevel)
                      ),
                    ].join(", ")}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex gap-2">
            {!isActive ? (
              <button
                onClick={startMonitoring}
                className="bg-blue-500 text-white px-4 py-2 rounded text-sm hover:bg-blue-600"
              >
                Start Monitoring
              </button>
            ) : (
              <button
                onClick={stopMonitoring}
                className="bg-red-500 text-white px-4 py-2 rounded text-sm hover:bg-red-600"
              >
                Stop Monitoring
              </button>
            )}

            <button
              onClick={updateFloodRiskWithRealData}
              disabled={!isActive}
              className="bg-green-500 text-white px-4 py-2 rounded text-sm hover:bg-green-600 disabled:bg-gray-300"
            >
              Analyze Now
            </button>
          </div>

          {precipitationData && precipitationData.changes.length > 0 && (
            <div className="border-t pt-2">
              <div className="text-sm font-medium mb-2">
                Recent Precipitation Changes
              </div>
              <div className="max-h-32 overflow-y-auto">
                {precipitationData.changes.slice(0, 5).map((change, index) => (
                  <div
                    key={index}
                    className="text-xs bg-orange-50 p-2 rounded mb-1"
                  >
                    <div>
                      Segment {change.segmentIndex}:{" "}
                      {change.currentIntensity.toFixed(1)} mm/h
                    </div>
                    <div className="text-gray-600">
                      Change: +{change.intensityChange.toFixed(1)} mm/h
                      {change.floodRadius &&
                        ` • Radius: ${Math.round(change.floodRadius)}m`}
                    </div>
                  </div>
                ))}
                {precipitationData.changes.length > 5 && (
                  <div className="text-xs text-gray-500">
                    ...and {precipitationData.changes.length - 5} more changes
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default FloodRiskManager;
