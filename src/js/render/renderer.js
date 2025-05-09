
import { Vec3, Vec4, Color4, Matrix4, Ray } from "@jingwood/graphics-math";
import { MathFunctions as _mf, MathFunctions3 as _mf3 } from "@jingwood/graphics-math";
import { initDOM } from "./dom";
import { EventDispatcher } from '../utility/event';
import { invokeIfExist, getImageDataURLFromTexture } from "../utility/utility";
import { Debugger } from "../utility/debug";
import { DrawingContext2D, Size, Point } from "./draw2d";
import { ResourceManager } from '../utility/resourcemanager';
import { Shader } from "../webgl/shader";
import { ShaderSources } from "../shader/shadersources";
import { ImageSource, ImageToScreenRenderer, DefaultRenderer, ShadowMapRenderer, ShadowMapBlurCacheRenderer, SceneToImageRenderer, ImageFilterRenderer, BlurRenderer } from "./pipeline"
import { Viewer } from "../scene/viewer";
import { Scene } from '../scene/scene';
import { ObjectTypes, ParticleObject } from "../scene/object";
import { ResourceTypes, Texture, AttributeRenderer, MultipleImagePreviewRenderer, SSAORenderer } from '@';

export class Renderer {

	static defaultOptions() {
		return {
			containerId: "canvas-container",
			renderPixelRatio: Math.min(window.devicePixelRatio, 2),
			perspective: {
				method: ProjectionMethods.Persp,
				angle: 70.0,
				near: 0.5,
				far: 50.0,
			},
			backColor: new Color4(0.93, 0.93, 0.93, 1.0),
			backgroundImage: null,
			enableDrawMesh: true,
			enableCustomDraw: true,
			enableLighting: true,
			enableLightmap: true,
			enableNormalMap: true,
			enableEnvmap: true,
			enableHighlightSelectedChildren: true,
			enablePostprocess: true,
			enableShadow: false,
			shadowQuality: {
				scale: 5,
				viewDepth: 2,
				resolution: 1024 * Math.min(window.devicePixelRatio, 2),
        intensity: 0.2,
        enableCache: false,
			},
			renderingImage: {
        gamma: 1.0,
        alpha: 1.0,
			},
			bloomEffect: {
				enabled: true,
				threshold: 0.1,
				gamma: 2.0,
      },
      ssao: { /* experimental */
        enabled: false,
        resolutionRatio: 0.5,
        intensity: 0.2,
      },
			debugMode: false,
			showDebugPanel: false,
      pipelinePreview: false,
      enableAntialias: false,
      webglOptions: {
        alpha: true,
        antialias: true,
      },
		};
	}

	constructor(options) {

		this.initialized = false;
		this.developmentVersion = false;

		this.isMobileDevice = (function() {
			let check = false;
			(function(a) { if (/(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino/i.test(a) || /1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s\-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|\-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw\-(n|u)|c55\/|capi|ccwa|cdm\-|cell|chtm|cldc|cmd\-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc\-s|devi|dica|dmob|do(c|p)o|ds(12|\-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(\-|_)|g1 u|g560|gene|gf\-5|g\-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd\-(m|p|t)|hei\-|hi(pt|ta)|hp( i|ip)|hs\-c|ht(c(\-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i\-(20|go|ma)|i230|iac( |\-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc\-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|\-[a-w])|libw|lynx|m1\-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m\-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(\-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)\-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|\-([1-8]|c))|phil|pire|pl(ay|uc)|pn\-2|po(ck|rt|se)|prox|psio|pt\-g|qa\-a|qc(07|12|21|32|60|\-[2-7]|i\-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h\-|oo|p\-)|sdk\/|se(c(\-|0|1)|47|mc|nd|ri)|sgh\-|shar|sie(\-|m)|sk\-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h\-|v\-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl\-|tdg\-|tel(i|m)|tim\-|t\-mo|to(pl|sh)|ts(70|m\-|m3|m5)|tx\-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|\-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(\-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas\-|your|zeto|zte\-/i.test(a.substr(0, 4))) check = true; })(navigator.userAgent || navigator.vendor || window.opera);
			return check;
		})();

		const defaultOptions = Renderer.defaultOptions();
		if (this.isMobileDevice) {
			defaultOptions.renderPixelRatio = 1;
		}

		this.options = { ...defaultOptions, ...options };
    if (Array.isArray(this.options.backColor)) {
      this.options.backColor = new Color4(...this.options.backColor)
    }

		initDOM(this);
	
		let gl;

		try {
			gl = this.canvas.getContext("webgl", this.options.webglOptions);
			if (!gl) gl = this.canvas.getContext("experimental-webgl");
		} catch (e) {
			console.error("cannot create webgl context: " + e);
		}

		if (!gl) {
			console.error("failed to initialize WebGL context.");
			return;
		}

		this.canvas.addEventListener('webglcontextlost', function(e) {
			console.error(e);
			console.error(gl.getError());
		}, false);


		this.gl = gl;

		try {
			this.ctx = this.canvas2d.getContext("2d");
		} catch (e) {
			this.ctx = null;
		}

		this.loadEnvParameters();

		// debug mode
		if (this.options.debugMode) {
			this.debugger = new Debugger(this);

			if (this.options.showDebugPanel) {
				this.debugger.showDebugPanel = true;
			}
		}

		this.drawingContext2D = new DrawingContext2D(this.canvas2d, this.ctx);

		this.currentScene = null;
		this.current2DScene = null;
	
		this.wireframe = false;
		this.aspectRate = 1.0;
		this.transparencyList = [];

		this.respool = new ResourcePool();

		// matrices
		this.projectionMatrix = new Matrix4();
		this.viewMatrix = new Matrix4();
		this.cameraMatrix = new Matrix4();
		this.modelMatrix = new Matrix4();

		// load shaders
		this.currentShader = null;
		this.shaderStack = [];

		if (typeof this.options.defaultShader === "undefined") {
			this.options.defaultShader = "standard";
		}

		this.aspectRate = 1;
		// this.renderSize = new Size();
		this.renderLogicalSize = new Size();
		this.renderPhysicalSize = new Size();

		// if (typeof StencilBuffer === "function") {
		// this.stencilBuffer = new StencilBuffer(this);
		// }

		gl.enable(gl.DEPTH_TEST);
		gl.depthFunc(gl.LEQUAL);
		gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    
    // gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

		gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE_MINUS_DST_ALPHA, gl.ONE);
		// gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE_MINUS_DST_ALPHA, gl.ONE);
			
		// window.addEventListener("resize", _ => this.resetViewport(), false);

		const checkCanvasResize = _ => {
			if (this.canvas.clientWidth !== this.renderLogicalSize.width
				|| this.canvas.clientHeight !== this.renderLogicalSize.height) {
				console.log("canvas resized");
				this.resetCanvasSize();
			}
		}
		this.checkCanvasSizeInterval = setInterval(_ => checkCanvasResize(), 1000);

		this.resetViewport();

		if (typeof Viewer === "function") {
			this.viewer = new Viewer(this);
		} else {
			this.viewer = null;
		}

		this.cachedMeshes = {};
		this.cachedTextures = {};
		this.cachedImages = {};
		this.resourceManager = new ResourceManager();

		// create shader programs
		for (const [_, define] of Object.entries(ShaderSources)) {
			this.loadShader(define, define.vert, define.frag);
		}

		this.init();
		this.render();
  }
  
  init() {
		this.initialized = true;
	
		// apply default shader
		this.useShader(this.options.defaultShader);
	
		invokeIfExist(this, "oninit");

		this.createPipeline();
	
		if (this.currentScene) {
			this.currentScene.requireUpdateFrame();
		}
	
		console.debug("renderer initialized.");
	}

	loadShader(shaderDefine, vertSource, fragSource) {	
		const shader = new shaderDefine.class(this, vertSource, fragSource);
		shaderDefine.instance = shader;
		invokeIfExist(shaderDefine, "oncreate");
	}

	get renderPixelRatio() {
		return this.options.renderPixelRatio;
	}
	
	set renderPixelRatio(val) {
		this.options.renderPixelRatio = val;
		this.resetViewport();
	}

	setViewportToPhysicalRenderSize() {
		this.setGLViewportSize(this.renderPhysicalSize.width, this.renderPhysicalSize.height);
	}

	setGLViewportSize(width, height) {
		this.gl.viewport(0, 0, width, height);
	}

	get renderSize() {
		return this.renderLogicalSize;
	}

	resetViewport() {
		const renderSize = this.renderLogicalSize;
	
		renderSize.width = this.container.clientWidth;
		renderSize.height = this.container.clientHeight;

		this.renderPhysicalSize.width = Math.ceil(renderSize.width * this.options.renderPixelRatio);
		this.renderPhysicalSize.height = Math.ceil(renderSize.height * this.options.renderPixelRatio);
	
		this.aspectRate = renderSize.width / renderSize.height;
	
		this.canvas.width = this.renderPhysicalSize.width;
		this.canvas.height = this.renderPhysicalSize.height;
		
		this.canvas2d.width = renderSize.width;
		this.canvas2d.height = renderSize.height;

		this.setViewportToPhysicalRenderSize();

		if (this.currentScene) {
			this.currentScene.requireUpdateFrame();
		}
	}

	resetCanvasSize() {
		this.resetViewport();

		for (const node of this.pipelineNodes) {
			node.resize(this.renderPhysicalSize.width, this.renderPhysicalSize.height);
		}
	}

	getCanvasResolution() {
		return {
			width: this.canvas.width,
			height: this.canvas.height,
		};
	}

	loadEnvParameters() {
		const gl = this.gl;

		this.envParams = {
			MAX_TEXTURE_SIZE: gl.getParameter(gl.MAX_TEXTURE_SIZE),
		}
	}	

	useShader(shader) {
		if (!shader || !this.initialized) return;
	
		let shaderInstance;

		if (typeof shader === "string") {
			var shaderDefine = ShaderSources[shader];

			if (shaderDefine
				&& shaderDefine.instance instanceof Shader) {
				shaderInstance = shaderDefine.instance;
			}
		} else if (typeof shader === "object") {
			if (shader.instance) {
				shaderInstance = shader.instance;
			} else if (shader instanceof Shader) {
				shaderInstance = shader;
			}
		}

		if (shaderInstance) {
			this.shaderStack.push(shaderInstance);
			shaderInstance.use();
		}

		this.currentShader = shaderInstance;

		return shaderInstance;
	}
	
	getCurrentShader() {
		return this.shaderStack[this.shaderStack.length - 1];
	}
	
	useCurrentShader() {
		var shader = this.getCurrentShader();
		shader.use();
	}
	
	disuseCurrentShader() {
		if (this.shaderStack.length > 1) {
			this.shaderStack.pop();
			var shader = this.shaderStack[this.shaderStack.length - 1];
			shader.use();
		}
	}

	clearViewport() {
		const gl = this.gl;
	
		const backColor = this.options.backColor;
		gl.clearColor(backColor.r, backColor.g, backColor.b, 1.0);
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
	}
	
	perspectiveProject(m) {
		m.perspective(this.getAfov(), this.aspectRate,
			this.options.perspective.near, this.options.perspective.far);
	}
	
	orthographicProject(m) {
		const scale = this.viewer.originDistance;
		m.ortho(-this.aspectRate * scale, this.aspectRate * scale, -scale, scale, -this.options.perspective.far, this.options.perspective.far);
	}
	
	getAfov() {
		const scene = this.currentScene;
	
		if (scene && scene.mainCamera && typeof scene.mainCamera.fieldOfView !== "undefined") {
			return scene.mainCamera.fieldOfView;
		} else {
			return this.options.perspective.angle;
		}
	}
	
	render() {
		requestAnimationFrame(_ => this.render());

		if (this.initialized) {
			const scene = this.currentScene;

			// FIXME: remove this
			let clear2d = false;
	
			if (scene && (scene.animation || scene.requestedUpdateFrame)) {
				if (this.options.debugMode && this.debugger) {
					this.debugger.beforeDrawFrame();
				}

				// this.setViewportToPhysicalRenderSize();

				this.ctx.clearRect(0, 0, this.canvas2d.width, this.canvas2d.height);
				clear2d = true;

				scene.requestedUpdateFrame = false;

        this.prepareRenderMatrices();
				this.renderPipeline();

				if (this.options.debugMode && this.debugger) {
					this.debugger.afterDrawFrame();
				}
			}
	
			if (this.current2DScene && (this.current2DScene.animation || this.current2DScene.requestedUpdateFrame)) {
				if (!clear2d) {
					this.ctx.clearRect(0, 0, this.canvas2d.width, this.canvas2d.height);
				}
				this.current2DScene.render(this.drawingContext2D);
				this.current2DScene.requestedUpdateFrame = false;
			}
		}
	}

	createPipeline() {
		this.pipelineNodes = [];

    const renderImageWidth = this.renderPhysicalSize.width * (this.options.renderingImage.resolutionRatio || 1.0),
      renderImageHeight = this.renderPhysicalSize.height * (this.options.renderingImage.resolutionRatio || 1.0);
    
    if (this.options.backgroundImage) {
      this.createTextureFromURL(this.options.backgroundImage, tex => {
        const bgImageSource = new ImageSource(this, tex);
        this._bgImageRenderer = new ImageToScreenRenderer(this, {
          flipTexcoordY: true
        });
        this._bgImageRenderer.enableAntialias = false;
        this._bgImageRenderer.input = bgImageSource;
        if (this.currentScene) this.currentScene.requireUpdateFrame();
      });
    }
		
		if (this.options.enablePostprocess || this.options.enableShadow || this.options.enableSSAO) {
      const width = this.renderPhysicalSize.width, height = this.renderPhysicalSize.height;
      
			let shadowMapCacheNode;


      // shadow

			if (this.options.enableShadow) {
				const shadowMapRenderer = new ShadowMapRenderer(this, {
					width: this.options.shadowQuality.resolution || 512,
					height: this.options.shadowQuality.resolution || 512,
				});

				shadowMapCacheNode = new ShadowMapBlurCacheRenderer(this, {
          width: shadowMapRenderer.width,
          height: shadowMapRenderer.height,
				});

				shadowMapCacheNode.input = shadowMapRenderer;
      }
      

      // scene to image

			const sceneImageRenderer = new SceneToImageRenderer(this, {
				width: renderImageWidth,
				height: renderImageHeight,
			});
			sceneImageRenderer.shadowMap2DInput = shadowMapCacheNode;

      
      // bloom
      
			let bloomBlurNode;

			if (this.options.enablePostprocess !== false 
				&& (!this.options.bloomEffect || this.options.bloomEffect.enabled !== false)
				) {
				const bloomSmallImageNode = new ImageFilterRenderer(this, {
					width: width * (this.options.bloomEffect.threshold || 0.1),
          height: height * (this.options.bloomEffect.threshold || 0.1),
					flipTexcoordY: true,
					filter: "blur3",
				});
				bloomSmallImageNode.gammaFactor = (this.options.bloomEffect.gamma || 1.4);
				bloomSmallImageNode.input = sceneImageRenderer;
      
				bloomBlurNode = new BlurRenderer(this, {
					width: bloomSmallImageNode.width,
					height: bloomSmallImageNode.height,
				});
				bloomBlurNode.input = bloomSmallImageNode;
      }
      
      const previewRenderer = new MultipleImagePreviewRenderer(this);
      
      // ssao (experimental)

      let ssaoEffectRenderer, ssaoBlurNode;
      
      if (this.options.enableSSAO) {
        const depthMapRenderer = new AttributeRenderer(this, {
          type: 0 // depth
        });
        const normalMapRenderer = new AttributeRenderer(this, {
          type: 1 // normal
        });
        const ssaoRenderer = new SSAORenderer(this, {
          width: this.renderPhysicalSize.width * (this.options.ssao.resolutionRatio || 1.0),
          height: this.renderPhysicalSize.height * (this.options.ssao.resolutionRatio || 1.0),
        });
        ssaoRenderer.depthMapInput = depthMapRenderer;
        ssaoRenderer.normalMapInput = normalMapRenderer;

        ssaoBlurNode = new BlurRenderer(this, {
          width: ssaoRenderer.width * 0.5,
          height: ssaoRenderer.height * 0.5,
        });
        ssaoBlurNode.input = ssaoRenderer;

        ssaoEffectRenderer = new ImageFilterRenderer(this, {
          width: renderImageWidth,
          height: renderImageHeight,
          filter: "linear-interp",
          tex2Filter: "darker",
          tex2Intensity: this.options.ssao.intensity || 0.2,
        });
        ssaoEffectRenderer.input = sceneImageRenderer;
        ssaoEffectRenderer.tex2Input = ssaoBlurNode;

        previewRenderer.addPreview(sceneImageRenderer);
				previewRenderer.addPreview(depthMapRenderer);
				previewRenderer.addPreview(normalMapRenderer);
				previewRenderer.addPreview(ssaoRenderer);
      } else {
        ssaoEffectRenderer = sceneImageRenderer;

        previewRenderer.addPreview(sceneImageRenderer);
				previewRenderer.addPreview(shadowMapCacheNode);
				previewRenderer.addPreview(bloomBlurNode);
      }


      // final render
      if (this.options.pipelinePreview) {
        
				const finalImagePreviewRenderer = new ImageFilterRenderer(this, {
					width: renderImageWidth,
          height: renderImageHeight,
          filter: "linear-interp",
          tex2Filter: "lighter",
				});
				finalImagePreviewRenderer.input = ssaoEffectRenderer;
				finalImagePreviewRenderer.tex2Input = bloomBlurNode;
				finalImagePreviewRenderer.gammaFactor = this.options.renderingImage.gamma;
				finalImagePreviewRenderer.enableAntialias = this.options.enableAntialias;

				// previewRenderer.addPreview(finalImagePreviewRenderer);
				previewRenderer.enableAntialias = true;
				this.pipelineNodes.push(previewRenderer);
			
			} else {
  			const finalScreenRenderer = new ImageToScreenRenderer(this, {
					width: this.renderPhysicalSize.width,
					height: this.renderPhysicalSize.height,
          filter: "linear-interp",
          tex2Filter: "lighter",
        });
        finalScreenRenderer.name = "final-screen-pipeline";
				finalScreenRenderer.input = ssaoEffectRenderer;
				finalScreenRenderer.tex2Input = bloomBlurNode;
				finalScreenRenderer.gammaFactor = this.options.renderingImage.gamma;
				finalScreenRenderer.enableAntialias = this.options.enableAntialias;
				this.pipelineNodes.push(finalScreenRenderer);
			}

		} else {
			this.pipelineNodes.push(new DefaultRenderer(this));
		}
	}
	
	renderPipeline() {
		for (const node of this.pipelineNodes) {
			node.clear();
		}

		for (const node of this.pipelineNodes) {
			node.process();
		}
	}

	renderBackground() {
		if (this.options.backgroundImage) {
			if (this._bgImageRenderer) {
				this._bgImageRenderer.clear();
				this._bgImageRenderer.process();
			}
		} else {
			this.clearViewport();
		}
	}

	renderFrame() {		
		const scene = this.currentScene;
		if (scene) {
			this.drawSceneFrame(scene);
		}
	}

	prepareRenderMatrices() {
		const scene = this.currentScene;
		if (!scene) return;

		this.cameraMatrix.loadIdentity();
		this.viewMatrix.loadIdentity();

		const projectionMethod = ((scene && scene.mainCamera)
			? (this.currentScene.mainCamera.projectionMethod)
			: (this.options.perspective.method));

		switch (projectionMethod) {
			default:
			case ProjectionMethods.Persp:
			case "persp":
				this.perspectiveProject(this.projectionMatrix);
				break;

			case ProjectionMethods.Ortho:
			case "ortho":
				this.orthographicProject(this.projectionMatrix);
				break;
		}

		if (scene.mainCamera) {
			this.makeCameraMatrix(scene.mainCamera, this.cameraMatrix);
		}
	
		this.makeViewMatrix(this.viewMatrix);
	
		this.projectionViewMatrix = this.viewMatrix.mul(this.cameraMatrix).mul(this.projectionMatrix);
		this.projectionViewMatrixArray = this.projectionViewMatrix.toArray();
	}
	
	drawSceneFrame(scene) {

		this.transparencyList = [];
	
		if (!scene) return;

		if (this.debugger) {
			this.debugger.numberOfSceneRendered++;
			if (this.debugger.numberOfSceneRendered > 1) {
				console.warn("duplicate scene renderering");
			}
		}

		scene.beforeDrawFrame(this);

		if (scene.skybox && scene.skybox.loaded) {
			this.useShader("panorama");
			this.drawObject(scene.skybox.cube);
			this.disuseCurrentShader();
		}

		if (this.wireframe) {
			this.useShader("wireframe");
		}

		if (this.currentShader) {
			this.currentShader.beginScene(scene);
		}
	
		for (const obj of scene.objects) {
			this.drawObject(obj);
		}

		if (this.wireframe) {
			this.disuseCurrentShader();
		}

		if (!this.wireframe) {
			// draw transparency objects
			for (const tranObj of this.transparencyList) {
				this.drawObject(tranObj, true);
			}

			// draw selected objects
			if (Array.isArray(scene.selectedObjects)) {
				for (const obj of scene.selectedObjects) {
					if (obj.visible) {
						this.drawHighlightObject(obj, new Color4(0.1, 0.6, 1.0, 0.5));
	
						if (this.options.enableHighlightSelectedChildren) {
							this.drawHighlightChildren(obj, new Color4(0.1, 1.0, 0.6, 0.5));
						}
					}
				}
			}
	
			// draw hover object
			// if (scene.hoverObject) {
			// 	this.drawHighlightObject(scene.hoverObject, new Color4(1.0, 0.5, 0.0, 0.5));
			// }
		}
	
		scene.afterDrawFrame(this);
	
		if (this.currentShader) {
			this.currentShader.endScene(scene);
		}
	}
	
	makeCameraMatrix(camera, m) {
	
		var plist = [];
		var parent = camera.parent;
	
		while (parent) {
			plist.push(parent);
			parent = parent.parent;
		}
	
		// scale
		for (var i = plist.length - 1; i >= 0; i--) {
			var obj = plist[i];
	
			m.scale(1 / obj.scale.x, 1 / obj.scale.y, 1 / obj.scale.z);
		}
	
		m.scale(1 / camera.scale.x, 1 / camera.scale.y, 1 / camera.scale.z);
	
		// rotate
		for (let i = plist.length - 1; i >= 0; i--) {
			let obj = plist[i];
	
			m.rotate(-obj.angle.x, -obj.angle.y, -obj.angle.z);
		}
	
		m.rotate(-camera.angle.x, -camera.angle.y, -camera.angle.z);
	
		// translate
		for (let i = plist.length - 1; i >= 0; i--) {
			let obj = plist[i];
	
			m.translate(-obj.location.x, -obj.location.y, -obj.location.z);
		}
	
		m.translate(-camera.location.x, -camera.location.y, -camera.location.z);
	
		return m;
	}
	
	getCameraRotationMatrix(camera) {
	
		var plist = [];
		var parent = camera.parent;
	
		while (parent) {
			plist.push(parent);
			parent = parent.parent;
		}
	
		var m = new Matrix4().loadIdentity();
	
		for (var i = plist.length - 1; i >= 0; i--) {
			var obj = plist[i];
	
			m.rotate(-obj.angle.x, -obj.angle.y, -obj.angle.z);
		}
	
		return m;
	}
	
	makeViewMatrix(m) {
		const viewer = this.viewer;
    
		if (viewer) {
			m.translateZ(-(viewer.originDistance) * 10);
	
			if ((!viewer.location.equals(0, 0, 0) || !viewer.angle.equals(0, 0, 0)
				// || !viewer.scale.equals(1, 1, 1)
			)) {
				m.rotate(viewer.angle)
					.translate(viewer.location.x, viewer.location.y, viewer.location.z)
					//.scale(viewer.scale.z, viewer.scale.z, viewer.scale.z)
					;
			}
		}
	}
	
	makeProjectMatrix(projectMethod, m) {
		var projectionMethod = projectMethod
			|| ((this.currentScene && this.currentScene.mainCamera)
				? (this.currentScene.mainCamera.projectionMethod)
				: (this.options.perspective.method));
	
		switch (projectionMethod) {
			default:
			case ProjectionMethods.Persp:
			case "persp":
				this.perspectiveProject(m);
				break;
	
			case ProjectionMethods.Ortho:
			case "ortho":
				this.orthographicProject(m);
				break;
		}
	}
	
	createScene() {
		return new Scene(this)
	}
	
	createScene2D() {
		// if (!Draw2D) return null;
	
		var scene = new Draw2D.Scene2D();
		scene.renderer = this;
		return scene;
	}
	
	showScene(scene) {
		if (this.currentScene != scene) {
			if (this.currentScene) {
				this.currentScene.close();
			}
	
			this.currentScene = scene;
	
			if (this.options.debugMode) {
				Debugger.currentScene = scene;
			}
		}

    if (scene && scene.animation) {
      this.render()
    }
	}
	
	drawObject(obj, transparencyRendering = false) {

		if (!obj || obj.visible === false) {
			return;
		}
	
		if (!transparencyRendering) {
			obj.__opacity = (!isNaN(obj._opacity) ? obj._opacity : 1)
				* (1.0 - _mf.clamp((obj.mat && !isNaN(obj.mat.transparency)) ? obj.mat.transparency : 0));
	
			if (obj.__opacity < 1) {
				this.transparencyList.push(obj);
	
				for (const child of obj.objects) {
					this.drawObject(child);
				}
	
				return;
			}
		}

		if (this.debugger) {
			this.debugger.beforeObjectRender(obj);
		}
	
		let shaderPushed = false;
	
		if (obj.wireframe) {
			this.useShader("wireframe");
			shaderPushed = true;
		}

		const objShader = obj.shader || null;
		if (objShader) {
			var objShaderName = objShader.name || null;
	
			if (objShaderName) {
				this.useShader(objShaderName);
				shaderPushed = true;
			}
		}

		if (!shaderPushed && obj instanceof ParticleObject) {
			this.useShader("points");
			shaderPushed = true;
		}
	
		this.currentShader.beginObject(obj);
	
		if (this.options.enableCustomDraw) {
			obj.draw(this);
		}
	
		switch (obj.type) {
			default:
			case ObjectTypes.GenericObject:
				{
					for (const mesh of obj.meshes) {
						if (mesh && this.options.enableDrawMesh) {
							if (mesh.meta && mesh.meta.vertexCount == 0) {
								console.warn('invaliad mesh from object ' + obj.name);
							}
							this.currentShader.beginMesh(mesh);
							mesh.draw(this);
							this.currentShader.endMesh(mesh);
						}
					}
	
					if (!transparencyRendering) {
						for (const child of obj.objects) {
							this.drawObject(child);
						}
					}
				}
				break;
	
			case ObjectTypes.Div:
				{
					var div = obj._htmlObject;
	
					var worldloc = new Vec4(0, 0, 0, 1).mulMat(obj._transform);
					var p = this.transformPoint(worldloc);
	
					var w = div.scrollWidth / 2;
					var h = div.scrollHeight / 2;
	
					div.style.left = (p.x - w) + "px";
					div.style.top = (p.y - h) + "px";
	
					if (typeof obj.enableDepthScale !== "undefined"
						&& obj.enableDepthScale) {
						var pw = 1 + 1 / p.w;
						// let tw = div.scrollWidth * pw / 2;
						// let th = div.scrollHeight * pw / 2;
						// div.style.transform = "translate(" + (tw) + "px," + (th) +"px) scale(" + pw + "," + pw +") translate(" + (-tw) + "px," + (-th) + "px)";
						div.style.transform = "scale3d(" + pw + "," + pw + "," + pw + ")";
					}
				}
				break;
		}

		// const gle = this.gl.getError();
		// if (gle !== 0) console.log(gle);
	
		this.currentShader.endObject(obj);

		if (shaderPushed) {
			this.disuseCurrentShader();
		}
		
		if (this.debugger) {
			this.debugger.afterObjectRender(obj);
		}
		// if (this.debugMode) {
		// 	this.debugger.drawBoundingBox(obj, this.transformStack);
		// }
	}
	
	drawHighlightObject(obj, color) {
		if (obj.visible === false || !this.options.enableDrawMesh || !obj._transform) {
			return;
		}
	
		const shader = this.useShader("solidcolor");
	
		shader.color = color;
		shader.beginObject(obj);
	
		for (const mesh of obj.meshes) {	
			shader.beginMesh(mesh);
			mesh.draw(this);
			shader.endMesh(mesh);
		}
	
		if (this.options.enableCustomDraw) {
			obj.draw(this);
		}
	
		shader.endObject(obj);
		this.disuseCurrentShader();
	}
	
	drawHighlightChildren(obj, color) {
		for (const child of obj.objects) {
			this.drawHighlightObject(child, color);
	
			if (child.objects.length > 0) {
				this.drawHighlightChildren(child, color);
			}
		}
	}
	
	createTextureFromURL(url, handler) {
		const cachedTexture = this.cachedTextures[url];
		if (cachedTexture && typeof handler === "function") {
			handler(cachedTexture);
			return;
		}
	
		this.resourceManager.add(url, ResourceTypes.Image, img => {
			let texture = this.cachedTextures[url];
			
			if (!texture && img) {
				texture = new Texture(img);
			}
	
			if (texture) {
				this.cachedTextures[url] = texture;
			}
	
			if (typeof handler === "function") {
				handler(texture);
			}
		});
	
		this.resourceManager.load();
	}

	createWorldRayFromScreenPosition(p) {
		var ray;
	
		var projectMethod = (this.currentScene && this.currentScene.mainCamera)
			? (this.currentScene.mainCamera.projectionMethod)
			: (this.options.perspective.method);
	
		switch (projectMethod) {
			default:
			case ProjectionMethods.Persp:
			case "persp":
				{
					var viewAngle = (this.currentScene && this.currentScene.mainCamera)
						? (this.currentScene.mainCamera.fieldOfView)
						: (this.options.perspective.angle);
	
					var viewRange = Math.tan(viewAngle * Math.PI / 2.0 / 180.0);
	
					var viewportWidth = viewRange * this.aspectRate;
					var viewportHeight = viewRange;
	
					ray = new Ray(new Vec3(0, 0, 0), new Vec3(
						(p.x / this.renderSize.width - 0.5) * viewportWidth,
						-(p.y / this.renderSize.height - 0.5) * viewportHeight,
						-0.5).normalize());
				}
				break;
	
			case ProjectionMethods.Ortho:
			case "ortho":
				{
					// var viewRange = (this.viewer.originDistance - 0.5) * 10 * 2;
	
					// var viewportWidth = viewRange * this.aspectRate;
					// var viewportHeight = viewRange;
	
					var x = (p.x / this.renderSize.width - 0.5) * viewportWidth;
					var y = -(p.y / this.renderSize.height - 0.5) * viewportHeight;
	
					ray = new Ray(new Vec3(x, y, 0), new Vec3(0, 0, -1));
				}
				break;
		}
	
		var m = this.viewMatrix.mul(this.cameraMatrix).inverse();
		ray.origin = new Vec4(ray.origin, 1).mulMat(m).xyz;
		ray.dir = new Vec4(ray.dir, 0).mulMat(m).xyz.normalize();
	
		return ray;
	}
	
	transformPoint(pos, matrix, projectMethod) {
		return this.toScreenPosition(this.toWorldPosition(pos, matrix, projectMethod), projectMethod);
	}
	
	toScreenPosition(pos) {
		var projectMethod = projectMethod
			|| ((this.currentScene && this.currentScene.mainCamera)
				? (this.currentScene.mainCamera.projectionMethod)
				: (this.options.perspective.method));
		
		var renderHalfWidth = this.renderSize.width / 2;
		var renderHalfHeight = this.renderSize.height / 2;
		
		var w = ((projectMethod == ProjectionMethods.Persp || projectMethod == "persp") ? pos.w : 1.0) || 1.0;
		
		return new Point(
			(pos.x / w) * renderHalfWidth + renderHalfWidth,
			-(pos.y / w) * renderHalfHeight + renderHalfHeight);
	}
		
	toScreenPositionEx(pos) {
		var projectMethod = projectMethod
			|| ((this.currentScene && this.currentScene.mainCamera)
				? (this.currentScene.mainCamera.projectionMethod)
				: (this.options.perspective.method));
		
		var renderHalfWidth = this.renderSize.width / 2;
		var renderHalfHeight = this.renderSize.height / 2;
		
		var w = ((projectMethod == ProjectionMethods.Persp || projectMethod == "persp") ? pos.w : 1.0) || 1.0;
		
		return new Vec3(
			(pos.x / w) * renderHalfWidth + renderHalfWidth,
			-(pos.y / w) * renderHalfHeight + renderHalfHeight,
			1.0 / pos.z
		);
	}

	transformPoints(points) {
		const renderHalfWidth = this.renderSize.width / 2;
		const renderHalfHeight = this.renderSize.height / 2;
		
		const ps = new Array(points.length);
		
		for (var i = 0; i < points.length; i++) {
			var p = new Vec4(points[i], 1.0).mulMat(this.projectionViewMatrix);
		
			ps[i] = new Point(
				(p.x / p.w) * renderHalfWidth + renderHalfWidth,
				-(p.y / p.w) * renderHalfHeight + renderHalfHeight);
		}
		
		return ps;
	}
		
	transformTriangle(triangle) {
		const m = this.viewMatrix.mul(this.cameraMatrix);
		
		return {
			v1: new Vec4(triangle.v1, 1.0).mulMat(m).xyz,
			v2: new Vec4(triangle.v2, 1.0).mulMat(m).xyz,
			v3: new Vec4(triangle.v3, 1.0).mulMat(m).xyz,
		};
	}
		
	viewRayHitTestPlaneInWorldSpace(pos, planeVertices) {
		const ray = this.createWorldRayFromScreenPosition(pos);
		return _mf3.rayIntersectsPlane(ray, planeVertices, Ray.MaxDistance);
	};

	// 2D Drawing by 3D coordinates - Start

	drawPoint(p, size = 3, color = "black") {
		this.drawingContext2D.drawPoint(this.transformPoint(p), size, color);
	}

	drawLine(from, to, width, color) {
		var points = this.transformPoints([from, to]);
		this.drawLine2D(points[0], points[1], width, color);
	};

	drawRay(ray, length = 1, width = 1, color = "black") {
		this.drawArrow(ray.origin, ray.origin.add(ray.dir.mul(length)), width, color);
	}

	drawBBox(box, width, color) {
		if (!box) return;
		
		var points = this.transformPoints([
			{ x: box.min.x, y: box.min.y, z: box.min.z },
			{ x: box.max.x, y: box.min.y, z: box.min.z },
			{ x: box.min.x, y: box.max.y, z: box.min.z },
			{ x: box.max.x, y: box.max.y, z: box.min.z },
		
			{ x: box.min.x, y: box.min.y, z: box.max.z },
			{ x: box.max.x, y: box.min.y, z: box.max.z },
			{ x: box.min.x, y: box.max.y, z: box.max.z },
			{ x: box.max.x, y: box.max.y, z: box.max.z },
		]);
		
		this.drawingContext2D.drawLineSegments([
			points[0], points[1], points[2], points[3],
			points[4], points[5], points[6], points[7],
		
			points[0], points[4], points[1], points[5],
			points[2], points[6], points[3], points[7],
		
			points[0], points[4], points[1], points[5],
			points[2], points[6], points[3], points[7],
		
			points[0], points[2], points[1], points[3],
			points[4], points[6], points[5], points[7],
		], width, color);
	}

	drawFocusBBox(box, len, width, color) {
		if (!box) return;
		
		len = len || 0.1;
		
		var points = this.transformPoints([
			{ x: box.min.x, y: box.min.y, z: box.min.z },
			{ x: box.max.x, y: box.min.y, z: box.min.z },
			{ x: box.min.x, y: box.max.y, z: box.min.z },
			{ x: box.max.x, y: box.max.y, z: box.min.z },
		
			{ x: box.min.x, y: box.min.y, z: box.max.z },
			{ x: box.max.x, y: box.min.y, z: box.max.z },
			{ x: box.min.x, y: box.max.y, z: box.max.z },
			{ x: box.max.x, y: box.max.y, z: box.max.z },
		]);
		
		this.drawingContext2D.drawLineSegments([
			points[0], points[1], points[2], points[3],
			points[4], points[5], points[6], points[7],
		
			points[0], points[4], points[1], points[5],
			points[2], points[6], points[3], points[7],
		
			points[0], points[4], points[1], points[5],
			points[2], points[6], points[3], points[7],
		
			points[0], points[2], points[1], points[3],
			points[4], points[6], points[5], points[7],
		], width, color);
	};
		
	drawArrow(from, to, width, color) {
		var points = this.transformPoints([from, to]);
		this.drawingContext2D.drawArrow(points[0], points[1], width, color);
	};

	drawLine(from, to, width, color) {
		var points = this.transformPoints([from, to]);
		this.drawingContext2D.drawLine(points[0], points[1], width, color);
	};

	fillArrow(from, to, size, color) {
		var points = this.transformPoints([from, to]);
		this.drawingContext2D.fillArrow(points[0], points[1], size, color);
	}

	drawArrow(from, to, width, color) {
		var points = this.transformPoints([from, to]);
		this.drawingContext2D.drawArrow(points[0], points[1], width, color);
	};
	fillArrow(from, to, size, color) {
		var points = this.transformPoints([from, to]);
		this.drawingContext2D.fillArrow(points[0], points[1], size, color);
	}
  
	drawRect(topLeft, bottomRight, strokeWidth, strokeColor, fillColor) {
		var rect3d = this.transformPoints([topLeft, bottomRight]);
		
		var left = Math.min(rect3d[0].x, rect3d[1].x),
			top = Math.min(rect3d[0].y, rect3d[1].y),
			right = Math.max(rect3d[0].x, rect3d[1].x),
			bottom = Math.max(rect3d[0].y, rect3d[1].y);
		
		this.drawingContext2D.drawRect(new Rect(left, top, right - left, bottom - top), strokeWidth, strokeColor, fillColor);
	};

	drawPolygon(points, strokeWidth, strokeColor, fillColor) {
		if (points.length < 2) return;
		this.drawingContext2D.drawPolygon(this.transformPoints(points), strokeWidth, strokeColor, fillColor);
	};

	drawEllipse(v, size, strokeWidth, strokeColor, fillColor) {
		this.drawingContext2D.drawEllipse(this.transformPoint(v), size, strokeWidth, strokeColor, fillColor);
	};

	drawImage(location, image) {
		var p = this.transformPoint(location);
				
		var x = p.x - image.width / 2;
		var y = p.y - image.height / 2;
				
		if (x >= 0 && y >= 0
			&& x < this.renderSize.width && y < this.renderSize.height) {
			return this.drawingContext2D.drawImage({ x: x, y: y }, image);
		}
	};
		
	drawText(location, text, color, halign) {
		this.drawingContext2D.drawText(this.transformPoint(location), text, color, halign);
	};

	// 2D Drawing by 3D coordinates - End

	createSnapshotOfRenderingImage({
		imgformat = "image/png",
		imgQuality = 0.85, /* only for jpeg */
		resolution = this.getCanvasResolution(),
		renderBackground = false,
	} = {
		resolution: this.getCanvasResolution()
	}) {
		
		const renderbuffer = new FrameBuffer(this,
			resolution.width, resolution.height, {
				clearBackground: renderBackground
			}
		);

		renderbuffer.use();
		
		if (renderBackground) {
			this.renderBackground();
		} else {
			this.gl.clearColor(0, 0, 0, 0);
			this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
		}
		
		this.renderFrame();

    let img

		try {
			img = getImageDataURLFromTexture(this, renderbuffer.texture, imgformat, imgQuality)
		} catch (e) {
			console.warn(e)
    }

		renderbuffer.disuse()
		renderbuffer.destroy()

    return img
  };

  releaseResources() {
    this.cachedTextures._t_foreach((_, tex) => tex.destroy());
    this.cachedTextures = {};
    this.cachedMeshes._t_foreach((_, mesh) => mesh.destroy());
    this.cachedMeshes = {};
  }
  
  destroy() {

    for (const pipeline of this.pipelineNodes) {
      pipeline.destroy();
    }

    if (this.currentScene) {
      this.currentScene.destroy();
    }

    this.releaseResources();

    this.container.removeChild(this.canvas);
    this.container.removeChild(this.canvas2d);
    this.container.removeChild(this.surface);

    if (this.debugger) {
      this.debugger.destroy();
    }

    if (this.checkCanvasSizeInterval) {
      clearInterval(this.checkCanvasSizeInterval);
    }

    for (const [_, define] of Object.entries(ShaderSources)) {
      if (define.instance) {
        define.instance.destroy();
      }
    }

    Shader.emptyTexture.destroy();

    console.debug('renderer released');
  }
};

Renderer.prototype.toWorldPosition = (function() {
	var projectionMatrix = new Matrix4();
	
	return function(pos, viewMatrix, projectMethod) {
	
		this.makeProjectMatrix(projectMethod, projectionMatrix);
	
		var m = (viewMatrix || this.viewMatrix).mul(this.cameraMatrix).mul(projectionMatrix);
	
		if (Array.isArray(pos)) {
			for (var i = 0; i < pos.length; i++) {
				pos[i] = new Vec4(pos[i], 1.0).mulMat(m);
			}
		} else {
			return new Vec4(pos, 1.0).mulMat(m);
		}
	};
})();


new EventDispatcher(Renderer).registerEvents(
	"canvasResized");

export const ProjectionMethods = {
		Persp: 0,
		Ortho: 1,
	};

export const DrawMode = {
		Normal: 0,
		ShadowMap: 1,
	}


export class ResourcePool {
	constructor() {
	}

	loadTexture(url, onload) {
	}
};

new EventDispatcher(ResourcePool).registerEvents(
	"texAdded");
