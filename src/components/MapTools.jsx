import { useState } from "react";
import PitchSetter from "./controls/PitchSetter";
import PredictionSetter from "./controls/PredictionSetter";
import RainOpacitySetter from "./controls/RainOpacitySetter";

function MapTools({
  pitchAngle,
  setPitchAngle,
  predictionTime,
  setPredictionTime,
  rainOpacity,
  setRainOpacity,
}) {
  const [open, setOpen] = useState(false);

  const toggleTools = () => setOpen((prev) => !prev);

  return (
    <div className="flex flex-col gap-10">
      <button
        onClick={toggleTools}
        className="bg-slate-800 text-white px-6 py-3 rounded-lg hover:bg-slate-700"
      >
        {open ? "Close Tools" : "Map Tools"}
      </button>

      {open && (
        <div
          className="p-4 bg-white/80 backdrop-blur-md rounded-xl flex flex-col gap-10 max-h-100 overflow-y-auto"
          style={{ boxSizing: "border-box" }}
        >
          <div className="flex flex-col gap-5">
            <p className="">Change pitch angle</p>
            <PitchSetter
              pitchAngle={pitchAngle}
              setPitchAngle={setPitchAngle}
            />
          </div>
          <div className="flex flex-col gap-5">
            <p className="">Change prediction time</p>
            <PredictionSetter
              predictionTime={predictionTime}
              setPredictionTime={setPredictionTime}
            />
          </div>
          <div className="flex flex-col gap-5">
            <p className="">Change rain opacity</p>
            <RainOpacitySetter
              rainOpacity={rainOpacity}
              setRainOpacity={setRainOpacity}
            />
          </div>
          {/* Add more tool components here later */}
        </div>
      )}
    </div>
  );
}

export default MapTools;
