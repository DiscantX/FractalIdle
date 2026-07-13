
/**
 * 
 * 
 * 
 * 
 * 
 * 
 * 
 * 
 * 
 * 
 * WARNING: SPOILERS
 * 
 * 
 * 
 * 
 * 
 * 
 * 
 * 
 * 
 * 
 * YOU WERE WARNED!
 * 
 * 
 * 
 * 
 * 
 * 
 * 
 * "The boundary always contained the whole."
 * 
 * This class is meant for an end game reveal in which the fractal dissolves away,
 * revealing the that the universe is made of pure math, similar to the holographic principle.
 * It will replace pixels with characters from math equations used in the game,
 * all colored to the fractal's corresponding pixel that it lies upon.
 * 
 */
class HolographicDissolveRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  // The vocabulary of the dimensional ship decoding reality
  private mathGlyphs: string[] = [
    "z", "=", "z²", "+", "c", "δz", "ν", "n+1", "λ", "μ", 
    "lim", "➔", "∞", "log", "Re", "Im", "∇", "∂", "||z||"
  ];

  constructor(canvasElement: HTMLCanvasElement) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d')!;
  }

  /**
   * Transforms the raw perturbation pixel data into raw math symbols.
   * @param perturbationBuffer Uint32Array from your Web Worker containing raw RGBA pixel data
   * @param dissolveAmount Slider value from 0.0 (Pure Fractal) to 1.0 (Pure Formula)
   */
  public renderHolographicFrame(perturbationBuffer: Uint32Array, dissolveAmount: number) {
    const width = this.canvas.width;
    const height = this.canvas.height;

    // Clear screen
    this.ctx.fillStyle = "#000000";
    this.ctx.fillRect(0, 0, width, height);

    // 1. CHOOSE GRID DENSITY
    // Scale glyph size from 12px down to 8px to pack information tightly
    const fontSize = 10; 
    this.ctx.font = `bold ${fontSize}px "Courier New", monospace`;
    this.ctx.textBaseline = "top";

    // Step across the screen in increments of font size to build a perfect grid
    const stepX = fontSize + 2; 
    const stepY = fontSize + 4;

    let glyphIndex = 0;

    for (let y = 0; y < height; y += stepY) {
      for (let x = 0; x < width; x += stepX) {
        
        // 2. SAMPLE SOURCE COLOR FROM PERTURBATION BUFFER
        // Grab the exact pixel sitting underneath this grid sector
        const bufferIndex = y * width + x;
        const rawColor = perturbationBuffer[bufferIndex];

        // Unpack RGBA from the Uint32 array
        const r = rawColor & 0xFF;
        const g = (rawColor >> 8) & 0xFF;
        const b = (rawColor >> 16) & 0xFF;
        const a = ((rawColor >> 24) & 0xFF) / 255;

        // Skip completely empty space to optimize performance
        if (r === 0 && g === 0 && b === 0) continue;

        // 3. APPLY HOLOGRAPHIC MORPH LOGIC
        // Pick a mathematical glyph sequentially to create a flowing data field
        const glyph = this.mathGlyphs[glyphIndex % this.mathGlyphs.length];
        glyphIndex++;

        // Calculate a visual transition state
        this.ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${a * dissolveAmount})`;

        // 4. DRAW MATH GLYPH INSTEAD OF PIXEL BLOCK
        this.ctx.fillText(glyph, x, y);
      }
    }

    // 5. BLEND WITH BACKGROUND COCKPIT TEXTURE
    // If dissolveAmount < 1.0, you can use the canvas composite mode to draw 
    // the soft, faded original fractal structures directly underneath the code matrix!
    if (dissolveAmount < 1.0) {
      this.ctx.globalCompositeOperation = "destination-over";
      // Render your classic standard canvas chunk-texture frame here
      this.ctx.globalCompositeOperation = "source-over";
    }
  }
}
