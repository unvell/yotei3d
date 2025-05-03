
import { Vec3, Vec4, Color3, Matrix4, MathFunctions } from "@jingwood/graphics-math";
import "../scene/object.js";
import "../webgl/texture.js";

Billboard = class extends SceneObject {
	constructor(image) {
		super();
	
		if (BillboardMesh.instance == null) {
			BillboardMesh.instance = new BillboardMesh();
		}

		this.addMesh(BillboardMesh.instance);

		this.mat = { tex: null };
	
		if (typeof image === "string" && image.length > 0) {
			ResourceManager.download(image, ResourceTypes.Image, img => {
				this.mat.tex = new Texture(img);
				if (this.scene) {
					this.scene.requireUpdateFrame();
				}
			});
		} else if (image instanceof Image) {
			this.mat.tex = image;
		}
	
		this.targetCamera = null;
		this.cameraMoveListener = null;
		this.attachedScene = null;
		this.cameraChangeListener = null;

		this.on("sceneChange", scene => {
			if (scene) {
				this.targetCamera = scene.mainCamera;
				this.cameraMoveListener = this.targetCamera.on("move", function() {
					Billboard.faceToCamera(this, this.targetCamera);
				});

				this.attachedScene = scene;
				this.cameraChangeListener = scene.on("mainCameraChange", function() {
					Billboard.faceToCamera(this, this.targetCamera);
				});
			} else {
				if (this.targetCamera && this.cameraMoveListener) {
					this.targetCamera.removeEventListener("move", this.cameraMoveListener);
				}
				if (this.attachedScene && this.cameraChangeListener) {
					this.attachedScene.removeEventListener("mainCameraChange", this.cameraChangeListener);
				}

				this.targetCamera = null;
				this.cameraMoveListener = null;
				this.attachedScene = null;
				this.cameraChangeListener = null;
			}
		});

		this.shader = {
			name: "billboard",
		};
	}
};	

Billboard.faceToCamera = function(billboard, camera) {
	var cameraLoc = camera.worldLocation;
	var worldLoc = billboard.worldLocation;

	var diff = cameraLoc.sub(worldLoc);

	billboard.angle.y = _mf.degreeToAngle(Math.atan2(diff.x, diff.z));
};

BillboardMesh = class extends Mesh {
	constructor() {
		super();

		this.meta = {
			vertexCount: 4,
			normalCount: 0,
			texcoordCount: 4
		};

		this.vertexBuffer = BillboardMesh.VertexBuffer;
		this.composeMode = Mesh.ComposeModes.TriangleStrip;
	}
};

BillboardMesh.instance = null;

BillboardMesh.VertexBuffer = new Float32Array([
	-1, 1, 0, -1, -1, 0, 1, 1, 0, 1, -1, 0, 0, 0, 0, 1, 1, 0, 1, 1
]);