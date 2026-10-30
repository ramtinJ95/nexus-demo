export type Settings = {
  arena: { width: number; height: number };
  ticksPerSecond: number;
  drone: { speed: number; radius: number; fireCooldown: number };
  bullet: { speed: number; ttl: number; radius: number; damage: number };
  pylon: { radius: number; maxIntegrity: number };
  waves: {
    firstWaveBugs: number;
    extraBugsPerWave: number;
    firstSpawnInterval: number;
    spawnIntervalFactor: number;
    minSpawnInterval: number;
    /** Bug speed multiplier added per wave after the first. */
    speedGrowthPerWave: number;
    restSeconds: number;
    firstWaveDelay: number;
  };
};

/** Distances are arena pixels, times are seconds, speeds are pixels per second. */
export const defaultSettings: Settings = {
  arena: { width: 1280, height: 720 },
  ticksPerSecond: 60,
  drone: { speed: 330, radius: 14, fireCooldown: 0.11 },
  bullet: { speed: 950, ttl: 1.2, radius: 4, damage: 1 },
  pylon: { radius: 34, maxIntegrity: 100 },
  waves: {
    firstWaveBugs: 6,
    extraBugsPerWave: 4,
    firstSpawnInterval: 1.1,
    spawnIntervalFactor: 0.85,
    minSpawnInterval: 0.18,
    speedGrowthPerWave: 0.05,
    restSeconds: 3,
    firstWaveDelay: 1.5,
  },
};
