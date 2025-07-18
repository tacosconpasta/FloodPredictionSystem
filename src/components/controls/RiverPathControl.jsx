import { useState } from "react";

const RiverPathControl = ({
  riverPath,
  savedPaths,
  onClear,
  onUndo,
  onSave,
  onLoad,
  onDelete,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [pathName, setPathName] = useState("");

  const formatCoordinate = (coord) => {
    return `${coord.toFixed(6)}`;
  };

  const getTotalDistance = () => {
    if (riverPath.length < 2) return 0;

    let totalDistance = 0;
    for (let i = 0; i < riverPath.length - 1; i++) {
      const [lng1, lat1] = riverPath[i];
      const [lng2, lat2] = riverPath[i + 1];
      totalDistance += calculateDistance(lat1, lng1, lat2, lng2);
    }
    return totalDistance;
  };

  const calculateDistance = (lat1, lng1, lat2, lng2) => {
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
  };

  const handleSave = () => {
    if (pathName.trim()) {
      onSave(pathName.trim());
      setPathName("");
      setSaveDialogOpen(false);
    }
  };

  const handleLoad = (name) => {
    if (
      window.confirm(
        `Load river path "${name}"? This will replace the current path.`
      )
    ) {
      onLoad(name);
    }
  };

  const handleDelete = (name) => {
    if (
      window.confirm(
        `Delete river path "${name}"? This action cannot be undone.`
      )
    ) {
      onDelete(name);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">River Path</h3>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-sm text-gray-500 hover:text-gray-800"
        >
          {isExpanded ? "Collapse" : "See Details"}
        </button>
      </div>

      <div className="flex flex-col gap-2">
        <div className="text-sm">
          <div>Points: {riverPath.length}</div>
          {riverPath.length > 1 && (
            <div>
              Total Distance: {(getTotalDistance() / 1000).toFixed(2)} km
            </div>
          )}
        </div>

        <div className="flex gap-2 justify-between">
          <button
            onClick={onUndo}
            disabled={riverPath.length === 0}
            className="bg-slate-500 text-white px-3 py-1 rounded text-sm hover:bg-slate-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            Undo Last
          </button>
          <button
            onClick={onClear}
            disabled={riverPath.length === 0}
            className="bg-red-500 text-white px-3 py-1 rounded text-sm hover:bg-red-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            Clear Path
          </button>
          <button
            onClick={() => setSaveDialogOpen(true)}
            disabled={riverPath.length === 0}
            className="bg-green-500 text-white px-3 py-1 rounded text-sm hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            Save Path
          </button>
        </div>
      </div>

      {/* Save Dialog */}
      {saveDialogOpen && (
        <div className="bg-white border rounded-lg p-4 shadow-lg">
          <h4 className="font-semibold mb-2">Save River Path</h4>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Enter path name..."
              value={pathName}
              onChange={(e) => setPathName(e.target.value)}
              className="flex-1 px-2 py-1 border rounded text-sm"
              onKeyPress={(e) => e.key === "Enter" && handleSave()}
            />
            <button
              onClick={handleSave}
              disabled={!pathName.trim()}
              className="bg-blue-500 text-white px-3 py-1 rounded text-sm hover:bg-blue-600 disabled:bg-gray-300"
            >
              Save
            </button>
            <button
              onClick={() => setSaveDialogOpen(false)}
              className="bg-gray-500 text-white px-3 py-1 rounded text-sm hover:bg-gray-600"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Saved Paths */}
      {savedPaths.length > 0 && (
        <div className="flex flex-col gap-2">
          <h4 className="font-semibold text-sm">
            Saved Paths ({savedPaths.length})
          </h4>
          <div className="max-h-32 overflow-y-auto">
            {savedPaths.map((savedPath) => (
              <div
                key={savedPath.name}
                className="flex items-center justify-between bg-gray-50 p-2 rounded text-sm"
              >
                <div>
                  <div className="font-medium">{savedPath.name}</div>
                  <div className="text-xs text-gray-500">
                    {savedPath.pointCount} points • {savedPath.date}
                  </div>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => handleLoad(savedPath.name)}
                    className="bg-blue-500 text-white px-2 py-1 rounded text-xs hover:bg-blue-600"
                  >
                    Load
                  </button>
                  <button
                    onClick={() => handleDelete(savedPath.name)}
                    className="bg-red-500 text-white px-2 py-1 rounded text-xs hover:bg-red-600"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {isExpanded && riverPath.length > 0 && (
        <div className="max-h-32 overflow-y-auto">
          <div className="text-xs text-gray-500 mb-2">Path Coordinates:</div>
          {riverPath.map((point, index) => (
            <div key={index} className="text-xs text-gray-600 font-mono">
              {index + 1}: [{formatCoordinate(point[0])},{" "}
              {formatCoordinate(point[1])}]
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default RiverPathControl;
