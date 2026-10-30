export type Settings = {
  arena: { width: number; height: number };
  ticksPerSecond: number;
  drone: {
    speed: number;
    radius: number;
    fireCooldown: number;
    /** Knockback decay rate, per second. */
    shoveDamping: number;
  };
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
    /** Every wave whose number is a multiple of this ends with a boss. */
    bossEvery: number;
  };
  fx: {
    /** Turns off screen shake, hit flash and muzzle flash. Particles and the pylon pulse stay. */
    reducedMotion: boolean;
    /** Kick is trauma (0 to 1) added per pylon hit; the offset is maxOffset * trauma². */
    shake: { kick: number; maxOffset: number; decayPerSecond: number };
    hitFlashSeconds: number;
    muzzleFlashSeconds: number;
    pylonPulseSeconds: number;
    /** Drag is the fraction of velocity lost per second. */
    particles: { perHit: number; perDeath: number; speed: number; drag: number; lifeSeconds: number; max: number };
  };
};

/** Distances are arena pixels, times are seconds, speeds are pixels per second. */
export const defaultSettings: Settings = {
  arena: { width: 1280, height: 720 },
  ticksPerSecond: 60,
  drone: { speed: 330, radius: 14, fireCooldown: 0.11, shoveDamping: 7 },
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
    bossEvery: 5,
  },
  fx: {
    reducedMotion: false,
    shake: { kick: 0.7, maxOffset: 9, decayPerSecond: 2.5 },
    hitFlashSeconds: 0.08,
    muzzleFlashSeconds: 0.05,
    pylonPulseSeconds: 0.5,
    particles: { perHit: 5, perDeath: 18, speed: 240, drag: 0.95, lifeSeconds: 0.5, max: 400 },
  },
};
