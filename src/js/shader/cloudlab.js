
import { Matrix4 } from "@/math";
import { Shader } from '../webgl/shader.js';

// CloudLab — learning-oriented volumetric cloud sandbox shaders (see CloudLab in
// effect/cloudlab.js, and the two GLSL files cloudlab_gen / cloudlab_view).
//
// Two stages, two programs:
//   - CloudGenShader  bakes density() into a 3D texture, one Z-slice at a time.
//   - CloudViewShader ray-marches that texture (Beer's law) into the screen.

// Density bake. The CloudLab effect activates this and runs it over every
// Z-slice of the density volume via Volume3DTarget.renderAllSlices, calling
// setLayer(wNorm) per slice. setParams() pushes the (static) bake tunables once.
export class CloudGenShader extends Shader {
	constructor(renderer, vertShaderSrc, fragShaderSrc) {
		super(renderer, vertShaderSrc, fragShaderSrc);

		this.use();

		this.vertexPositionAttribute = this.findAttribute("vertexPosition");

		this.volumeSizeUniform = this.bindUniform("uVolumeSize", "vec2");
		this.wNormUniform = this.bindUniform("uWNorm", "float");
		this.coverageUniform = this.bindUniform("uCoverage", "float");
		this.scaleUniform = this.bindUniform("uScale", "float");
		this.timeUniform = this.bindUniform("uTime", "float");
	}

	// `p` is the CloudLab effect (carries resolution + the bake tunables).
	setParams(p) {
		this.volumeSizeUniform.set([p.resolution, p.resolution]);
		this.coverageUniform.set(p.coverage);
		this.scaleUniform.set(p.scale);
		this.timeUniform.set(p.time);
	}

	// per-slice W coordinate (cell.z), supplied by renderAllSlices' onSlice
	setLayer(wNorm) {
		this.wNormUniform.set(wNorm);
	}
}

// Beer's-law raymarch viewer. Drawn as a full-screen scene object each frame;
// reads its per-frame state (camera, box, volume, tunables) from the CloudLab
// effect stashed on the object as `obj._cloudlab`. The density volume is bound
// manually as a sampler3D (the generic "tex" uniform path assumes TEXTURE_2D).
export class CloudViewShader extends Shader {
	constructor(renderer, vertShaderSrc, fragShaderSrc) {
		super(renderer, vertShaderSrc, fragShaderSrc);

		this.use();

		this.vertexPositionAttribute = this.findAttribute("vertexPosition");

		this.invViewProjUniform = this.bindUniform("uInvViewProj", "mat4");
		this.invModelUniform = this.bindUniform("uInvModel", "mat4");
		this.cameraPosUniform = this.bindUniform("uCameraPos", "vec3");
		this.boxMinUniform = this.bindUniform("uBoxMin", "vec3");
		this.boxMaxUniform = this.bindUniform("uBoxMax", "vec3");
		this.sigmaUniform = this.bindUniform("uSigma", "float");
		this.stepsUniform = this.bindUniform("uSteps", "int");
		this.colorBaseUniform = this.bindUniform("uColorBase", "color3");
		this.colorTopUniform = this.bindUniform("uColorTop", "color3");
		this.skyTopUniform = this.bindUniform("uSkyTop", "color3");
		this.skyBottomUniform = this.bindUniform("uSkyBottom", "color3");

		this.volumeLocation = this.gl.getUniformLocation(this.glShaderProgramId, "uVolume");
	}

	beginObject(obj) {
		super.beginObject(obj);

		const driver = obj._cloudlab;
		if (!driver) return;

		const gl = this.gl;
		const r = this.renderer;

		// clip -> world for the per-pixel view ray. inverse() returns a fresh
		// matrix and leaves the renderer's own matrix intact.
		this.invViewProjUniform.set(r.projectionViewMatrix.inverse());
		const cam = driver.scene.mainCamera;
		this.cameraPosUniform.set(cam ? cam.worldLocation : [0, 0, 0]);

		// world -> volume-local: the inverse of the transform object's rotation,
		// so dragging (which spins that object) rotates the cloud. Rotation-only
		// keeps the matrix orthonormal, so ray distances / dt stay correct.
		const tob = driver.transformObject;
		this.invModelUniform.set(tob ? tob.getRotationMatrix(true).inverse() : Matrix4.Identity);

		this.boxMinUniform.set(driver.boxMin);
		this.boxMaxUniform.set(driver.boxMax);
		this.sigmaUniform.set(driver.sigma);
		this.stepsUniform.set(driver.steps | 0);
		this.colorBaseUniform.set(driver.colorBase);
		this.colorTopUniform.set(driver.colorTop);
		this.skyTopUniform.set(driver.skyTop);
		this.skyBottomUniform.set(driver.skyBottom);

		// bind the density volume as sampler3D on texture unit 0
		if (driver.volume && this.volumeLocation) {
			gl.activeTexture(gl.TEXTURE0);
			gl.bindTexture(gl.TEXTURE_3D, driver.volume.glTexture);
			gl.uniform1i(this.volumeLocation, 0);
		}

		// full-screen background pass: opaque (sky + cloud), no depth, no blend
		gl.disable(gl.DEPTH_TEST);
		gl.depthMask(false);
		gl.disable(gl.BLEND);
	}

	endObject(obj) {
		const gl = this.gl;

		// release the 3D texture from unit 0 so it can't shadow a later 2D bind
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_3D, null);

		gl.enable(gl.DEPTH_TEST);
		gl.depthMask(true);
		gl.disable(gl.BLEND);

		super.endObject(obj);
	}
}
