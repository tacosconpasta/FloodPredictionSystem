function RainOpacitySetter({ rainOpacity, setRainOpacity }) {
  const increaseOpacity = () => {
    setRainOpacity((prev) => {
      const next = Math.min(prev + 0.3, 0.9);
      return Math.round(next * 10) / 10; // round to 1 decimal place
    });
  };

  const decreaseOpacity = () => {
    setRainOpacity((prev) => {
      const next = Math.max(prev - 0.3, 0);
      return Math.round(next * 10) / 10; // round to 1 decimal place
    });
  };

  return (
    <div className="flex items-center gap-4 justify-around bg-slate-100/20 rounded-4xl">
      <button
        onClick={decreaseOpacity}
        className="bg-slate-300 hover:bg-slate-400 flex items-center justify-center px-4 py-2 rounded-l-md"
      >
        &minus;
      </button>
      <div>{rainOpacity}</div>
      <button
        onClick={increaseOpacity}
        className="bg-slate-300 hover:bg-slate-400 flex items-center justify-center px-4 py-2 rounded-r-md"
      >
        &#43;
      </button>
    </div>
  );
}

export default RainOpacitySetter;
