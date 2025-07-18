import { Map } from "@vis.gl/react-maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import { useState, useEffect } from "react";
import MapTools from "./components/MapTools.jsx";
import RiverPathControls from "./components/controls/RiverPathControl.jsx";
import { createMapStyle } from "./lib/utils/createMapStyle.js";
import {
  saveRiverPath,
  loadRiverPath,
  getSavedRiverPaths,
  deleteRiverPath,
} from "./lib/createRiverPathStorage.js";

function App() {
  const centerPanama = [9.001167, -79.507581];
  const [predictionTime, setPredictionTime] = useState("0");
  const [rainOpacity, setRainOpacity] = useState(0.3);
  const [riverPath, setRiverPath] = useState([]);
  const [savedPaths, setSavedPaths] = useState([]);
  const [controlsOpen, setControlsOpen] = useState(true);

  // Load saved paths on component mount
  useEffect(() => {
    setSavedPaths(getSavedRiverPaths());
  }, []);

  // Handle map click to add river path points
  const handleMapClick = (event) => {
    const { lng, lat } = event.lngLat;
    setRiverPath((prev) => [...prev, [lng, lat]]);
  };

  // Clear river path
  const clearRiverPath = () => {
    setRiverPath([]);
  };

  // Remove last point from river path
  const undoLastPoint = () => {
    setRiverPath((prev) => prev.slice(0, -1));
  };

  // Save current river path
  const saveCurrentPath = (name) => {
    if (riverPath.length === 0) {
      alert("No river path to save");
      return;
    }

    const success = saveRiverPath(name, riverPath);
    if (success) {
      setSavedPaths(getSavedRiverPaths());
      alert(`River path "${name}" saved successfully!`);
    } else {
      alert(`A river path with the name "${name}" already exists.`);
    }
  };

  // Load a saved river path
  const loadSavedPath = (name) => {
    const path = loadRiverPath(name);
    if (path) {
      setRiverPath(path);
    } else {
      alert(`Could not load river path "${name}"`);
    }
  };

  // Delete a saved river path
  const deleteSavedPath = (name) => {
    const success = deleteRiverPath(name);
    if (success) {
      setSavedPaths(getSavedRiverPaths());
      alert(`River path "${name}" deleted successfully!`);
    } else {
      alert(`Could not delete river path "${name}"`);
    }
  };

  // Generate map style with river path
  const mapStyle = createMapStyle({
    predictionTime,
    rainOpacity,
    riverPath,
  });

  const [pitchAngle, setPitchAngle] = useState(40);

  return (
    <div
      className="h-lvh w-lvw flex flex-col"
      style={{ backgroundImage: "url(./imgs/skyShader.png)" }}
    >
      <Map
        initialViewState={{
          longitude: centerPanama[1],
          latitude: centerPanama[0],
          zoom: 6,
        }}
        pitch={pitchAngle}
        maxPitch={85}
        maxZoom={18}
        mapStyle={mapStyle}
        onClick={handleMapClick}
      />
      <div className="m-10 absolute text-1xl bg-slate-100/80 backdrop-blur-3xl px-20 py-20 flex justify-center align-middle flex-col gap-5 rounded-2xl max-h-11/12 overflow-y-auto">
        <button
          onClick={() => setControlsOpen(!controlsOpen)}
          className="text-sm px-4 py-2 bg-slate-500 text-white rounded-md hover:bg-slate-600"
        >
          {controlsOpen ? "Hide Controls" : "Show Controls"}
        </button>

        {controlsOpen && (
          <div className="flex flex-col gap-10">
            <MapTools
              pitchAngle={pitchAngle}
              setPitchAngle={setPitchAngle}
              predictionTime={predictionTime}
              setPredictionTime={setPredictionTime}
              rainOpacity={rainOpacity}
              setRainOpacity={setRainOpacity}
            />
            <RiverPathControls
              riverPath={riverPath}
              savedPaths={savedPaths}
              onClear={clearRiverPath}
              onUndo={undoLastPoint}
              onSave={saveCurrentPath}
              onLoad={loadSavedPath}
              onDelete={deleteSavedPath}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
