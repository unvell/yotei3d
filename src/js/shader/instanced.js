
import { Vec3, Color3 } from "@/math";
import { Shader } from "../webgl/shader";
import { Texture } from "../webgl/texture";

// Shader for hardware-instanced geometry: one draw call renders every
// instance, each placed by its own model matrix supplied as a vertex
// attribute (see instanced.vert). Kept deliberately lean — sun + ambient
// lighting, optional base texture, vertex colour and distance fog — which
// suits scattered props (foliage, rocks, debris). It does not touch the
// standard/shadow pipeline; instanced objects opt in via InstancedObject.
export class InstancedShader extends Shader {
	constructor(renderer, vertShaderSrc, fragShaderSrc) {
		super(renderer, vertShaderSrc, fragShaderSrc);

		this.use();

		this.vertexPositionAttribute = this.findAttribute("vertexPosition");
		this.vertexNormalAttribute = this.findAttribute("vertexNormal");
		this.vertexTexcoordAttribute = this.findAttribute("vertexTexcoord");
		this.vertexColorAttribute = this.findAttribute("vertexColor");
		this.instanceMatrixAttribute = this.findAttribute("instanceMatrix");

		this.projectViewMatrixUniform = this.bindUniform("projectViewMatrix", "mat4");
		this.modelMatrixUniform = this.bindUniform("modelMatrix", "mat4");

		this.colorUniform = this.bindUniform("color", "color3");
		this.sundirUniform = this.bindUniform("sundir", "vec3");
		this.sunlightUniform = this.bindUniform("sunlight", "color3");
		this.ambientUniform = this.bindUniform("ambient", "float");

		this.hasTextureUniform = this.bindUniform("hasTexture", "bool");
		this.textureUniform = this.bindUniform("tex", "tex", 0);
		this.hasVertexColorUniform = this.bindUniform("hasVertexColor", "bool");

		this.hasFogUniform = this.bindUniform("hasFog", "bool");
		this.fogColorUniform = this.bindUniform("fogColor", "color3");
		this.fogNearUniform = this.bindUniform("fogNear", "float");
		this.fogFarUniform = this.bindUniform("fogFar", "float");
		this.cameraLocUniform = this.bindUniform("cameraLoc", "vec3");

		this.defaultSundir = Vec3.normalize(new Vec3(0.5, 1.0, 0.3));
	}

	beginObject(obj) {
		super.beginObject(obj);

		const renderer = this.renderer;
		const scene = renderer.currentScene;

		// view-projection only — the per-instance model matrix lives in the
		// instanceMatrix vertex attribute. modelMatrix is the object's own
		// transform, composed with each instance in the vertex shader.
		this.projectViewMatrixUniform.set(renderer.projectionViewMatrixArray);
		this.modelMatrixUniform.set(obj._transform);

		// sun (mirrors StandardShader)
		if (scene && scene.sun !== undefined) {
			this.sundirUniform.set(Vec3.normalize(scene.sun.worldLocation));
			let sunlight = Shader.defaultSunColor;
			if (scene.sun.mat && scene.sun.mat.color) sunlight = scene.sun.mat.color;
			this.sunlightUniform.set(sunlight);
		} else {
			this.sundirUniform.set(this.defaultSundir);
			this.sunlightUniform.set(Shader.defaultSunColor);
		}

		// camera (for fog distance)
		const camera = scene && scene.mainCamera;
		this.cameraLocUniform.set(camera ? camera.worldLocation : Vec3.zero);

		const mat = obj.mat || {};

		this.ambientUniform.set(typeof mat.ambient === "number" ? mat.ambient : 0.35);

		// color
		let color = mat.color || this.defaultColor;
		if (color instanceof Color3) color = color.toArray();
		this.colorUniform.set(color);

		// base texture
		const tex = mat.tex;
		const texReady = tex instanceof Texture && !tex.isLoading
			&& tex.image && tex.image.complete;
		if (texReady) {
			this.hasTextureUniform.set(true);
			this.textureUniform.set(tex);
		} else {
			this.hasTextureUniform.set(false);
			this.textureUniform.set(Shader.emptyTexture);
		}

		// vertex colors only when the base mesh provides them
		const hasVColor = !!(obj.baseMesh && obj.baseMesh.meta && obj.baseMesh.meta.hasColor);
		this.hasVertexColorUniform.set(hasVColor);

		// distance fog — opt-in via scene.fog
		const fog = scene && scene.fog;
		if (fog && fog.enabled !== false) {
			this.hasFogUniform.set(true);
			let fogColor = fog.color;
			if (!fogColor) {
				const bc = renderer.options.backColor;
				fogColor = bc ? [bc.r, bc.g, bc.b] : [0.8, 0.8, 0.8];
			}
			this.fogColorUniform.set(fogColor);
			this.fogNearUniform.set(typeof fog.near === "number" ? fog.near : 10);
			this.fogFarUniform.set(typeof fog.far === "number" ? fog.far : 100);
		} else {
			this.hasFogUniform.set(false);
		}
	}

	endObject(obj) {
		this.textureUniform.unset();
		super.endObject(obj);
	}
}
