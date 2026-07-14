import { AVAILABLE_TIMESTEPS } from "../../lib/precipitationAnalyzer.js";

function PredictionSetter({ predictionTime, setPredictionTime }) {
  const stepBy = (direction) => {
    setPredictionTime((prev) => {
      const index = AVAILABLE_TIMESTEPS.indexOf(Number(prev));
      const nextIndex = Math.min(
        Math.max(index + direction, 0),
        AVAILABLE_TIMESTEPS.length - 1
      );
      return AVAILABLE_TIMESTEPS[nextIndex];
    });
  };

  return (
    <div className="flex items-center gap-4 justify-around bg-slate-100/20 rounded-4xl">
      <button
        onClick={() => stepBy(-1)}
        className="bg-slate-300 hover:bg-slate-400 flex items-center justify-center px-4 py-2 rounded-l-md"
      >
        &minus;
      </button>
      <div>+{predictionTime}h</div>
      <button
        onClick={() => stepBy(1)}
        className="bg-slate-300 hover:bg-slate-400 flex items-center justify-center px-4 py-2 rounded-r-md"
      >
        &#43;
      </button>
    </div>
  );
}

export default PredictionSetter;
