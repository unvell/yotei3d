
import { Vec2, Matrix3 } from "@/math"

////////// Point //////////

// Point is an alias of Vec2 (the former bespoke Point class is kept commented
// in git history). Drawing helpers accept any { x, y } point-like value.
export { Vec2 as Point };

type Pt = { x: number; y: number };
type ColorLike = string | null | undefined;

////////// Size //////////

export class Size {
  width = 0;
  height = 0;
  _arr: number[];

  constructor(w?: number, h?: number) {
    switch (arguments.length) {
      case 0:
        this.width = 0;
        this.height = 0;
        break;

      case 1: {
        const obj: any = arguments;
        if (typeof obj === "object") {
          this.width = obj.width;
          this.height = obj.height;
        }
        break;
      }

      case 2:
        this.width = w!;
        this.height = h!;
        break;
    }

    this._arr = [this.width, this.height];
  }

  clone(): Size {
    return new Size(this.width, this.height);
  }

  toArray(): number[] {
    this._arr[0] = this.width;
    this._arr[1] = this.height;
    return this._arr;
  }
}

////////// BBox2D //////////

export class BBox2D {
  min!: Vec2;
  max!: Vec2;

  constructor(a?: any, b?: any, c?: any, d?: any) {
    switch (arguments.length) {
      case 0:
        this.min = Vec2.zero.clone();
        this.max = Vec2.zero.clone();
        break;

      case 2:
        this.min = a;
        this.max = b;
        break;

      case 4:
        this.min.x = a;
        this.min.y = b;
        this.max.x = c;
        this.max.y = d;
        break;

      default:
        throw new Error("BBox2D: unsupported argument count");
    }
  }

  set(...args: any[]): void {
    switch (args.length) {
      case 1: {
        const bbox2 = args[0];
        if (bbox2 instanceof BBox2D) {
          this.min = bbox2.min.clone();
          this.max = bbox2.max.clone();
        }
        break;
      }
    }
  }

  get size(): Size {
    return new Size(this.max.x - this.min.x,
      this.max.y - this.min.y);
  }

  get origin(): Vec2 {
    const size = this.size;
    return new Vec2(this.min.x + size.width * 0.5,
      this.min.y + size.height * 0.5);
  }

  get rect(): Rect {
    const size = this.size;
    return new Rect(this.min.x, this.min.y, size.width, size.height);
  }

  expendToBBox(bbox: BBox2D): void {
    if (this.min.x > bbox.min.x) this.min.x = bbox.min.x;
    if (this.min.y > bbox.min.y) this.min.y = bbox.min.y;
    if (this.max.x < bbox.max.x) this.max.x = bbox.max.x;
    if (this.max.y < bbox.max.y) this.max.y = bbox.max.y;
  }

  updateFromTwoPoints(p1: Pt, p2: Pt): void {
    this.min.x = Math.min(p1.x, p2.x);
    this.min.y = Math.min(p1.y, p2.y);
    this.max.x = Math.max(p1.x, p2.x);
    this.max.y = Math.max(p1.y, p2.y);
  }

  updateFrom4Points(p1: Pt, p2: Pt, p3: Pt, p4: Pt): void {
    this.min.x = Math.min(p1.x, Math.min(p2.x, Math.min(p3.x, p4.x)));
    this.min.y = Math.min(p1.y, Math.min(p2.y, Math.min(p3.y, p4.y)));
    this.max.x = Math.max(p1.x, Math.max(p2.x, Math.max(p3.x, p4.x)));
    this.max.y = Math.max(p1.x, Math.max(p2.x, Math.max(p3.x, p4.x)));
  }

  updateFromTwoBoundingBoxes(b1: BBox2D, b2: BBox2D): void {
    this.updateFrom4Points(b1.min, b1.max, b2.min, b2.max);
  }

  updateFromPoints(...args: Pt[]): void {
    if (args.length < 1) {
      throw new Error("number of arguments must be greater than 1");
    }

    this.min.x = args[0].x; this.min.y = args[0].y;
    this.max.x = args[0].x; this.max.y = args[0].y;

    for (let i = 1; i < args.length; i++) {
      const x = args[i].x, y = args[i].y;
      if (this.min.x > x) this.min.x = x;
      if (this.min.y > y) this.min.y = y;
      if (this.max.x > x) this.max.x = x;
      if (this.max.y > y) this.max.y = y;
    }
  }

  updateFromPolygon(p: number[][]): void {
    if (p.length <= 0) {
      throw new Error("polygon doesn't contain any points");
    }

    this.min.x = p[0][0]; this.min.y = p[0][1];
    this.max.x = p[0][0]; this.max.y = p[0][1];

    for (let i = 0; i < p.length; i++) {
      const px = p[i][0], py = p[i][1];

      if (this.min.x > px) this.min.x = px;
      if (this.min.y > py) this.min.y = py;
      if (this.max.x < px) this.max.x = px;
      if (this.max.y < py) this.max.y = py;
    }
  }

  contains(p: Pt): boolean {
    return p.x >= this.min.x && p.x <= this.max.x
      && p.y >= this.min.y && p.y <= this.max.y;
  }

  intersectsBBox2D(box2: BBox2D): boolean | void {
    if (this.max.x < box2.min.x) return false;
    if (this.min.x > box2.max.x) return false;
    if (this.max.y < box2.min.y) return false;
    if (this.min.y > box2.max.y) return false;
  }

  toString(): string {
    return `[${this.min.x}, ${this.min.y}] - [${this.max.x}, ${this.max.y}]`;
  }

  static fromTwoPoints(v1: Pt, v2: Pt): BBox2D {
    const bbox = new BBox2D();
    bbox.updateFromTwoPoints(v1, v2);
    return bbox;
  }

  static from4Points(p1: Pt, p2: Pt, p3: Pt, p4: Pt): BBox2D {
    const bbox = new BBox2D();
    bbox.updateFrom4Points(p1, p2, p3, p4);
    return bbox;
  }

  static fromTwoBoundingBoxes(b1: BBox2D, b2: BBox2D): BBox2D {
    const bbox = new BBox2D();
    bbox.updateFromTwoBoundingBoxes(b1, b2);
    return bbox;
  }

  static fromPoints(...args: Pt[]): BBox2D {
    const bbox = new BBox2D();
    bbox.updateFromPoints(...args);
    return bbox;
  }

  static fromPolygon(p: number[][]): BBox2D {
    const bbox = new BBox2D();
    bbox.updateFromPolygon(p);
    return bbox;
  }
}

////////// Rect //////////

export class Rect {
  x = 0;
  y = 0;
  width = 0;
  height = 0;

  constructor(x?: any, y?: any, width?: number, height?: number) {
    switch (arguments.length) {
      default:
        this.x = 0;
        this.y = 0;
        this.width = 0;
        this.height = 0;
        break;

      case 2:
        this.x = x.x;
        this.y = x.y;
        this.width = y.width;
        this.height = y.height;
        break;

      case 4:
        this.x = x;
        this.y = y;
        this.width = width!;
        this.height = height!;
        break;
    }
  }

  clone(): Rect {
    return new Rect(this.x, this.y, this.width, this.height);
  }

  contains(pos: Pt): boolean {
    return this.x <= pos.x && this.y <= pos.y
      && this.right >= pos.x && this.bottom >= pos.y;
  }

  moveTo(x: number, y: number): void {
    this.x = x;
    this.y = y;
  }

  offset(value: Pt): void {
    this.x += value.x;
    this.y += value.y;
  }

  get right(): number {
    return this.x + this.width;
  }

  set right(v: number) {
    this.width = this.x + v;
  }

  get bottom(): number {
    return this.y + this.height;
  }

  set bottom(v: number) {
    this.height = this.y + v;
  }

  get origin(): Vec2 {
    return new Vec2(
      this.x + this.width / 2,
      this.y + this.height / 2);
  }

  set origin(p: Pt) {
    this.x = p.x - this.width / 2;
    this.y = p.y - this.height / 2;
  }

  get topLeft(): Vec2 {
    return new Vec2(this.x, this.y);
  }

  get topRight(): Vec2 {
    return new Vec2(this.right, this.y);
  }

  get bottomLeft(): Vec2 {
    return new Vec2(this.x, this.bottom);
  }

  get bottomRight(): Vec2 {
    return new Vec2(this.right, this.bottom);
  }

  get topEdge(): LineSegment2D {
    return new LineSegment2D(this.x, this.y, this.right, this.y);
  }

  get bottomEdge(): LineSegment2D {
    return new LineSegment2D(this.x, this.bottom, this.right, this.bottom);
  }

  get leftEdge(): LineSegment2D {
    return new LineSegment2D(this.x, this.y, this.x, this.bottom);
  }

  get rightEdge(): LineSegment2D {
    return new LineSegment2D(this.right, this.y, this.right, this.bottom);
  }

  set(x: number, y: number, width: number, height: number): void {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
  }

  strink(x: number, y: number): void {
    this.x += x;
    this.width -= x;
    this.y += y;
    this.height -= y;
  }

  inflate(w: number, h: number): void {
    const hw = w * 0.5, hh = h * 0.5;
    this.x -= hw; this.y -= hh;
    this.width += hw; this.height += hh;
  }

  bbox(): BBox2D {
    return new BBox2D(this.topLeft, this.bottomRight);
  }

  toString(): string {
    return `[${this.x}, ${this.y}], [${this.width}, ${this.height}]`;
  }

  static createFromPoints(p1: Pt, p2: Pt): Rect {
    const minx = Math.min(p1.x, p2.x);
    const miny = Math.min(p1.y, p2.y);
    const maxx = Math.max(p1.x, p2.x);
    const maxy = Math.max(p1.y, p2.y);

    return new Rect(minx, miny, maxx - minx, maxy - miny);
  }
}

////////// LineSegment2D //////////

export class LineSegment2D {
  start: Pt;
  end: Pt;
  bbox: BBox2D;

  constructor(x1: number, y1: number, x2: number, y2: number) {
    this.start = { x: x1, y: y1 };
    this.end = { x: x2, y: y2 };

    this.bbox = new BBox2D(
      Vec2.zero.clone(), Vec2.zero.clone());
    this.updateBoundingBox();
  }

  get x1(): number {
    return this.start.x;
  }
  set x1(v: number) {
    this.start.x = v;
    this.updateBoundingBoxX();
  }

  get y1(): number {
    return this.start.y;
  }
  set y1(v: number) {
    this.start.y = v;
    this.updateBoundingBoxY();
  }

  get x2(): number {
    return this.end.x;
  }
  set x2(v: number) {
    this.end.x = v;
    this.updateBoundingBoxX();
  }

  get y2(): number {
    return this.end.y;
  }
  set y2(v: number) {
    this.end.y = v;
    this.updateBoundingBoxY();
  }

  updateBoundingBox(): void {
    this.updateBoundingBoxX();
    this.updateBoundingBoxY();
  }

  updateBoundingBoxX(): void {
    this.bbox.min.x = Math.min(this.start.x, this.end.x) - 1;
    this.bbox.max.x = Math.max(this.start.x, this.end.x) + 1;
  }

  updateBoundingBoxY(): void {
    this.bbox.min.y = Math.min(this.start.y, this.end.y) - 1;
    this.bbox.max.y = Math.max(this.start.y, this.end.y) + 1;
  }

  intersectsLineSegment(l2: LineSegment2D): void {

  }
}

export class Polygon {
  points: number[][];
  bbox: BBox2D;

  constructor(points: number[][]) {
    this.points = points;
    this.bbox = new BBox2D();
    this.updateBoundingBox();
  }

  updateBoundingBox(): void {
    for (let i = 0; i < this.points.length; i++) {
      const x = this.points[i][0], y = this.points[i][1];

      const min = this.bbox.min, max = this.bbox.max;
      if (min.x > x) min.x = x;
      if (min.y > y) min.y = y;
      if (max.x < x) max.x = x;
      if (max.y < y) max.y = y;
    }
  }
}

////////// DrawingContext2D //////////

export class DrawingContext2D {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  currentTransform: Matrix3;
  transformStack: Matrix3[];

  strokeWidth!: number;
  strokeColor!: string;
  fillColor!: string;

  constructor(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) {
    this.canvas = canvas;
    this.ctx = ctx;

    this.resetDrawingStyle();

    this.currentTransform = new Matrix3().loadIdentity();
    this.transformStack = new Array();
  }

  pushTransform(t: Matrix3): void {
    this.transformStack.push(this.currentTransform.clone());
    this.currentTransform = t.mul(this.currentTransform);
    t = this.currentTransform;
    this.ctx.setTransform(t.a1, t.b1, t.a2, t.b2, t.a3, t.b3);
  }

  popTransform(): void {
    this.currentTransform = this.transformStack.pop()!;
    const t = this.currentTransform;
    this.ctx.setTransform(t.a1, t.b1, t.a2, t.b2, t.a3, t.b3);
  }

  pushTranslation(x: number, y: number): Matrix3 {
    const m = Matrix3.makeTranslation(x, y);
    this.pushTransform(m);
    return m;
  }

  pushRotation(angle: number, x: number, y: number): Matrix3 {
    const m = Matrix3.makeRotation(angle, x, y);
    this.pushTransform(m);
    return m;
  }

  resetTransform(): void {
    this.currentTransform.loadIdentity();
    this.transformStack = [];
  }

  resetDrawingStyle(): void {
    this.strokeWidth = 1;
    this.strokeColor = "black";
    this.fillColor = "white";
  }

  drawRect(rect: Rect, strokeWidth?: number, strokeColor?: ColorLike, fillColor?: ColorLike): void {
    const ctx = this.ctx;

    strokeWidth = strokeWidth || this.strokeWidth || 1;
    strokeColor = strokeColor || this.strokeColor || "black";
    fillColor = fillColor || this.fillColor;

    // ctx.beginPath();

    ctx.fillStyle = fillColor as string;
    if (fillColor) {
      ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    }

    if (typeof strokeWidth !== "undefined") {
      ctx.lineWidth = strokeWidth;
    } else {
      ctx.lineWidth = this.strokeWidth;
    }

    if (strokeColor != undefined) {

      if (typeof strokeColor !== "undefined") {
        ctx.strokeStyle = strokeColor;
      } else {
        ctx.strokeStyle = this.strokeColor;
      }

      if (ctx.lineWidth > 0) {
        ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
      }
    }
    // ctx.closePath();

  }

  drawRoundRect(rect: Rect, cornerSize: number, strokeWidth?: number, strokeColor?: ColorLike, fillColor?: ColorLike): void {
    const ctx = this.ctx;

    strokeWidth = strokeWidth || this.strokeWidth || 1;
    strokeColor = strokeColor || this.strokeColor || "black";
    fillColor = fillColor || this.fillColor || "white";

    const minEdge = Math.min(rect.width, rect.height);
    if (cornerSize > minEdge) cornerSize = minEdge;

    const
      w = rect.width, h = rect.height,
      x = rect.x, y = rect.y,
      hc = cornerSize / 2,
      xe = x + w, ye = y + h;

    ctx.beginPath();
    ctx.moveTo(x + hc, y);
    ctx.arc(xe - hc, y + hc, hc, Math.PI / 2 + Math.PI, 0);
    ctx.arc(xe - hc, ye - hc, hc, 0, Math.PI / 2);
    ctx.arc(x + hc, ye - hc, hc, Math.PI / 2, Math.PI);
    ctx.arc(x + hc, y + hc, hc, Math.PI, Math.PI / 2 + Math.PI);
    ctx.closePath();

    ctx.fillStyle = fillColor as string;
    if (fillColor) {
      ctx.fill();
    }

    if (strokeWidth > 0 && strokeColor) {
      ctx.lineWidth = strokeWidth;
      ctx.strokeStyle = strokeColor;
      ctx.stroke();
    }
  }

  drawPoint(p: Pt, size = 3, color: ColorLike = "black"): void {
    this.drawEllipse(new Rect(p.x - size / 2, p.y - size / 2, size, size), 0, null, color);
  }

  // drawEllipse(p, size, strokeWidth, strokeColor, fillColor) {
  // 	var r = new Rect(p.x - size / 2, p.y - size / 2, size, size);
  // 	return this.drawEllipse(r, strokeWidth, strokeColor, fillColor);
  // };

  drawEllipse(rect: Rect, strokeWidth?: number, strokeColor?: ColorLike, fillColor?: ColorLike): void {
    const ctx = this.ctx;

    strokeWidth = strokeWidth || this.strokeWidth;
    strokeColor = strokeColor || this.strokeColor;
    fillColor = fillColor || this.fillColor;

    const w = rect.width;
    const h = rect.height;
    const hw = w / 2;
    const hh = h / 2;
    // var x = rect.x - hw;
    // var y = rect.y - hh;
    const x = rect.x;
    const y = rect.y;

    const kappa = 0.5522848,
      ox = hw * kappa,   // control point offset horizontal
      oy = hh * kappa,   // control point offset vertical
      xe = x + w,        // x-end
      ye = y + h,        // y-end
      xm = x + hw,       // x-middle
      ym = y + hh;       // y-middle

    ctx.beginPath();
    ctx.moveTo(x, ym);
    ctx.bezierCurveTo(x, ym - oy, xm - ox, y, xm, y);
    ctx.bezierCurveTo(xm + ox, y, xe, ym - oy, xe, ym);
    ctx.bezierCurveTo(xe, ym + oy, xm + ox, ye, xm, ye);
    ctx.bezierCurveTo(xm - ox, ye, x, ym + oy, x, ym);

    ctx.closePath();

    if (fillColor) {
      ctx.fillStyle = fillColor;
      ctx.fill();
    }

    if (typeof strokeWidth === "undefined") {
      strokeWidth = 1;
    }

    if (strokeWidth || strokeColor) {
      ctx.lineWidth = strokeWidth || 1;
      ctx.strokeStyle = strokeColor || "black";
      ctx.stroke();
    }
  }

  drawArc(rect: Rect, startAngle: number, endAngle: number, strokeWidth?: number, strokeColor?: ColorLike, fillColor?: ColorLike): void {
    const ctx = this.ctx;

    strokeWidth = strokeWidth || this.strokeWidth || 1;
    strokeColor = strokeColor || this.strokeColor || "black";
    fillColor = fillColor || this.fillColor;

    const x = rect.x, y = rect.y,
      w = rect.width, h = rect.height,
      r = Math.max(w, h);

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, r, startAngle * Math.PI / 180, endAngle * Math.PI / 180);
    ctx.closePath();

    if (fillColor) {
      ctx.fillStyle = fillColor;
      ctx.fill();
    }

    if (strokeWidth > 0 && strokeColor) {
      ctx.lineWidth = strokeWidth;
      ctx.strokeStyle = strokeColor;
      ctx.stroke();
    }
  }

  drawImage(p: Pt, image: CanvasImageSource): void {
    const ctx = this.ctx;

    ctx.drawImage(image, p.x, p.y);
  }

  drawText(p: Pt, text: string, color?: ColorLike, halign?: string, font?: string): void {
    const ctx = this.ctx;

    ctx.fillStyle = color || "black";

    const size = ctx.measureText(text);

    // TODO: get text height, allow to change text font
    ctx.font = "12px Arial";

    if (halign == "center") {
      p.x -= size.width / 2;
    }

    if (font) ctx.font = font;

    ctx.fillText(text, p.x, p.y);
  }

  drawLine(from: Pt, to: Pt, width?: number, color?: ColorLike): void {
    this.drawLineSegments([from, to], width, color);
  }

  drawLineSegments(...args: any[]): void {
    return (this.drawLines as any)(...args);
  }

  drawLines(lines: any[], width?: number, color?: ColorLike, strip?: boolean): void {
    if (lines.length < 2) return;

    const ctx = this.ctx;

    if (width == undefined) width = this.strokeWidth;
    if (color == undefined) color = this.strokeColor;

    if (width > 0 && color != "transparent") {
      ctx.lineWidth = width || 1;
      ctx.strokeStyle = color || "black";

      ctx.beginPath();

      if (strip) {
        const from = lines[0];

        if (Array.isArray(from)) {
          ctx.moveTo(from[0], from[1]);
        } else {
          ctx.moveTo(from.x, from.y);
        }

        for (let i = 1; i < lines.length; i++) {
          const to = lines[i];
          if (Array.isArray(from)) {
            ctx.lineTo(to[0], to[1]);
          } else {
            ctx.lineTo(to.x, to.y);
          }
        }
      } else {
        for (let i = 0; i < lines.length; i += 2) {
          const from = lines[i], to = lines[i + 1];
          if (Array.isArray(from)) {
            ctx.moveTo(from[0], from[1]);
            ctx.lineTo(to[0], to[1]);
          } else {
            ctx.moveTo(from.x, from.y);
            ctx.lineTo(to.x, to.y);
          }
        }
      }

      ctx.closePath();
      ctx.stroke();
    }
  }

  drawArrow(from: Pt, to: Pt, width?: number, color?: ColorLike, arrowSize?: number): void {
    const ctx = this.ctx;

    if (width === undefined) width = 2;
    if (arrowSize === undefined) arrowSize = width * 5;

    ctx.lineWidth = width;
    ctx.strokeStyle = color || "black";

    const angle = Math.atan2(to.y - from.y, to.x - from.x);

    ctx.beginPath();

    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);

    ctx.lineTo(to.x - arrowSize * Math.cos(angle - Math.PI / 6),
      to.y - arrowSize * Math.sin(angle - Math.PI / 6));

    ctx.moveTo(to.x, to.y);
    ctx.lineTo(to.x - arrowSize * Math.cos(angle + Math.PI / 6),
      to.y - arrowSize * Math.sin(angle + Math.PI / 6));

    ctx.closePath();
    ctx.stroke();
  }

  fillArrow(from: Pt, to: Pt, size?: number, color?: ColorLike): void {
    const ctx = this.ctx;

    size = size || 10;
    ctx.fillStyle = color || "black";

    const angle = Math.atan2(to.y - from.y, to.x - from.x);

    ctx.beginPath();

    ctx.moveTo(to.x, to.y);
    ctx.lineTo(to.x - size * Math.cos(angle - Math.PI / 6), to.y - size * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(to.x - size * Math.cos(angle + Math.PI / 6), to.y - size * Math.sin(angle + Math.PI / 6));

    ctx.closePath();
    ctx.fill();
  }

  drawPolygon(points: Pt[], strokeWidth?: number, strokeColor?: ColorLike, fillColor?: ColorLike): void {
    const ctx = this.ctx;

    if (points.length < 2) return;

    ctx.beginPath();

    const p0 = points[0];
    ctx.moveTo(p0.x, p0.y);

    for (let i = 1; i < points.length; i++) {
      const p = points[i];
      ctx.lineTo(p.x, p.y);
    }

    ctx.lineTo(p0.x, p0.y);

    ctx.closePath();

    if (fillColor) {
      ctx.fillStyle = fillColor;
      ctx.fill();
    }

    if (strokeWidth || strokeColor) {
      ctx.lineWidth = strokeWidth || 1;
      ctx.strokeStyle = strokeColor || "black";

      ctx.stroke();
    }
  }
}
