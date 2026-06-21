
export class Stopwatch {
  startTime: number | null = null;
  endTime: number | null = null;
  elapsedTime = 0;

  constructor() {
    this.reset();
  }

  start(): void {
    this.startTime = Date.now();
  }

  stop(): void {
    this.endTime = Date.now();
    this.elapsedTime = this.endTime - (this.startTime ?? 0);
  }

  reset(): void {
    this.startTime = null;
    this.endTime = null;
    this.elapsedTime = 0;
  }

  static startNew(): Stopwatch {
    const sw = new Stopwatch();
    sw.start();
    return sw;
  }
}
