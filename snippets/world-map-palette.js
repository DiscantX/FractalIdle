/**
 * A premium palette that generates a realistic looking world map texture.
 */

class WorldMapColorizer {
  // 1. THE DEFIANT NAUTICAL PALETTE (RGBA values formatted as Uint32)
  // In JavaScript, RGBA colors are packed inside an integer in reverse order: 0xAABBGGRR
  private static readonly COLOR_VOID       = 0xFF639D66; // Forest Green (Inside the Cardioid/Bulbs)
  private static readonly COLOR_MOUNTAIN_2 = 0xFF5369A1; // Rugged Brown Peaks
  private static readonly COLOR_MOUNTAIN_1 = 0xFF7CA1C4; // Soft Highland Tan
  private static readonly COLOR_PLAINS     = 0xFF83BA8A; // Fertile Landmass Green
  
  // Ocean Terraces (From Shallow Coast to Midnight Trench)
  private static readonly OCEAN_SHALLOW   = 0xFFDFBF9E; // Bright Aqua Coast
  private static readonly OCEAN_MID       = 0xFFCBAC89; // Classic Sea Blue
  private static readonly OCEAN_DEEP      = 0xFFB99874; // Deep Ocean Blue
  private static readonly OCEAN_TRENCH    = 0xFF9E7C57; // Dark Maritime Blue

  /**
   * Translates a pixel's escape status into geographical topography.
   */
  public static getColor(iteration: number, maxIterations: number): number {
    // CONDITION A: THE MAIN CONTINENT (Inside the Mandelbrot Set)
    // Points that never escape are treated as solid, safe landmass
    if (iteration === maxIterations) {
      return this.COLOR_VOID;
    }

    // Normalize the iteration to a clean 0.0 to 1.0 percentage scale
    const progress = iteration / maxIterations;

    // CONDITION B: THE HIGH PEAKS & HIGHLANDS (Very close to the boundary)
    if (progress > 0.90) {
      return this.COLOR_MOUNTAIN_2;
    }
    if (progress > 0.70) {
      return this.COLOR_MOUNTAIN_1;
    }
    if (progress > 0.50) {
      return this.COLOR_PLAINS;
    }

    // CONDITION C: THE OCEAN DEPTHS (Hard-stepped contours based on raw iteration counts)
    // Instead of smooth fractions, checking exact thresholds creates the distinct map lines
    if (iteration > 64) {
      return this.OCEAN_SHALLOW;
    } else if (iteration > 24) {
      return this.OCEAN_MID;
    } else if (iteration > 8) {
      return this.OCEAN_DEEP;
    } else {
      return this.OCEAN_TRENCH;
    }
  }
}
