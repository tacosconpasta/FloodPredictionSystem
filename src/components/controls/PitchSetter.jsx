function PitchSetter({ pitchAngle, setPitchAngle }) {
  const increasePitch = () => {
    setPitchAngle((prev) => Math.min(prev + 5, 85));
  };

  const decreasePitch = () => {
    setPitchAngle((prev) => Math.max(prev - 5, 0));
  };

  return (
    <div className="flex items-center gap-4 justify-around bg-slate-100/20 rounded-4xl">
      <button
        onClick={decreasePitch}
        className="bg-slate-300 hover:bg-slate-400 flex items-center justify-center px-4 py-2 rounded-l-md"
      >
        &minus;
      </button>
      <div>{pitchAngle}°</div>
      <button
        onClick={increasePitch}
        className="bg-slate-300 hover:bg-slate-400 flex items-center justify-center px-4 py-2 rounded-r-md"
      >
        &#43;
      </button>
    </div>
  );
}

export default PitchSetter;
