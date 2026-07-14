// components/FloodRiskManager.jsx
import { useState, useEffect, useRef, useCallback } from "react";
import { FloodRiskCalculator } from "../lib/utils/floodRiskCalculator.js";
import { PrecipitationAnalyzer } from "../lib/precipitationAnalyzer.js";

const FloodRiskManager = ({
  riverPath,
  predictionTime,
  onFloodRiskUpdate,
  riverSpeed,
  setRiverSpeed,
  riverWidth,
  setRiverWidth,
}) => {
  const [isActive, setIsActive] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [rainfall, setRainfall] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [statusMessage, setStatusMessage] = useState("");
  const analyzerRef = useRef(null); // persists so the tile cache survives re-analysis
  if (!analyzerRef.current) analyzerRef.current = new PrecipitationAnalyzer();

  const runAnalysis = useCallback(async () => {
    if (!riverPath || riverPath.length < 2) {
      setStatusMessage("River path too short to analyze");
      return;
    }

    setIsAnalyzing(true);
    try {
      setStatusMessage("Sampling precipitation tiles...");
      const rain = await analyzerRef.current.analyzeRainfallAlongPath(
        riverPath,
        Number(predictionTime) || 0
      );
      setRainfall(rain);

      const calculator = new FloodRiskCalculator(riverPath, {
        riverSpeed: Number(riverSpeed),
        riverWidth: Number(riverWidth),
      });
      const result = calculator.analyze(rain.points, rain.intervalHours);
      setAnalysis(result);

      onFloodRiskUpdate?.(calculator.generateFloodRiskZones(result));
      setStatusMessage(
        `Analyzed ${rain.points.length} points using the +${
          rain.timeOffsets.current
        }h and ${
          rain.timeOffsets.next !== null
            ? `+${rain.timeOffsets.next}h`
            : "(last)"
        } parcels (${rain.intervalHours}h interval)`
      );
    } catch (error) {
      console.error("Error analyzing flood risk:", error);
      setStatusMessage(`Error: ${error.message}`);
    } finally {
      setIsAnalyzing(false);
    }
  }, [riverPath, predictionTime, riverSpeed, riverWidth, onFloodRiskUpdate]);

  // Keep a ref to the latest analysis function so the effects below don't
  // re-fire just because a parent render recreated a callback prop.
  const runAnalysisRef = useRef(runAnalysis);
  useEffect(() => {
    runAnalysisRef.current = runAnalysis;
  }, [runAnalysis]);

  // Re-analyze when the inputs that affect the result change
  useEffect(() => {
    if (!isActive) return;
    runAnalysisRef.current();
  }, [isActive, riverPath, predictionTime, riverSpeed, riverWidth]);

  // Periodic refresh while monitoring (tiles update every 6h; poll gently)
  useEffect(() => {
    if (!isActive) return;
    const id = setInterval(() => runAnalysisRef.current(), 120000);
    return () => clearInterval(id);
  }, [isActive]);

  const stopMonitoring = () => {
    setIsActive(false);
    setAnalysis(null);
    setRainfall(null);
    setStatusMessage("");
    onFloodRiskUpdate?.(null);
  };

  return (
    <div className="flex flex-col gap-4 p-4 bg-white/80 backdrop-blur-md rounded-xl">
      <h3 className="text-lg font-semibold">Flood Risk Analysis</h3>

      {!riverPath || riverPath.length < 2 ? (
        <div className="text-sm text-gray-500">
          Please create a river path first to analyze flood risk.
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2 text-sm">
            <label className="flex items-center justify-between gap-2">
              <span>Avg. river speed (m/s)</span>
              <input
                type="number"
                min="0.1"
                step="0.1"
                value={riverSpeed}
                onChange={(e) => setRiverSpeed(e.target.value)}
                className="w-24 px-2 py-1 border border-slate-300 rounded-md bg-white"
              />
            </label>
            <label className="flex items-center justify-between gap-2">
              <span>Avg. river width (m)</span>
              <input
                type="number"
                min="1"
                step="5"
                value={riverWidth}
                onChange={(e) => setRiverWidth(e.target.value)}
                className="w-24 px-2 py-1 border border-slate-300 rounded-md bg-white"
              />
            </label>
            <div className="text-xs text-gray-600">
              Flushing capacity: {(Number(riverSpeed) * Number(riverWidth) || 0).toFixed(0)}{" "}
              m³/s per meter of water-level rise
            </div>

            <div>
              River path: {riverPath.length} points · Forecast: +
              {predictionTime}h {Number(predictionTime) === 0 && "(now)"}
            </div>

            {statusMessage && (
              <div className="text-xs bg-gray-100 p-2 rounded">
                {statusMessage}
              </div>
            )}

            {rainfall && (
              <div className="bg-blue-50 p-2 rounded">
                <div className="font-medium text-blue-800">Precipitation</div>
                <div>
                  Raining on {rainfall.summary.rainingPoints}/
                  {rainfall.summary.totalPoints} points
                </div>
                <div>
                  Max rate: {rainfall.summary.maxRate.toFixed(1)} mm/h · Avg:{" "}
                  {rainfall.summary.averageRate.toFixed(1)} mm/h
                </div>
                <div>
                  Max accumulation next {rainfall.intervalHours}h:{" "}
                  {rainfall.summary.maxAccumulationMm.toFixed(1)} mm
                </div>
              </div>
            )}

            {analysis && (
              <div className="bg-red-50 p-2 rounded">
                <div className="font-medium text-red-800">Hydrology</div>
                <div>
                  Peak storm discharge:{" "}
                  {analysis.summary.peakDischargeM3s.toFixed(1)} m³/s
                </div>
                <div>
                  Peak water-level rise: {analysis.summary.peakRiseM.toFixed(2)}{" "}
                  m
                </div>
                <div>
                  Rain volume reaching river:{" "}
                  {Math.round(
                    analysis.summary.totalRainVolumeM3
                  ).toLocaleString()}{" "}
                  m³
                </div>
                <div>
                  At-risk points: {analysis.summary.floodedPoints}/
                  {analysis.summary.totalPoints}
                </div>
                <div className="text-xs text-gray-600">
                  Water travels the full path in{" "}
                  {analysis.summary.pathTravelTimeH.toFixed(1)}h at{" "}
                  {analysis.riverSpeed} m/s
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            {!isActive ? (
              <button
                onClick={() => setIsActive(true)}
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
              onClick={runAnalysis}
              disabled={isAnalyzing}
              className="bg-green-500 text-white px-4 py-2 rounded text-sm hover:bg-green-600 disabled:bg-gray-300"
            >
              {isAnalyzing ? "Analyzing..." : "Analyze Now"}
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default FloodRiskManager;
