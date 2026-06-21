
import { Vec2, Vec3, Vec4, Color3, Color4, Ray } from "@jingwood/graphics-math";
import { BoundingBox3D } from "@jingwood/graphics-math";

import { EventDispatcher } from '../utility/event';
import { SceneObject, Sun, ObjectTypes } from './object';
import { Material } from './material';
import { loadObjFormat } from '../utility/objloader';
import { ResourceManager, ResourceTypes } from '../utility/resourcemanager';
import { LightLimitation } from "../shader/standard";
import { Camera } from "./camera";
import { Mesh } from "../webgl/mesh";
import { Texture } from "../webgl/texture";
import { CubeMap } from "../webgl/cubemap";
import { Archive } from "../utility/archive";
import { Animation } from "./animation";
import { arrayRemove, byteArrayToBase64 } from "../utility/utility";
import { GLTFLoader } from "../utility/gltfloader";
import { Keys } from "./viewer";

export class Scene {
	renderer: any;

	objects: any[];
	hoverObject: any;
	selectedObjects: Set<any>;

	hitObject: any;
	draggingObject: any;

	models: any;
	materials: any;
	_refmaps: any;
	_bundles: any;
	_lightSources: any;
	_activedLightSources: any[];

	resourceManager: ResourceManager;
	animation: boolean;
	requestedUpdateFrame: boolean;

	shadowMap: any;
	shadowMapUpdateRequested: boolean;
	skybox: any;

	mainCamera: Camera;
	sun: Sun;

	_probeVolume?: any;
	_probesBaked?: boolean;

	// --- members injected by the EventDispatcher mixin (see bottom of file) ---
	declare on: (event: string, listener: (...args: any[]) => any) => any;
	declare addEventListener: (event: string, listener: (...args: any[]) => any) => any;
	declare removeEventListener: (event: string, listener: (...args: any[]) => any) => void;
	declare onmousedown: (...args: any[]) => any;
	declare onmouseup: (...args: any[]) => any;
	declare onmousemove: (...args: any[]) => any;
	declare onmousewheel: (...args: any[]) => any;
	declare onbegindrag: (...args: any[]) => any;
	declare ondrag: (...args: any[]) => any;
	declare onenddrag: (...args: any[]) => any;
	declare onkeyup: (...args: any[]) => any;
	declare onkeydown: (...args: any[]) => any;
	declare onobjectAdd: (...args: any[]) => any;
	declare onobjectRemove: (...args: any[]) => any;
	declare onmainCameraChange: (...args: any[]) => any;
	declare onframe: (...args: any[]) => any;
	declare onarchiveLoaded: (...args: any[]) => any;

	constructor(renderer?: any) {
		this.renderer = renderer;

		this.objects = [];
		this.hoverObject = null;
		this.selectedObjects = new Set();

		this.hitObject = null;
		this.draggingObject = null;

		this.models = {};
		this.materials = {};
		this._refmaps = {};
		this._bundles = {};
		this._lightSources = [];
		this._activedLightSources = [];

		this.resourceManager = new ResourceManager();
		this.animation = false;
		this.requestedUpdateFrame = true;

    this.shadowMap = null;
    this.shadowMapUpdateRequested = true;
    this.skybox = null;

		// main camera
    this.mainCamera = new Camera();
    this.mainCamera.location.set(0, 1, 3);
    this.mainCamera.angle.x = -5;
    this.add(this.mainCamera);

		// sun
    this.sun = new Sun();
    this.sun.location = new Vec3(10, 20, 5);
    this.sun.mat = {};

	}

	loadArchive(name: string, url: string, loadingSession: any, callback?: any) {

		let archiveInfo = this._bundles[name];

		if (!archiveInfo) {
      const archive = new Archive();
      archive.src = url;

			archiveInfo = {
				name: name,
				url: url,
				archive: archive,
			};

			this._bundles[name] = archiveInfo;

			archive.isLoading = true;

			if (loadingSession) {
				loadingSession.downloadArchives.push(archive);
			}

			loadingSession.rm.add(url, ResourceTypes.Binary, (stream: any) => {
				try {
					archive.loadFromStream(stream);
				} catch (e) { console.error(e); }
				archive.isLoading = false;
				if (typeof callback === "function") callback(archive);
				this.onarchiveLoaded(url, archive);
			}, (e: any) => {
				archive.dataLength = e.total;
				archive.loadingLength = e.loaded;

				if (loadingSession) loadingSession.progress();
			});

			if (!loadingSession) {
				loadingSession.rm.load();
			}
		} else if (archiveInfo.archive.isLoading) {
			this.on("archiveLoaded", function(_url: any, bundle: any) {
				if (url === _url) {
					if (typeof callback === "function") callback(bundle);
				}
			});
		} else if (archiveInfo.archive) {
			if (typeof callback === "function") callback(archiveInfo.archive);
		}
	}

	loadArchives(archs: any, loadingSession: any) {
		for (const [key, value] of Object.entries(archs) as [string, any][]) {
			this.loadArchive(key, value.url, loadingSession);
		};
	}

  createObjectFromBundle(url: string, ondone: any, loadingSession?: any) {
    this.loadArchive(url, url, loadingSession, (archive: any) => {
      const manifestDataText = archive.getChunkTextData(0x1, 0x7466696d);

      if (manifestDataText) {
        let manifest;
        try {
          manifest = JSON.parse(manifestDataText);
        } catch (ex) {
          console.warn("parse manifest error: " + ex);
        }
        if (manifest && typeof ondone === "function") {
          ondone(archive, manifest);
        }
      }
    });
  }

  createObjectFromURL(url: string, finishCallback?: any) {
    if (url.endsWith('.toba') || url.endsWith('.tob')
      || url.endsWith('.soba') || url.endsWith('.sob')) {
      const rm = new ResourceManager();
      const loadingSession = new LoadingSession(rm);

      this.createObjectFromBundle(url, (bundle: any, manifest: any) => {
        const rootObject = this.createObjectFromManifest(manifest, null, bundle);

        if (typeof finishCallback === "function") {
          finishCallback(rootObject);
        }

      }, loadingSession);

      rm.load();
      return loadingSession;
    } else if (url.endsWith(".gltf")) {
      const loader = new GLTFLoader(this);
      loader.loadFromUrl(url, (obj: any) => finishCallback(obj));
    } else {
    const rm = new ResourceManager();
      const loadingSession = new LoadingSession(rm);

      this.createObjectFromBundle(url, (bundle: any, manifest: any) => {
        const rootObject = this.createObjectFromManifest(manifest, null, bundle);

        if (typeof finishCallback === "function") {
          finishCallback(rootObject);
        }

      }, loadingSession);

      rm.load();
    }
  }

  // create objects from a manifest, add them to the scene
	load(...args: any[]): LoadingSession {

		const loadingSession = new LoadingSession(this.resourceManager);

		for (let i = 0; i < args.length; i++) {
			let objDefine = args[i];

			if (objDefine) {
				const obj = this.createObjectFromManifest(objDefine, loadingSession)
        if (obj) {
          this.add(obj)
        }
			}
		}

		this.resourceManager.load();
		this.requireUpdateFrame();

		return loadingSession;
	}

	close() {
		// TODO
	}

	createObjectFromManifest(manifest: any, loadingSession?: any, bundle?: any) {
    let loadingSessionCreated = false
    if (!loadingSession) {
      loadingSession = new LoadingSession()
      loadingSessionCreated = true
    }

		var _bundles = manifest._bundles;
		if (_bundles) {
			this.loadArchives(_bundles, loadingSession);
		}

		var _materials = manifest._materials;
		if (_materials) {
			this.loadMaterials(_materials, loadingSession, bundle);
		}

		var _refmaps = manifest._refmaps;
		if (_refmaps) {
			this.loadReflectionMaps(_refmaps, loadingSession, bundle);
		}

    const rootObject = new SceneObject();
		this.setupObjectFromManifest(rootObject, manifest, loadingSession, bundle);

    if (loadingSessionCreated) {
      loadingSession.rm.load()
    }

    return rootObject;
	}

	createObjectFromObjFormat(url: string, callback: any) {
		this.resourceManager.add(url, ResourceTypes.Text, (text: any) => {
			callback(loadObjFormat(text));
		});
		this.resourceManager.load();
	}

	add(...objs: any[]) {
		for (var i = 0; i < objs.length; i++) {
			var obj = objs[i];
			if (obj instanceof SceneObject) {
				this.objects.push(obj)

        obj.scene = this;
        obj.updateTransform();
			} else {
        console.warn('attempt to add non-object into scene', obj)
      }
		}
		this.requireUpdateFrame();
	}

	whenObjectAdd(obj: any) {
		if (obj.mat && obj.mat.emission > 0) {
			this._lightSources.push(obj);
		}

		this.onobjectAdd(obj);
	}

	whenObjectRemove(obj: any) {
		arrayRemove(this._lightSources, obj);

		this.onobjectRemove(obj);
	}

	show() {
		this.renderer.showScene(this);
		this.requireUpdateFrame();
	}

	beforeDrawFrame(renderer: any) {
		this.updateLightSources();
	}

	afterDrawFrame(renderer: any) {
		this.onframe(renderer);
		this.requestedUpdateFrame = false;
	}

	requireUpdateFrame() {
    this.requestedUpdateFrame = true;
	}

	// Define a light-probe irradiance volume over an axis-aligned region.
	// min/max are [x,y,z] world bounds; dims is [nx,ny,nz] probe counts per axis.
	// The renderer bakes it once (requires renderer.options.enableLightProbes).
	setLightProbeVolume(min: any, max: any, dims: any) {
		this._probeVolume = { min, max, dims };
		this._probesBaked = false;
		this.requireUpdateFrame();
	}

	// Force the probe volume to be re-baked on the next frame.
	requestProbeBake() {
		this._probesBaked = false;
		this.requireUpdateFrame();
	}

	loadMaterials(mats: any, loadingSession: any, bundle?: any) {
		for (const [mName, matDefine] of Object.entries(mats)) {
      const mat = new Material()
      mat.name = mName
			this.prepareMaterialObject(mat, matDefine, loadingSession, bundle);
			this.materials[mName] = mat
		}
	}

	loadReflectionMaps(refmaps: any, loadingSession: any, bundle?: any) {
		var _this = this;

		var datafileUrl = refmaps._datafile;

		for (const [pName, pValue] of Object.entries(refmaps) as [string, any][]) {
			if (pName == "_datafile") continue;

			pValue.name = pName;
			pValue.cubemap = new CubeMap(_this.renderer);

			var bbmin = Vec3.fromArray(pValue.bounds.min);
			var bbmax = Vec3.fromArray(pValue.bounds.max);
			pValue.cubemap.bbox = new BoundingBox3D(bbmin, bbmax);
			_this._refmaps[pName] = pValue;

			if (!datafileUrl) {
				pValue.downloadedImageCount = 0;

				var maps = pValue.maps;
				var dataUrl = pValue.data;
				var rm = loadingSession.rm;

				if (maps) {
					for (var i = 0; i < maps.length; i++) {
						rm.add(maps[i], ResourceTypes.Image, function() {
							pValue.downloadedImageCount++;

							if (pValue.downloadedImageCount >= 6) {
								pValue.cubemap.setImages([
									rm.get(maps[0]), rm.get(maps[1]), rm.get(maps[2]),
									rm.get(maps[3]), rm.get(maps[4]), rm.get(maps[5]),
								]);
							}
						});
					}
				} else if (dataUrl) {

					const loadedHandler = function(buffer: any) {
						pValue.cubemap.setRawData(buffer);
					};

					if (!Archive.canLoadFromArchive(_this, dataUrl, 0x70616d72, bundle, loadedHandler)) {
						rm.add(dataUrl, ResourceTypes.Binary, loadedHandler);
					}
				}
			}
		}
	}

	remove(obj: any) {
		if (!obj) return;

		// if object has parent, remove from its parent
		if (obj.parent) {
			obj.parent.remove(obj);
		} else if (this.objects.includes(obj)) {
			// else remove from current scene
			this.objects = this.objects.filter(o => o != obj);
			obj.parent = null;
			obj.scene = null;
		}

		this.onobjectRemove(obj);
	}

	selectObject(obj: any) {
		this.selectedObjects.add(obj);
		obj.isSelected = true;
	}

	deselectObject(obj: any) {
		this.selectedObjects.delete(obj);
		obj.isSelected = false;
	}

	removeAllSelectedObjects() {
    for (const obj of this.selectedObjects) {
      this.remove(obj);
    }

		this.selectedObjects.clear();
		this.requireUpdateFrame();
	}

	updateLightSources() {
		this._activedLightSources = [];

		if (!this.renderer.options.enableLighting) {
			return;
		}

		if (this.renderer.debugger) {
			this.renderer.debugger.beforeSelectLightSource();
		}

		let cameraLocation;

		if (this.mainCamera) {
			cameraLocation = this.mainCamera.worldLocation;
		} else {
			cameraLocation = Vec3.zero;
		}

		for (const object of this._lightSources) {
			if (object.visible === true) {
				if (typeof object.mat === "object" && object.mat !== null) {
					if (typeof object.mat.emission !== "undefined" && object.mat.emission > 0) {

						var lightWorldPos;

						if (Array.isArray(object.meshes) && object.meshes.length > 0) {
							var bounds = object.getBounds();
							lightWorldPos = Vec3.add(bounds.min, Vec3.mul(Vec3.sub(bounds.max, bounds.min), 0.5));
						} else {
							lightWorldPos = new Vec4(0, 0, 0, 1).mulMat(object._transform).xyz;
						}

						var distance = Vec3.sub(lightWorldPos, cameraLocation).length();
						if (distance > LightLimitation.Distance) return;

						var index = -1;

						for (var i = 0; i < LightLimitation.Count
							&& i < this._activedLightSources.length; i++) {
							var existLight = this._activedLightSources[i];
							if (distance < existLight.distance) {
								index = i;
								break;
							}
						}

						if (index === -1) {
							this._activedLightSources.push({
								object: object,
								worldloc: lightWorldPos,
								distance: distance
							});
						} else if (index >= 0) {
							this._activedLightSources.splice(index, 0, {
								object: object,
								worldloc: lightWorldPos,
								distance: distance
							});
						}
					}
				}
			}
		}

		if (this._activedLightSources.length > LightLimitation.Count) {
      this._activedLightSources.splice(LightLimitation.Count);
    }

		if (this.renderer.debugger) {
			this.renderer.debugger.afterSelectLightSource();
		}
	}

	createMeshFromURL(url: string, handler: any, rm?: any) {
		var renderer = this.renderer;

		var cachedMesh = renderer.cachedMeshes[url];
		if (cachedMesh && typeof handler === "function") {
			handler(cachedMesh);
			return;
		}

		if (rm === undefined) {
			rm = this.resourceManager;
		}

		rm.add(url, ResourceTypes.Binary, function(stream: any) {
			var mesh = renderer.cachedMeshes[url];

			if (!mesh && stream) {
				mesh = new Mesh();
				mesh.loadFromStream(stream);
			}

			if (mesh) {
				renderer.cachedMeshes[url] = mesh;
			}

			if (typeof handler === "function") {
				handler(mesh);
			}
		});

		rm.load();
	}

	createTextureFromURL(url: string, handler: any) {
		if (this.renderer) {
			this.renderer.createTextureFromURL(url, handler);
		}
	}

	prepareObjectMesh(obj: any, objDefine: any, name: any, value: any, loadingSession: any, bundle?: any) {
		const scene = this;
		const renderer = this.renderer;

		const rm = loadingSession ? loadingSession.rm : this.resourceManager;

    if (typeof value === "string" && value.length > 0) {
      const cachedKey = bundle ? (bundle.src + '|$|' + value) : value;

			if (renderer.cachedMeshes.hasOwnProperty(cachedKey)) {
				var mesh = renderer.cachedMeshes[cachedKey];
				obj.addMesh(mesh);
				if (typeof name === "string") {
					obj[name] = mesh;
				}
			} else {
				if (loadingSession) loadingSession.resourceMeshCount++;

				var loadedHandler = function(this: any, buffer: any, archive: any) {
					if (loadingSession) {
						loadingSession.downloadMeshCount++;
						loadingSession.progress();
					}

					var mesh = scene.prepareObjectMeshFromURLStream(obj, value, buffer, loadingSession, bundle);

					if (mesh) {
						if (archive) {
							if (mesh._lightmapTrunkId) {
								if (mesh._lightmapType === 1) {
									let tex = archive.cachedChunks[mesh._lightmapTrunkId];

									if (tex) {
										mesh._lightmap = tex;
										scene.requireUpdateFrame();
									} else {
										tex = new Texture();
										tex.isLoading = true;

										archive.cachedChunks[mesh._lightmapTrunkId] = tex;

										const lightmapData = archive.getChunkData(mesh._lightmapTrunkId);

										let img = undefined;

										if (typeof Blob === "function" && typeof URL === "function") {
											const blob = new Blob([new Uint8Array(lightmapData)], { type: "image/jpeg" });

											img = new Image();
											img.src = URL.createObjectURL(blob);
										} else {
											const imageDataBase64 = byteArrayToBase64(new Uint8Array(lightmapData));

											img = new Image();
											img.src = "data:image/jpeg;base64," + imageDataBase64;
										}

										if (img) {
											img.onload = function() {
												tex.image = img;
												tex.isLoading = false;
												tex.enableMipmapped = true;
												tex.enableRepeat = false;
												mesh._lightmap = tex;
												scene.requireUpdateFrame();
											};
										}
									}
								}
							}

							if (mesh._refmapTrunkId) {
								let refmap = archive.cachedChunks[mesh._refmapTrunkId];

								if (!refmap) {
									refmap = new CubeMap(this.renderer);

									archive.cachedChunks[mesh._refmapTrunkId] = refmap;

									const refmapData = archive.getChunkData(mesh._refmapTrunkId);
									refmap.setRawData(refmapData);
								}

								if (refmap) {
									mesh._refmap = refmap;
								}
							}
						}
					}
				};

				if (!Archive.canLoadFromArchive(this, value, 0x6873656d, bundle, loadedHandler)) {
					rm.add(value, ResourceTypes.Binary, loadedHandler);
				}
			}
		}
	}

	prepareObjectMeshFromURLStream(obj: any, url: string, buffer: any, loadingSession?: any, bundle?: any) {
		if (!buffer) return;

		var mesh = null;
		var renderer = this.renderer;

    const cacheUrl = (bundle ? bundle.src : '') + '|$|' + url;

		if (renderer.cachedMeshes.hasOwnProperty(cacheUrl)) {
			mesh = renderer.cachedMeshes[cacheUrl];
		} else {
			mesh = new Mesh();
			mesh.loadFromStream(buffer);
			renderer.cachedMeshes[url] = mesh;
		}

		if (mesh) {
			obj.addMesh(mesh);
			this.requireUpdateFrame();

			if (typeof name === "string") {
				obj[name] = mesh;
			}

			if (loadingSession) {
				loadingSession.onobjectMeshDownload(obj, mesh);
			}
		}

		return mesh;
	}

	prepareMaterialObject(mat: any, matDefine: any, loadingSession?: any, bundle?: any) {

		const setTextureImage = (name: string, buffer: any, url: string) => {
			if (loadingSession) {
				loadingSession.downloadTextureCount++;
				loadingSession.progress();
			}

      const cacheKey = bundle ? (bundle.src + '|$|' + url) : url;

      let timg = this.renderer.cachedImages[cacheKey];
			if (timg) {
				mat[name] = timg.tex;
				return;
			}

			if (buffer instanceof ArrayBuffer) {
				let image;

				if (typeof Blob === "function" && typeof URL === "function") {
					var blob = new Blob([new Uint8Array(buffer)], { type: "image/jpeg" });

					image = new Image();
					image.src = URL.createObjectURL(blob);
				} else {
					var imageDataBase64 = byteArrayToBase64(new Uint8Array(buffer));

					image = new Image();
					image.src = "data:image/jpeg;base64," + imageDataBase64;
				}

				let tex = new Texture(image);
				tex.isLoading = true;

				this.renderer.cachedImages[cacheKey] = {
					img: image,
					tex: tex,
				};

				mat[name] = tex;
				this.renderer.cachedTextures[cacheKey] = tex;

				image.addEventListener("load", () => {
					tex.isLoading = false;
					this.requireUpdateFrame();
				});
			} else if (buffer instanceof Image) {
				mat[name] = new Texture(buffer);
				this.renderer.cachedTextures[cacheKey] = mat[name];
				this.requireUpdateFrame();
			}
		}

		for (const [name, value] of Object.entries(matDefine) as [string, any][]) {

			switch (name) {
				case "color":
					if (typeof value === "object" && value instanceof Array) {
						switch (value.length) {
							case 3:
								mat[name] = new Color3(...value);
								break;
							case 4:
								mat[name] = new Color4(...value);
								break;
						}
					}
					break;

				case "tex":
				case "normalmap":
          if (typeof value === "string" && value.length > 0) {
            const cacheKey = bundle ? (bundle.src + '|$|' + value) : value;

						if (this.renderer.cachedTextures.hasOwnProperty(cacheKey)) {
              mat[name] = this.renderer.cachedTextures[cacheKey];
						} else {
							if (loadingSession) loadingSession.resourceTextureCount++;

							if (!Archive.canLoadFromArchive(this, value, 0, bundle, (buffer: any, bundle: any, uid: any) => {
								setTextureImage(name, buffer, value);
							})) {
								loadingSession.rm.add(value, ResourceTypes.Image, (image: any) => {
									setTextureImage(name, image, value);
								});
							}
						}
					}
					break;

				case "texTiling":
					if (typeof value === "object" && value instanceof Array) {
						switch (value.length) {
							default: break;
							case 2: mat[name] = new Vec2(...value); break;
							case 3: mat[name] = new Vec3(value[0], value[1], value[2]); break;
							case 4: mat[name] = new Vec4(value[0], value[1], value[2], value[3]); break;
						}
					}
					break;

        default:
          mat[name] = value;
          break;
			}
		}
	}

	setupObjectFromManifest(obj: any, objDefine: any, loadingSession?: any, bundle?: any) {
		const scene = this;

    for (const [name, value] of Object.entries(objDefine) as [string, any][]) {
      switch (name) {
        case "mesh":
          if (typeof value === "string" && value.length > 0) {
            this.prepareObjectMesh(obj, objDefine, "mesh", value, loadingSession, bundle);
          } else if (typeof value === "object") {
            if (value instanceof Array) {
              for (const mesh of value) {
                this.prepareObjectMesh(obj, objDefine, null, mesh, loadingSession, bundle);
              }
            } else if (value instanceof Mesh) {
              obj.addMesh(value);
            }
          }
          break;

        case "lightmap":
          if (typeof value === "string" && value.length > 0) {
            if (loadingSession) loadingSession.resourceLightmapCount++;

            loadingSession.rm.add(value, ResourceTypes.Image, function(image: any) {

              if (loadingSession) {
                loadingSession.downloadLightmapCount++;
                loadingSession.progress();
              }

              if (image) {
                var lmapTex = new Texture(image);
                obj.lightmap = lmapTex;
                scene.requireUpdateFrame();
              }
            });
          }
          break;

        case "mat":
          if (typeof value === "string" && value.length > 0) {
            const globalMaterial = this.materials[value];
            if (globalMaterial) {
              obj.mat = globalMaterial;
            } else if (this.renderer.options.debugMode) {
              console.warn("material not found in scene global scope: " + value);
            }
          } else if (typeof value === "object") {
            if (!obj.mat) {
              obj.mat = new Material()
            }
            this.prepareMaterialObject(obj.mat, value, loadingSession, bundle);
          }
          break;

        case "location":
        case "angle":
        case "scale":
          if (typeof value === "object" && Array.isArray(value)) {
            switch (value.length) {
              default: break;
              case 3: case 4:
                delete obj[name]; // delete property from define
                obj[name].set(value[0], value[1], value[2]);
                break;
            }
          }
          break;

        case "innerHTML":
        	var div = document.createElement("div");
        	div.style.position = "absolute";
        	div.innerHTML = value;
        	obj._htmlObject = div;
        	obj.type = ObjectTypes.Div;
        	this.renderer.surface.appendChild(div);
        	break;

        case "mainCamera": {
          const camera = new Camera();
          this.setupObjectFromManifest(camera, value, loadingSession);
          this.mainCamera = camera;
          this.add(camera);
          break;
        }

        case 'onmousedown':
        case 'onmouseup':
        case 'onmousemove':
        case 'onmouseover':
        case 'onmouseout':
        case 'onclick':
        case 'onmousewheel': {
            const eventName = name.slice(2); // Remove 'on' prefix
            obj.addEventListener(eventName, value);
          break
        }

          case "children":
          case "child":
          case "objects":
            for (const [name, objDefine] of Object.entries(value) as [string, any][]) {
              const child = new SceneObject();
              child.name = name;
              this.setupObjectFromManifest(child, objDefine, loadingSession, bundle);
              obj.add(child);
            }
            break

        default:
          if (!['_materials'].includes(name)) {
            console.warn('not supported manifest key', name)
          }
          break;
      }
    }
	}

	/*
	 * Finds objects and children in this scene by specified name. Returns null if nothing found.
	 */
	findObjectByName(name: string): any {
		for (const obj of this.objects) {
			if (obj.name === name) return obj;
		}

		for (const obj of this.objects) {
			const child = obj.findObjectByName(name);
			if (child) return child;
		}

		return null;
	}

	/*
	 * Find over all objects in this scene by specified type,
	 * put the result into an array.
	 */
	findObjectsByType(type?: any, options?: any): any[] {
		type = (type || ObjectTypes.GenericObject);
		options = options || {};
		let arr: any[] = [];

		for (const obj of this.objects) {
			if (obj.type === type) {
				if (typeof options.filter === "undefined" || options.filter(obj)) {
					arr.push(obj);
				}
			}
		}

		for (const obj of this.objects) {
			arr = arr.concat(obj.findObjectsByType(type, options));
		}

		return arr;
	}

	/*
	 * itearte over all children of this object,
	 * pass the object to specified iterator function.
	 */
	eachObject(iterator: any) {
		if (typeof iterator !== "function") return;

		for (const obj of this.objects) {
			iterator(obj);
		}

		for (const obj of this.objects) {
			obj.eachChild(iterator);
		}
	}

	findObjectsByCurrentMousePosition(options?: any) {
		return this.findObjectsByViewPosition(this.renderer.viewer.mouse.position, options);
	}

	findObjectsByViewPosition(p: any, options?: any): any {
		if (!this.objects?.length) return { object: null };

		const ray = this.renderer.createWorldRayFromScreenPosition(p);

		return this.findObjectsByViewRay(ray, options);
	}

	findObjectsByRay(ray: any, options?: any) {
		return this.findObjectsByWorldRay(ray, options);
	}

	findObjectsByViewRay(ray: any, options?: any) {
		//TODO: remove?
		return this.findObjectsByWorldRay(ray, options);
	}

	findObjectsByWorldRay(ray: any, options?: any): any {

		if (this.renderer.options.debugMode && this.renderer.debugger) {
			this.renderer.debugger.beforeRaycast();
		}

		options = options || {};

		const out: any = { object: null, hits: [], t: Ray.MaxDistance };

		const rayNormalizedDir = ray.dir.normalize();

		const session = {
			level: 0,
			rayNormalizedDir: rayNormalizedDir,
			rayNormalizedNegDir: rayNormalizedDir.neg(),
		};

		for (const obj of this.objects) {
			this.hitTestObjectByRay(obj, ray, out, session, options);
		}

		if (out.hits.length > 0) {
			out.hits.sort((a: any, b: any) => a.t - b.t);

			out.object = out.hits[0].object;
			out.t = out.hits[0].t;
			out.localPosition = out.hits[0].localPosition;
			out.worldPosition = out.hits[0].worldPosition;
			out.surfaceIndex = out.hits[0].surfaceIndex;
		}

		if (this.renderer.options.debugMode) {
			this.renderer.debugger.afterRaycast();
		}

		return out;
	}

	hitTestObjectByRay(obj: any, ray: any, out: any, session: any, options: any) {
		if ((!options.includeInvisible && obj.visible === false) || obj.hitable === false) {
			return false;
		}

		if (typeof session.maxLevel !== "undefined" && session.level >= session.maxLevel) {
			return false;
		}

		if (typeof options.descendantFilter === "function" && options.descendantFilter(obj) === false) {
			return false;
		}

		if (typeof obj.hitTestByRay === "function"
			&& (typeof options.filter !== "function" || options.filter(obj))) {
			if (obj.hitTestByRay.call(obj, ray, out)) {
				if (typeof out.t === "undefined") {
					out.t = 0;
				}

				out.hits.push({
					object: obj,
					mesh: out.mesh,
					t: out.t,
					worldPosition: out.worldPosition,
					localPosition: out.localPosition,
				});
			}
		}

		if (!obj.objects || !Array.isArray(obj.meshes)) {
			return false;
		}

		session.level++;

		if (Array.isArray(obj.objects)) {
			for (const child of obj.objects) {
				this.hitTestObjectByRay(child, ray, out, session, options);
			}
		}

		if ((typeof obj.conflictWithRay !== "boolean" || obj.conflictWithRay === true)
			&& (typeof options.filter !== "function" || options.filter(obj))
			&& Array.isArray(obj.meshes)) {

      session.mmat = obj._transform;
      session.nmat = obj._normalTransform;

			for (const mesh of obj.meshes) {
				const mout = mesh.hitTestByRay(ray, Ray.MaxDistance, session, options);

				if (mout) {
					out.hits.push({
						object: obj,
						mesh: mesh,
						t: mout.t,
						worldPosition: mout.worldPosition,
						localPosition: mout.localPosition,
						surfaceIndex: mout.surfaceIndex,
					});
				}
			}
		}
	}

	/*
	 * Get the bounds of this scene.
	 */
	getBounds(options?: any): any {
		let bbox = null;

		for (const object of this.objects) {
			if (typeof object.visible !== "undefined" && object.visible) {

				const objectBBox = object.getBounds(options);

				if (!options || !options.filter || options.filter(object)) {
					bbox = BoundingBox3D.findBoundingBoxOfBoundingBoxes(bbox, objectBBox);
				} else if (!bbox) {
					bbox = objectBBox;
				}
			}
		}

		if (!bbox) {
			// no objects, no bounds :-(
			return { min: new Vec3(), max: new Vec3() };
		}

		return bbox;
	}

	mousedown(scrpos: any): any {

		var out = this.findObjectsByCurrentMousePosition();

		if (out.object) {
			var obj = out.object;

			var renderer = this.renderer;

			if (renderer.debugger
				&& renderer.viewer.pressedKeys.has(Keys.Shift)
				&& renderer.viewer.pressedKeys.has(Keys.Control)) {
				renderer.debugger.showObjectInfoPanel(obj);
			}

			this.hitObject = obj;

			if (typeof obj.onmousedown === "function") {
				var ret = obj.onmousedown(out.hits[0]);

				if (typeof ret !== "undefined" && ret) {
					return ret;
				}
			}
		}

		return this.onmousedown(scrpos);
	}

	begindrag() {
		var ret = false;

		if (this.hitObject) {
			this.draggingObject = this.hitObject;

			ret = this.draggingObject.onbegindrag();
		}

		if (!ret) {
			return this.onbegindrag();
		}
	}

	drag() {
		var ret = false;

		if (this.draggingObject) {
			ret = this.draggingObject.ondrag();
		}

		if (!ret) {
			return this.ondrag();
		}
	}

	enddrag() {
		var ret = false;

		if (this.renderer.debugger) {
			this.renderer.debugger.hideObjectInfoPanel();
		}

		if (this.draggingObject) {
			ret = this.draggingObject.onenddrag();
		}

		this.hitObject = null;
		this.draggingObject = null;

		if (!ret) {
			return this.onenddrag();
		}
	}

	mousemove(pos: any): any {
		if (this.renderer.options.enableObjectHover) {

			var out = this.findObjectsByViewPosition(this.renderer.viewer.mouse.position);

			var obj = out.object;

			if (this.hoverObject != obj) {
				if (this.hoverObject) {
					this.hoverObject.onmouseout();
				}

				this.hoverObject = obj;

				if (obj) {
					this.hoverObject.onmouseenter();
				}

				this.requireUpdateFrame();
			}
		}

		return this.onmousemove(pos);
	}

	mouseup(pos: any): any {
		if (this.hitObject) {
			this.hitObject.onmouseup(pos);
		}

		this.hitObject = null;

		if (this.renderer.debugger) {
			this.renderer.debugger.hideObjectInfoPanel();
		}

		return this.onmouseup(pos);
	}

	keydown(key: any): any {
		return this.onkeydown(key);
	}

	keyup(key: any): any {
		return this.onkeyup(key);
	}

	animate(options: any, onframe?: any, onfinish?: any): any {
		if (typeof Animation !== "function") {
			return "requires animation feature but library is not included";
		}

		const animation = new Animation(this, options, onframe, onfinish);
		animation.play();
		return animation;
  }

	destroy() {
    this.destroyAllObjects();
    this.models = {};
    this.materials = {};
    this._refmaps = {};
    this._bundles = {};
    this._lightSources = new Set();
    this._activedLightSources = [];

    console.debug('scene released');
  }

  destroyAllObjects() {
    for (const obj of this.objects) {
      obj.destroy();
    }

    this.objects = [];
    this.selectedObjects.clear();
    this.hoverObject = null;
    this.hitObject = null;
    this.draggingObject = null;
  }

}

new EventDispatcher(Scene).registerEvents(
	"mousedown", "mouseup", "mousemove", "mousewheel",
	"begindrag", "drag", "enddrag",
	"keyup", "keydown",
	"objectAdd", "objectRemove", "mainCameraChange",
	"frame",
	"archiveLoaded");

///////////////////////// LoadingSession /////////////////////////

export class LoadingSession {
	rm: any;
	progressRate: number;

	resourceMeshCount: number;
	resourceTextureCount: number;
	resourceLightmapCount: number;

	downloadMeshCount: number;
	downloadTextureCount: number;
	downloadLightmapCount: number;

	downloadArchives: any[];

	// --- members injected by the EventDispatcher mixin (see bottom of file) ---
	declare on: (event: string, listener: (...args: any[]) => any) => any;
	declare addEventListener: (event: string, listener: (...args: any[]) => any) => any;
	declare removeEventListener: (event: string, listener: (...args: any[]) => any) => void;
	declare onprogress: (...args: any[]) => any;
	declare onfinish: (...args: any[]) => any;
	declare onobjectMeshDownload: (...args: any[]) => any;

	constructor(rm?: any) {
		this.rm = rm || new ResourceManager();
		this.progressRate = 0;

		this.resourceMeshCount = 0;
		this.resourceTextureCount = 0;
		this.resourceLightmapCount = 0;

		this.downloadMeshCount = 0;
		this.downloadTextureCount = 0;
		this.downloadLightmapCount = 0;

		this.downloadArchives = [];
	}

	progress() {
		var loaded = this.totalDownloads;
		var total = this.totalResources;

		this.progressRate = loaded / total;

		this.onprogress(this.progressRate);

		if (this.progressRate >= 1) {
			this.onfinish();
		}
	}

	get totalResources() {
		return this.resourceMeshCount + this.resourceTextureCount + this.resourceLightmapCount + this.resourceTotalArchiveBytes;
	}

	get totalDownloads() {
		return this.downloadMeshCount + this.downloadTextureCount + this.downloadLightmapCount + this.downloadTotalArchiveBytes;
	}

	get resourceTotalArchiveBytes() {
		var bytes = 0;
		for (var i = 0; i < this.downloadArchives.length; i++) {
			bytes += this.downloadArchives[i].dataLength;
		}
		return bytes;
	}

	get downloadTotalArchiveBytes() {
		var bytes = 0;
		for (var i = 0; i < this.downloadArchives.length; i++) {
			bytes += this.downloadArchives[i].loadingLength;
		}
		return bytes;
	}
};

new EventDispatcher(LoadingSession).registerEvents(
	"progress", "finish", "objectMeshDownload");
