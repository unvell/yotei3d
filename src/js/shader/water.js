
import { Vec3 } from "@/math";
import { Shader } from "../webgl/shader.js";
import { CubeMap } from "../webgl/cubemap.js";
import { FrameBuffer } from "../webgl/buffers.js";
import { ShaderSources } from "./shadersources.js";

// Shader for the Ocean effect. Selected per-object via `obj.shader = { name:
// "water" }`. Wave shape is computed entirely on the GPU (see water.vert), so
// per frame the CPU only updates the `time` uniform. Sky reflection reuses the
// scene's environment cubemap (the skybox) — the same map IBL is baked from —
// so the ocean costs no extra render pass.
export class WaterShader extends Shader {
	// Max wake trail samples; MUST match `#define WAKE_MAX` in water.frag.
	static WAKE_MAX = 48;

	constructor(renderer, vertShaderSrc, fragShaderSrc) {
		super(renderer, vertShaderSrc, fragShaderSrc);

		this.use();

		this.vertexPositionAttribute = this.findAttribute("vertexPosition");

		this.projectViewMatrixUniform = this.bindUniform("projectViewMatrix", "mat4");
		this.modelMatrixUniform = this.bindUniform("modelMatrix", "mat4");
		this.timeUniform = this.bindUniform("time", "float");

		// wave shape
		this.windDirUniform = this.bindUniform("windDir", "vec2");
		this.waveAmpUniform = this.bindUniform("waveAmp", "float");
		this.waveLenUniform = this.bindUniform("waveLen", "float");
		this.waveSpeedUniform = this.bindUniform("waveSpeed", "float");
		this.steepnessUniform = this.bindUniform("steepness", "float");

		// shading
		this.cameraLocUniform = this.bindUniform("cameraLoc", "vec3");
		this.sundirUniform = this.bindUniform("sundir", "vec3");
		this.sunlightUniform = this.bindUniform("sunlight", "color3");
		this.deepColorUniform = this.bindUniform("deepColor", "color3");
		this.shallowColorUniform = this.bindUniform("shallowColor", "color3");
		this.reflectivityUniform = this.bindUniform("reflectivity", "float");
		this.fresnelPowerUniform = this.bindUniform("fresnelPower", "float");
		this.fresnelBiasUniform = this.bindUniform("fresnelBias", "float");
		this.sunGlitterUniform = this.bindUniform("sunGlitter", "float");
		this.specStrengthUniform = this.bindUniform("specStrength", "float");
		this.rippleScaleUniform = this.bindUniform("rippleScale", "float");
		this.rippleStrengthUniform = this.bindUniform("rippleStrength", "float");
		this.rippleDetailUniform = this.bindUniform("rippleDetail", "float");
		this.reflectionBlurUniform = this.bindUniform("reflectionBlur", "float");

		// ship wake foam (see water.frag). The trail is a polyline of recent
		// world-space path samples streamed in from Ocean._wake each frame.
		this.wakeCountUniform = this.bindUniform("uWakeCount", "int");
		this.wakeUniforms = this.bindUniformArray("uWake", "vec4", WaterShader.WAKE_MAX);
		this.wakeFoamColorUniform = this.bindUniform("uWakeFoamColor", "color3");
		this.wakeFoamIntensityUniform = this.bindUniform("uWakeFoamIntensity", "float");
		this.wakeSparkleUniform = this.bindUniform("uWakeSparkle", "float");

		// depth-based contact foam (hull waterline / shoreline). Fed by a scene
		// depth pre-pass this shader runs itself (see runContactDepthPass).
		this.hasContactUniform = this.bindUniform("uHasContact", "bool");
		this.contactDepthUniform = this.bindUniform("uContactDepth", "tex2d", 5);
		this.contactResUniform = this.bindUniform("uContactRes", "vec2");
		this.contactNearUniform = this.bindUniform("uContactNear", "float");
		this.contactFarUniform = this.bindUniform("uContactFar", "float");
		this.contactDistUniform = this.bindUniform("uContactDist", "float");
		this.contactColorUniform = this.bindUniform("uContactColor", "color3");
		this.contactIntensityUniform = this.bindUniform("uContactIntensity", "float");

		this._contactDepthFB = null;       // depth render target (sized to main FB)
		this._contactDepthTex = null;      // last frame's depth texture (or null)
		this._contactW = 0; this._contactH = 0;
		this._contactWanted = false;       // an ocean asked for contact foam this frame
		this._contactPassRegistered = false;

		// environment cubemap (sky reflection)
		this.envMapUniform = this.bindUniform("envMap", "texcube", 4);
		this.hasEnvUniform = this.bindUniform("hasEnv", "bool");

		// distance fog
		this.hasFogUniform = this.bindUniform("hasFog", "bool");
		this.fogColorUniform = this.bindUniform("fogColor", "color3");
		this.fogNearUniform = this.bindUniform("fogNear", "float");
		this.fogFarUniform = this.bindUniform("fogFar", "float");

		this.emptyCubemap = new CubeMap(renderer);
		this.emptyCubemap.enableMipmap = false;
		this.emptyCubemap.createEmpty();
	}

	// Per-scene uniforms (camera, sun, environment cubemap, fog). The renderer
	// only calls beginScene() on the main pass shader, not on per-object effect
	// shaders, so this is driven from beginObject() with the active scene pulled
	// from the renderer — matching how the other effect shaders work.
	setSceneUniforms(scene) {
		if (!scene) return;

		// camera
		const camera = scene.mainCamera;
		this.cameraLocUniform.set(camera ? camera.worldLocation : Vec3.zero);

		// sun
		if (scene.sun !== undefined) {
			const sun = scene.sun;
			this.sundirUniform.set(Vec3.normalize(sun.worldLocation));
			this.sunlightUniform.set((sun.mat && sun.mat.color) ? sun.mat.color : Shader.defaultSunColor);
		} else {
			this.sundirUniform.set([0.0, 1.0, 0.0]);
			this.sunlightUniform.set(Shader.defaultSunColor);
		}

		// sky reflection — reuse the runtime IBL environment cubemap if present,
		// otherwise the skybox's own cubemap, otherwise a procedural sky. This is
		// independent of the renderer's enableEnvmap toggle (which only gates IBL
		// baking): a skybox cubemap is all the ocean needs to mirror the sky.
		let env = null;
		if (scene._iblEnvMap instanceof CubeMap && scene._iblEnvMap.loaded) {
			env = scene._iblEnvMap;
		} else if (scene.imageSky && scene.imageSky.cubemap instanceof CubeMap && scene.imageSky.cubemap.loaded) {
			env = scene.imageSky.cubemap;
		}

		if (env) {
			this.envMapUniform.set(env);
			this.hasEnvUniform.set(true);
		} else {
			this.envMapUniform.set(this.emptyCubemap);
			this.hasEnvUniform.set(false);
		}

		// distance fog (same opt-in convention as the standard shader)
		const fog = scene.fog;
		if (fog && fog.enabled !== false) {
			this.hasFogUniform.set(true);
			let fogColor = fog.color;
			if (!fogColor) {
				const bc = this.renderer.options.backColor;
				fogColor = bc ? [bc.r, bc.g, bc.b] : [0.8, 0.8, 0.8];
			}
			this.fogColorUniform.set(fogColor);
			this.fogNearUniform.set(typeof fog.near === "number" ? fog.near : 10);
			this.fogFarUniform.set(typeof fog.far === "number" ? fog.far : 100);
		} else {
			this.hasFogUniform.set(false);
		}
	}

	beginObject(obj) {
		super.beginObject(obj);

		const gl = this.gl;

		this.setSceneUniforms(this.renderer.currentScene);

		this.projectViewMatrixUniform.set(this.renderer.projectionViewMatrixArray);
		this.modelMatrixUniform.set(obj._transform);
		this.timeUniform.set(typeof obj.time === "number" ? obj.time : 0);

		const o = obj.options || obj;
		const wind = o.wind || [1.0, 0.35];
		this.windDirUniform.set(wind);
		this.waveAmpUniform.set(num(o.waveAmp, 0.6));
		this.waveLenUniform.set(num(o.waveLen, 16.0));
		this.waveSpeedUniform.set(num(o.waveSpeed, 1.0));
		this.steepnessUniform.set(num(o.steepness, 0.7));

		this.deepColorUniform.set(o.deepColor || [0.015, 0.08, 0.11]);
		this.shallowColorUniform.set(o.shallowColor || [0.10, 0.34, 0.38]);
		this.reflectivityUniform.set(num(o.reflectivity, 1.0));
		this.fresnelPowerUniform.set(num(o.fresnelPower, 5.0));
		this.fresnelBiasUniform.set(num(o.fresnelBias, 0.02));
		this.sunGlitterUniform.set(num(o.sunGlitter, 0.12));
		this.specStrengthUniform.set(num(o.specStrength, 1.2));
		this.rippleScaleUniform.set(num(o.rippleScale, 0.25));
		this.rippleStrengthUniform.set(num(o.rippleStrength, 0.35));
		this.rippleDetailUniform.set(num(o.rippleDetail, 1.0));
		this.reflectionBlurUniform.set(num(o.reflectionBlur, 2.0));

		this.setWakeUniforms(obj);
		this.setContactUniforms(obj);

		// the ocean grid is one-sided; show it from below too (e.g. underwater
		// camera) instead of culling to nothing.
		gl.disable(gl.CULL_FACE);
	}

	// Feed the depth-based contact-foam uniforms. When obj.options.contactFoam is
	// on we (a) flag that a scene depth pre-pass is needed next frame and ensure
	// it is registered, and (b) bind this frame's depth texture (rendered by that
	// pre-pass at frame start). The first frame has no depth yet → foam off.
	setContactUniforms(obj) {
		const cfg = (obj.options && obj.options.contactFoam) || null;

		if (!cfg || cfg.enabled === false) {
			this.hasContactUniform.set(false);
			this.contactDepthUniform.set(Shader.emptyTexture);
			return;
		}

		this._contactWanted = true;
		if (!this._contactPassRegistered) {
			this._contactPassRegistered = true;
			this.renderer.prePasses.push(() => this.runContactDepthPass());
		}

		if (this._contactDepthTex) {
			this.hasContactUniform.set(true);
			this.contactDepthUniform.set(this._contactDepthTex);
			this.contactResUniform.set([this._contactW, this._contactH]);
			this.contactNearUniform.set(this.renderer.options.perspective.near);
			this.contactFarUniform.set(this.renderer.options.perspective.far);
			this.contactDistUniform.set(num(cfg.distance, 10));
			this.contactColorUniform.set(cfg.color || [1.0, 1.05, 1.12]);
			this.contactIntensityUniform.set(num(cfg.intensity, 1.0));
		} else {
			this.hasContactUniform.set(false);
			this.contactDepthUniform.set(Shader.emptyTexture);
		}
	}

	// (Re)create the depth target, matched 1:1 to the main framebuffer so the
	// water pass can sample it by gl_FragCoord and hit exact texel centres (so
	// the LINEAR-filtered packed depth returns an un-interpolated value).
	ensureContactTarget() {
		const r = this.renderer;
		const w = r.renderPhysicalSize.width, h = r.renderPhysicalSize.height;
		if (!this._contactDepthFB || this._contactW !== w || this._contactH !== h) {
			if (this._contactDepthFB) this._contactDepthFB.destroy();
			// clearBackground:false so use() keeps the clear colour we set below
			// (far/white = "no geometry") instead of the scene's sky colour.
			this._contactDepthFB = new FrameBuffer(r, w, h, { clearBackground: false, depthBuffer: true });
			this._contactW = w; this._contactH = h;
		}
	}

	// Pre-pass (runs at frame start, before the main pass): render packed linear
	// scene depth into the contact target. The ocean opts out of casting (its
	// castShadow is false) so the depth holds only solids — exactly what we want
	// to test the water surface against. Cleared to far so empty sky never foams.
	runContactDepthPass() {
		if (!this._contactWanted) { this._contactDepthTex = null; return; }
		this._contactWanted = false;

		const r = this.renderer, gl = this.gl;
		const scene = r.currentScene;
		const shader = ShaderSources.attributemap.instance;
		if (!scene || !shader) { this._contactDepthTex = null; return; }

		this.ensureContactTarget();

		shader.type = 0;                       // 0 = linear depth
		gl.clearColor(1.0, 1.0, 1.0, 1.0);     // far = "no geometry here"
		this._contactDepthFB.use();

		r.useShader(shader);
		shader.beginScene(scene);
		for (const obj of scene.objects) this.drawContactDepth(shader, obj);
		r.disuseCurrentShader();

		this._contactDepthFB.disuse();
		this._contactDepthTex = this._contactDepthFB.texture;
	}

	// Recurse the scene drawing depth-only, honouring the same cast opt-out as
	// the shadow / attribute passes (so the ocean — castShadow=false — is skipped).
	drawContactDepth(shader, obj) {
		if (obj.castShadow === false || (obj.mat && obj.mat.castShadow === false)) return;

		shader.beginObject(obj);
		if (obj.meshes && this.renderer.options.enableDrawMesh) {
			for (const mesh of obj.meshes) {
				if (mesh) {
					shader.beginMesh(mesh);
					mesh.draw(this.renderer);
					shader.endMesh(mesh);
				}
			}
		}
		for (const child of obj.objects) this.drawContactDepth(shader, child);
		shader.endObject(obj);
	}

	// Stream the rolling wake trail (Ocean._wake) into the foam uniforms. Each
	// sample carries a strength that fades with age and a half-width that grows
	// toward the tail, so the foam narrows + brightens at the stern and fans +
	// dissolves behind. No trail (or wake disabled) → uWakeCount 0, foam off.
	setWakeUniforms(obj) {
		const wake = obj._wake;
		const cfg = (obj.options && obj.options.wake) || null;

		if (!cfg || !wake || wake.length < 2) {
			this.wakeCountUniform.set(0);
			return;
		}

		const life = num(cfg.life, 14);
		const baseW = num(cfg.width, 18);
		const growth = num(cfg.widthGrowth, 5);
		const cap = Math.min(wake.length, this.wakeUniforms.length);

		for (let i = 0; i < cap; i++) {
			const p = wake[i];
			const age01 = Math.min(Math.max(p.age / life, 0), 1);
			const strength = 1 - age01;                  // fades behind the ship
			const halfWidth = baseW * (1 + growth * age01); // spreads behind the ship
			this.wakeUniforms[i].set([p.x, p.z, strength, halfWidth]);
		}

		this.wakeCountUniform.set(cap);
		this.wakeFoamColorUniform.set(cfg.foamColor || [0.95, 1.0, 1.05]);
		this.wakeFoamIntensityUniform.set(num(cfg.foamIntensity, 1.0));
		this.wakeSparkleUniform.set(num(cfg.sparkle, 0.0));
	}

	endObject(obj) {
		const gl = this.gl;

		gl.enable(gl.CULL_FACE);
		this.envMapUniform.unset();

		super.endObject(obj);
	}
}

function num(v, def) {
	return (typeof v === "number" && !isNaN(v)) ? v : def;
}
