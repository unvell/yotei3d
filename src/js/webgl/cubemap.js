
import { BoundingBox3D } from "@jingwood/graphics-math";
import { EventDispatcher, isPowerOf2, ResourceManager, ResourceTypes, Shapes } from '@';

export class CubeMap {
  constructor(renderer, images) {
    this.glTexture = null;
    this.enableMipmap = true;
    this.mipmapped = false;
    this.loaded = false;

    if (renderer) {
      this.renderer = renderer;
      this.gl = renderer.gl;
    }

    if (Array.isArray(images)) {
      this.images = images;
    } else {
      this.images = [];
    }
  } 
   
  getLoadingFaces() {
    const gl = this.gl;

    if (!CubeMap.LoadingFaces) {
      CubeMap.LoadingFaces = [
        gl.TEXTURE_CUBE_MAP_POSITIVE_X,
        gl.TEXTURE_CUBE_MAP_NEGATIVE_X,
        gl.TEXTURE_CUBE_MAP_POSITIVE_Y,
        gl.TEXTURE_CUBE_MAP_NEGATIVE_Y,
        gl.TEXTURE_CUBE_MAP_POSITIVE_Z,
        gl.TEXTURE_CUBE_MAP_NEGATIVE_Z,
      ];
    }
  
    return CubeMap.LoadingFaces;
  }

  create(width, height, defaultData) {
    if (!this.renderer) {
      throw "renderer must be specified before create empty cubemap";
    }

    this.width = width;
    this.height = height;

    this.use();
    
    const gl = this.gl;
    const faces = this.getLoadingFaces();

    this.setParameters();
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    
    for (let i = 0; i < faces.length; i++) {
      gl.texImage2D(faces[i], 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, defaultData);
    }

    this.disuse();
  }

  createEmpty() {
    this.create(1, 1, new Uint8Array([255, 255, 255, 255]));
    // this.create(1, 1, new Uint8Array([0, 0, 0, 0]));
  }

  setParameters() {
    const gl = this.gl;

    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    if (this.mipmappable) {
      gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_NEAREST);
    } else {
      gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    }

    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    //gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);

    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  }

  setFaceImage(face, image) {
    this.use();

    const gl = this.gl;
    const faces = this.getLoadingFaces();
  
    gl.texImage2D(faces[face], 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

    if (this.mipmappable) {
      this.mipmappable = isPowerOf2(image.width) && isPowerOf2(image.height);
    }
  
    this.setParameters();
  
    this.disuse();
  }

  setImages(images) {
    if (!Array.isArray(images)) {
      throw "missing arguments: images";
    }

    this.images = images;

    this.bindTextures();
  }

  bind(renderer) {
    if (renderer) {
      this.renderer = renderer;
      this.gl = renderer.gl;
    }  

    this.glTexture = this.gl.createTexture()
    
    if (this.renderer && this.renderer.debugger) {
      this.renderer.debugger.totalNumberOfTexturesUsed += 6;
    }

    if (this.images.length > 6) {
      this.bindTextures(this.images);
    }
  }

  unbind() {
    if (this.glTexture) {
      this.gl.deleteTexture(this.glTexture);
      this.glTexture = null;

      if (this.renderer && this.renderer.debugger) {
        this.renderer.debugger.totalNumberOfTexturesUsed -= 6;
      }
    }
  }

  bindTextures() {
    this.use();

    if (!this.glTexture) {
      throw "cubemap must be bound before set texture images";
    }

    const gl = this.gl;
    const faces = this.getLoadingFaces();

    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);

    this.mipmappable = this.enableMipmap;
    this.mipmapped = false;

    for (var i = 0; i < faces.length; i++) {
      const image = this.images[i];
      gl.texImage2D(faces[i], 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

      if (this.mipmappable) {
        this.mipmappable = isPowerOf2(image.width) && isPowerOf2(image.height);
      }
    }
  
    this.setParameters();
  
    if (this.mipmappable) {
      gl.generateMipmap(gl.TEXTURE_CUBE_MAP);
      this.mipmapped = true;
    }

    this.disuse();

    this.loaded = true;
  }

  setRawData(stream) {
    this.use();

    if (!this.glTexture) {
      throw "cubemap must be bound before set raw data";
    }

    var header = new Int32Array(stream);
    var tag = header[0];

    if (tag !== 0x70616d72) {
      throw "illegal raw data format";
    }

    var headerLen = header[1];
    var res = header[3];
    const resX = res >> 16, resY = res & 0xffff;

    const bboxBuffer = new Float32Array(stream, 16, 24);
    this.bbox = new BoundingBox3D(bboxBuffer[0], bboxBuffer[1], bboxBuffer[2],
      bboxBuffer[3], bboxBuffer[4], bboxBuffer[5]);

    var faceDataLen = resX * resY * 3;

    var gl = this.gl;
    var faces = this.getLoadingFaces();

    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);

    this.mipmappable = this.enableMipmap && isPowerOf2(resX) && isPowerOf2(resY);

    for (var i = 0; i < faces.length; i++) {
      gl.texImage2D(faces[i], 0, gl.RGB, resX, resY, 0, gl.RGB, gl.UNSIGNED_BYTE,
        new Uint8Array(stream, (headerLen) + faceDataLen * i));
    }
  
    this.setParameters();
  
    if (this.mipmappable) {
      gl.generateMipmap(gl.TEXTURE_CUBE_MAP);
      this.mipmapped = true;
    }

    this.disuse();

    this.loaded = true;
  }
 
  use(renderer) {
    if (this.glTexture === null) {
      this.bind(renderer);
    }
    
    this.gl.bindTexture(this.gl.TEXTURE_CUBE_MAP, this.glTexture);
  }

  disuse() {
    this.gl.bindTexture(this.gl.TEXTURE_CUBE_MAP, null);
  }
};
 
CubeMap.LoadingFaces = null;

CubeMap.Faces = {
  Right: 0,  //+x
  Left: 1,   //-x
  Top: 2,    //+y
  Bottom: 3, //-y
  Front: 4,  //+z
  Back: 5,   //-z
};

/////////////////// ImageCubeBox ///////////////////

export class ImageCubeBox {
  constructor(renderer, imageUrls) {
    if (!renderer) {
      throw new Error("renderer cannot be null or undefined");
    }

    this.loaded = false;
    this.renderer = renderer;

    if (Array.isArray(imageUrls)) {
      this.createFromImageUrls(renderer, imageUrls);
    }
  }

  createFromImageUrls(renderer, imageUrls) {
    if (!Array.isArray(imageUrls) || imageUrls.length < 6) {
      console.warn("ImageCubeBox: not enough number of images to create cubebox, need six image URLs.");
      return;
    }

    this.cubemap = new CubeMap(renderer);
  
    var rm = new ResourceManager();

    rm.add([
      imageUrls[0], ResourceTypes.Image,
      imageUrls[1], ResourceTypes.Image,
      imageUrls[2], ResourceTypes.Image,
      imageUrls[3], ResourceTypes.Image,
      imageUrls[4], ResourceTypes.Image,
      imageUrls[5], ResourceTypes.Image,
    ]);

    rm.load(_ => {
      this.cubemap.setImages([
        rm.get(imageUrls[0]),
        rm.get(imageUrls[1]),
        rm.get(imageUrls[2]),
        rm.get(imageUrls[3]),
        rm.get(imageUrls[4]),
        rm.get(imageUrls[5]),
      ]);
      this.initFinished();
    });
  }

  initFinished() {
    this.loaded = true;
    this.onload();
  }
};

new EventDispatcher(ImageCubeBox).registerEvents("load");

/////////////////// SkyBox ///////////////////

export class SkyBox extends ImageCubeBox {
  constructor(renderer, imageUrls, size = 500) {
    super(renderer, imageUrls);

    this.cube = new Shapes.Cube();
    this.cube.location.set(0, 2, 0);
    this.cube.scale.set(size, size, size);
    this.cube.mat = {};
  }

  initFinished() {
    if (this.cube.mat) {
      this.cube.mat.tex = this.cubemap;
    } else {
      this.cube.mat = { tex: this.cubemap };
    }

    if (this.renderer && this.renderer.currentScene) {
      this.renderer.currentScene.requireUpdateFrame();
    }
    super.initFinished();
  }

  get mat() {
    return this.cube.mat;
  }

  set mat(v) {
    this.cube.mat = v;
  }

  get visible() {
    return this.cube.visible;
  }

  set visible(v) {
    if (this.cube) {
      if (this.cube.visible !== v) {
        this.cube.visible = v;

        if (this.cube.scene) {
          this.cube.scene.requireUpdateFrame();
        }
      }
    }
  }

};
