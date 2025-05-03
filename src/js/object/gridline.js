
import { Vec3, Vec4, Color3, Matrix4, MathFunctions } from "@jingwood/graphics-math";
import { MathFunctions as _mf, MathFunctions as _mf3 } from "@jingwood/graphics-math";
import "../scene/object.js";

GridLine = class extends SceneObject {
	constructor(gridSize, stride) {
		super();

		this.mat = { color: new Color3(0.7, 0.7, 0.7) };
		this.receiveLight = false;

		if (typeof gridSize === "undefined") {
			this.gridSize = 10.0;
		} else {
			this.gridSize = gridSize;
		}

		if (typeof stride === "undefined") {
			this.stride = 1.0;
		} else {
			this.stride = stride;
		}

		this.conflictWithRay = false;
		this.receiveLight = false;

		this.addMesh(GridLine.generateGridLineMesh(this.gridSize, this.stride));
	}
}

GridLine.generateGridLineMesh = function(gridSize, stride) {
	const width = gridSize, height = gridSize;

	const mesh = new Mesh();
	mesh.vertices = [];
	mesh.composeMode = Mesh.ComposeModes.Lines;

	for (var y = -height; y <= height; y += stride) {
		mesh.vertices.push(-width, 0, y);
		mesh.vertices.push(width, 0, y);
	}

	for (var x = -width; x <= width; x += stride) {
		mesh.vertices.push(x, 0, -height);
		mesh.vertices.push(x, 0, height);
	}

	return mesh;
};
