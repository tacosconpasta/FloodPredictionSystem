function PredictionSetter({ predictionTime, setPredictionTime }) {
  const increaseTime = () => {
    setPredictionTime((prev) => {
      if (prev === 12) return 24; // Salta 18, va directo a 24
      if (prev >= 24) return 24; // No pasa de 24
      return prev + 6;
    });
  };

  const decreaseTime = () => {
    setPredictionTime((prev) => {
      if (prev === 24) return 12; // Al bajar desde 24 va a 12 (salta 18)
      if (prev <= 0) return 0; // No baja de 0
      return prev - 6;
    });
  };

  return (
    <div className="flex items-center gap-4 justify-around bg-slate-100/20 rounded-4xl">
      <button
        onClick={decreaseTime}
        className="bg-slate-300 hover:bg-slate-400 flex items-center justify-center px-4 py-2 rounded-l-md"
      >
        &minus;
      </button>
      <div>{predictionTime}h</div>
      <button
        onClick={increaseTime}
        className="bg-slate-300 hover:bg-slate-400 flex items-center justify-center px-4 py-2 rounded-r-md"
      >
        &#43;
      </button>
    </div>
  );
}

export default PredictionSetter;
