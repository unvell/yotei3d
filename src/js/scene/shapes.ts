import { Vec3, Color4 } from "@jingwood/graphics-math";
import { BoundingBox3D } from "@jingwood/graphics-math";

import { Mesh } from '../webgl/mesh';
import { SceneObject } from "../scene/object";
import { EventDispatcher } from '../utility/event';
import { Rect, Point } from '../render/draw2d';

// Mesh.ComposeModes / Mesh.prototype.* are attached via Object.assign in the
// (still-JS) mesh module, so they are invisible to TS's JS inference. Reach
// them through a loosely-typed view of the class.
const MeshClass = Mesh as any;
const ComposeModes = MeshClass.ComposeModes;

////////////////////////// Plane //////////////////////////

export class Plane extends SceneObject {
	constructor(width?: number, height?: number) {
		super();
		this.addMesh(new PlaneMesh(width, height));
	}
}

export class PlaneMesh extends Mesh {
	tangents: any;
	bitangents: any;

	constructor(width?: number, height?: number) {
		super();

		if (typeof width === "undefined") {
			width = 1;
		}

		if (typeof height === "undefined") {
			height = 1;
		}

		var halfWidth = width * 0.5, halfHeight = height * 0.5;

		this.vertices = [-halfWidth, 0, -halfHeight, -halfWidth, 0, halfHeight,
			halfWidth, 0, -halfHeight, halfWidth, 0, halfHeight];
		this.normals = [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0];
		this.texcoords = [0, 0, 0, 1, 1, 0, 1, 1];
		this.tangents = [-1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0];
		this.bitangents = [0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1];

		this.meta = {
			vertexCount: 4,
			normalCount: 4,
			uvCount: 1,
			texcoordCount: 4,
			tangentBasisCount: 4,
		} as any;

		this.composeMode = ComposeModes.TriangleStrip;
	}
}

////////////////////////// Cube //////////////////////////

export class CubeMesh extends Mesh {
	constructor() {
		super();

		const positions = [
			// Front face
			-0.5, -0.5,  0.5,
			 0.5, -0.5,  0.5,
			 0.5,  0.5,  0.5,
			-0.5,  0.5,  0.5,
			// Back face
			-0.5, -0.5, -0.5,
			-0.5,  0.5, -0.5,
			 0.5,  0.5, -0.5,
			 0.5, -0.5, -0.5,
			// Top face
			-0.5,  0.5, -0.5,
			-0.5,  0.5,  0.5,
			 0.5,  0.5,  0.5,
			 0.5,  0.5, -0.5,
			// Bottom face
			-0.5, -0.5, -0.5,
			 0.5, -0.5, -0.5,
			 0.5, -0.5,  0.5,
			-0.5, -0.5,  0.5,
			// Right face
			 0.5, -0.5, -0.5,
			 0.5,  0.5, -0.5,
			 0.5,  0.5,  0.5,
			 0.5, -0.5,  0.5,
			// Left face
			-0.5, -0.5, -0.5,
			-0.5, -0.5,  0.5,
			-0.5,  0.5,  0.5,
			-0.5,  0.5, -0.5,
		];

		const normals = [
			// Front
			0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1,
			// Back
			0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1,
			// Top
			0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0,
			// Bottom
			0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0,
			// Right
			1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0,
			// Left
			-1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0
		];

		const texcoords = [
			0, 0, 1, 0, 1, 1, 0, 1,
			0, 0, 1, 0, 1, 1, 0, 1,
			0, 0, 1, 0, 1, 1, 0, 1,
			0, 0, 1, 0, 1, 1, 0, 1,
			0, 0, 1, 0, 1, 1, 0, 1,
			0, 0, 1, 0, 1, 1, 0, 1
		];

		const indexes = [
			0, 1, 2, 0, 2, 3,       // front
			4, 5, 6, 4, 6, 7,       // back
			8, 9,10, 8,10,11,       // top
		  12,13,14,12,14,15,       // bottom
		  16,17,18,16,18,19,       // right
		  20,21,22,20,22,23        // left
		];

		this.vertices = positions;
		this.normals = normals;
		this.texcoords = texcoords;
		this.indexes = indexes;
		this.indexed = true;

		this.meta = {
			vertexCount: 24,
			normalCount: 24,
			texcoordCount: 24,
			tangentBasisCount: 0,
			indexCount: 36,
			uvCount: 1,
		} as any;

		this.composeMode = ComposeModes.Triangles;
		(this as any).updateBuffer();
	}
}

export class Cube extends SceneObject {
	constructor() {
		super();

		this.addMesh(new CubeMesh());
	}

	updateMesh() {
		// todo: dynamically generate faces of cube
	}
}

////////////////////////// Line //////////////////////////

export class Line extends SceneObject {
	_start: any;
	_end: any;
	_width: number;
	shader: any;
	mesh: any;
	dirty: boolean;

	constructor(start?: any, end?: any, width?: number) {
		super();

		this._start = start || new Vec3();
		this._end = end || new Vec3();
		this._width = width || 0.1;

		this.shader = { name: "points" };

		this.mesh = new LineMesh(this._start, this._end, this._width);
		this.addMesh(this.mesh);

		this.dirty = false;
	}

	get start() {
		return this._start;
	}

	set start(val) {
		this._start = val;
		this.dirty = true;
	}

	get end() {
		return this._end;
	}

	set end(val) {
		this._end = val;
		this.dirty = true;
	}

	get width() {
		return this._width;
	}

	set width(val) {
		this._width = val;
		this.dirty = true;
	}

	override draw() {
		if (this.dirty) {
			this.mesh.update(this._start, this._end, this._width);
			this.dirty = false;
		}
	}
}

export class LineMesh extends Mesh {
	name?: string;
	sizes: any;

	constructor(start?: any, end?: any, width?: number) {
		super();
		this.name = "LineMesh";

		this.update(start, end, width);

		this.composeMode = ComposeModes.Lines;

		this.meta = {
			vertexCount: 2,
			hasSize: true
		} as any;
	}

	update(start?: any, end?: any, width?: number) {
		(this as any).destroy();

		start = start || Vec3.zero;
		end = end || Vec3.zero;
		width = width || 0.1;

		this.vertices = [start.x, start.y, start.z, end.x, end.y, end.z];
		this.sizes = [5, 5];
	}
}

export class Sphere extends SceneObject {
	constructor(segments?: number, rings?: number) {
		super();

		this.generateMesh(segments, rings);
	}

	generateMesh(segments?: number, rings?: number, composeMode?: any) {

		for (const mesh of this.meshes) {
			mesh.destroy();
		}

		this.meshes = [];

		segments = segments || 12;
		rings = rings || 24;

		var anglePerSeg = Math.PI / segments;
		var anglePerRing = Math.PI * 2.0 / rings;
		var halfPI = Math.PI / 2;
		var vangle = Math.PI / 2 - anglePerSeg;

		if (composeMode === ComposeModes.Points) {

			var mesh = (function() {
				var mesh: any = new Mesh();
				mesh.composeMode = composeMode;
				mesh.vertices = [];
				mesh.normals = [];

				for (var j = 0; j < segments!; j++) {
					var a1 = vangle, a2 = vangle - anglePerSeg;

					var y1 = Math.sin(a1), y2 = Math.sin(a2);
					var l1 = Math.sin(a1 + halfPI), l2 = Math.sin(a2 + halfPI);

					for (var i = 0, hangle = 0; i <= rings!; i++ , hangle += anglePerRing) {

						var s = Math.sin(hangle), c = Math.cos(hangle);
						var x1 = s * l1, z1 = c * l1, x2 = s * l2, z2 = c * l2;

						mesh.vertices.push(x1, y1, z1);
						mesh.normals.push(x1, y1, z1);
					}

					vangle -= anglePerSeg;
				}

				return mesh;
			})();

			this.addMesh(mesh);

		} else {
			function generateSphereFan(symbol: number) {
				const mesh: any = new Mesh();
				mesh.composeMode = ComposeModes.TriangleFan;
				mesh.vertices = [];
				mesh.normals = [];
				mesh.vertices.push(0, symbol, 0);
				mesh.normals.push(0, symbol, 0);

				for (let i = 0, hangle = 0; i <= rings!; i++ , hangle += (anglePerRing * symbol)) {
					const y = Math.sin(vangle), l = Math.sin(vangle + halfPI);
					const x = Math.sin(hangle) * l, z = Math.cos(hangle) * l;
					mesh.vertices.push(x, y, z);
					mesh.normals.push(x, y, z);
				}

				return mesh;
      };

			const topMesh = generateSphereFan(1);

			const middleMesh: any = new Mesh();
			middleMesh.composeMode = ComposeModes.TriangleStrip;
			middleMesh.vertices = [];
			middleMesh.normals = [];

			for (let j = 1; j < segments - 1; j++) {
				const a1 = vangle, a2 = vangle - anglePerSeg;

				const y1 = Math.sin(a1), y2 = Math.sin(a2);
				const l1 = Math.sin(a1 + halfPI), l2 = Math.sin(a2 + halfPI);

				for (let i = 0, hangle = 0; i <= rings; i++ , hangle += anglePerRing) {

					const s = Math.sin(hangle), c = Math.cos(hangle);
					const x1 = s * l1, z1 = c * l1, x2 = s * l2, z2 = c * l2;

					middleMesh.vertices.push(x1, y1, z1);
					middleMesh.vertices.push(x2, y2, z2);
					middleMesh.normals.push(x1, y1, z1);
					middleMesh.normals.push(x2, y2, z2);
				}

				vangle -= anglePerSeg;
			}

			const bottomMesh = generateSphereFan(-1);

			this.addMesh(topMesh);
			this.addMesh(middleMesh);
			this.addMesh(bottomMesh);
		}
	}
}

////////////////////////// Circle //////////////////////////

class Circle extends SceneObject {
	Parameters: any;

	constructor() {
		super();
		var _segments = 8;
		var _circleSize = 0.5;

		this.Parameters = {
			set segments(val: number) {
				_segments = val;
				this.updateMesh();
			},
			get segments() { return _segments; },
			set circleSize(val: number) {
				_circleSize = val;
				this.updateMesh();
			},
			get circleSize() { return _circleSize; },

			shader: {
				name: "solidcolor",
				color: new Color4(0.2, 0.64, 0.86, 1)
			},

			mesh: new CircleMesh(_segments, _circleSize),
			updateMesh: function() {

				if (!_segments || _segments < 6) {
					_segments = 8;
				}

				if (!_circleSize) {
					_circleSize = 0.5;
				}

				this.mesh.destroy();
				this.mesh.vertices = [0, 0, 0];
				var anglePerSegment = Math.PI * 2 / _segments;

				for (var i = 0; i <= _segments; i++) {
					var angle = anglePerSegment * (_segments - i);
					this.mesh.vertices.push(Math.sin(angle) * _circleSize, Math.cos(angle) * _circleSize, 0);
				}
			}
		};

		this.addMesh(this.Parameters.mesh);
	}
}

export class CircleMesh extends SceneObject {
	anglePerSegment: number;
	vertices: any;
	composeMode: any;

	constructor(segments: number, circleSize: number) {
		super();

		this.anglePerSegment = Math.PI * 2 / segments;

		// 頂点座標を生成
		this.vertices = [0, 0, 0];

		for (var i = 0; i <= segments; i++) {
			var angle = this.anglePerSegment * (segments - i);
			this.vertices.push(Math.sin(angle) * circleSize, Math.cos(angle) * circleSize, 0);
		}

		// ポリゴン構成方法（三角形FAN）
		this.composeMode = ComposeModes.TriangleFan;
	}
}

///////////////// ParticleGenerator /////////////////

export class ParticleGenerator extends SceneObject {
  spriteCount: number;
  sourceBox: BoundingBox3D;
  elapsedTime: number;
  isRunning: boolean;

  // --- members injected by the EventDispatcher mixin (see bottom of file) ---
  declare on: (event: string, listener: (...args: any[]) => any) => any;
  declare addEventListener: (event: string, listener: (...args: any[]) => any) => any;
  declare removeEventListener: (event: string, listener: (...args: any[]) => any) => void;
  declare oncreateSprite: (...args: any[]) => any;
  declare oninitSprite: (...args: any[]) => any;
  declare oncycleSprite: (...args: any[]) => any;
  declare ondestroySprite: (...args: any[]) => any;
  declare onframeSprite: (...args: any[]) => any;

  constructor(spriteCount?: number, sourceBox?: any) {
    super();

    this.spriteCount = spriteCount || 1000;
    this.sourceBox = new BoundingBox3D();
    this.elapsedTime = 0;
    this.isRunning = false;

    this.ondraw = this.frameRender;
  }

  start() {

    for (var i = 0; i < this.spriteCount; i++) {
      var sp = this.oncreateSprite();
      this.oninitSprite(sp);
      this.add(sp);
    }

    this.isRunning = true;

    if (this.scene) {
      this.scene.animation = true;
    }
  }

  stop() {
    if (this.isRunning) {
      this.isRunning = false;

      if (this.scene) {
        this.scene.animation = true;
      }
    }
  }

  frameRender() {
    if (this.isRunning) {
      for (var i = 0; i < this.objects.length; i++) {
        var sp = this.objects[i];
        if (sp) {
          this.onframeSprite(sp);

          if (this.oncycleSprite(sp)) {
            this.oninitSprite(sp);
          }
        }
      }
    }
  }
}

new EventDispatcher(ParticleGenerator).registerEvents(
	"createSprite", "initSprite", "cycleSprite", "destroySprite", "frameSprite");

//////////////////// ProgressBarObject ////////////////////

export class ProgressBarObject extends SceneObject {
	progressRate: number;
	widthp: number;
	heightp: number;
	width!: number;
	height!: number;
	left!: number;
	top!: number;

	constructor(session: any, widthp?: number, heightp?: number) {
		super();
		var _this = this;

		this.progressRate = 0;

		session.on("progress", function() {
			_this.progressRate = session.progressRate;
			if (_this.scene) {
				_this.scene.requireUpdateFrame();
			}
		});

		session.on("finish", function() {
			if (_this.scene) {
				_this.scene.remove(_this);
			}
		});

		this.widthp = widthp || 0.7;
		this.heightp = heightp || 0.05;

		this.on("sceneChange", function(this: any, scene: any) {
			_this.scene = scene;
			if (scene) {
				var renderSize = scene.renderer.renderSize;
				this.width = renderSize.width * this.widthp;
				this.height = renderSize.height * this.heightp;
				this.left = (renderSize.width - this.width) / 2;
				this.top = (renderSize.height - this.height) / 2;
			}
		});

		this.on("draw", (function() {
			var rectbg: any = new Rect(), rectpb: any = new Rect(), tpos: any = new Point();

			return function(this: any, g: any) {
				if (this.progressRate < 1) {
					rectbg.set(this.left, this.top, this.width, this.height);
					rectpb.set(this.left + 1, this.top + 1, this.width * this.progressRate - 2, this.height - 2);
					tpos.set(this.left + this.width / 2, this.top + this.height / 2);

					g.drawRect2D(rectbg, 2, "gray");
					g.drawRect2D(rectpb, 0, null, "#6666ff");
					g.drawText2D(tpos, Math.round(this.progressRate * 100) + " %", "black", "center");
				}
			};
		})());
	}
};
