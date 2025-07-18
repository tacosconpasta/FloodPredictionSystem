const STORAGE_KEY = "riverPaths";

// Save a river path to localStorage
export const saveRiverPath = (name, path) => {
  try {
    const existingPaths = getSavedRiverPaths();

    // Check if name already exists
    if (existingPaths.some((p) => p.name === name)) {
      return false;
    }

    const newPath = {
      name,
      path,
      pointCount: path.length,
      date: new Date().toLocaleDateString(),
      timestamp: Date.now(),
    };

    const updatedPaths = [...existingPaths, newPath];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedPaths));
    return true;
  } catch (error) {
    console.error("Error saving river path:", error);
    return false;
  }
};

// Load a specific river path
export const loadRiverPath = (name) => {
  try {
    const savedPaths = getSavedRiverPaths();
    const path = savedPaths.find((p) => p.name === name);
    return path ? path.path : null;
  } catch (error) {
    console.error("Error loading river path:", error);
    return null;
  }
};

// Get all saved river paths
export const getSavedRiverPaths = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error("Error getting saved river paths:", error);
    return [];
  }
};

// Delete a saved river path
export const deleteRiverPath = (name) => {
  try {
    const existingPaths = getSavedRiverPaths();
    const updatedPaths = existingPaths.filter((p) => p.name !== name);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedPaths));
    return true;
  } catch (error) {
    console.error("Error deleting river path:", error);
    return false;
  }
};

// Get storage statistics
export const getStorageStats = () => {
  try {
    const paths = getSavedRiverPaths();
    const totalPaths = paths.length;
    const totalPoints = paths.reduce((sum, path) => sum + path.pointCount, 0);

    return {
      totalPaths,
      totalPoints,
      oldestPath:
        paths.length > 0 ? Math.min(...paths.map((p) => p.timestamp)) : null,
      newestPath:
        paths.length > 0 ? Math.max(...paths.map((p) => p.timestamp)) : null,
    };
  } catch (error) {
    console.error("Error getting storage stats:", error);
    return {
      totalPaths: 0,
      totalPoints: 0,
      oldestPath: null,
      newestPath: null,
    };
  }
};
