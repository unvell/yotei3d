import { isPowerOf2 } from "../utility/utility";

export class Texture {
  glTexture: WebGLTexture | null = null;
  image: any;
  width = 0;
  height = 0;
  renderer: any;
  isLoading?: boolean;

  enableMipmapped: boolean;
  enableRepeat: boolean;
  linearInterpolation: boolean;
  canMipmap: boolean;
  _mipmapped: boolean;
  hdr?: boolean;
  // Upload the image bottom-row-first (UNPACK_FLIP_Y). The engine's default is
  // top-origin UVs (matching glTF), so set this for bottom-origin sources such
  // as a texture hand-assigned to a Wavefront .obj mesh.
  flipY?: boolean;

  constructor(image?: any) {
    this.glTexture = null;

    if (image) {
      this.image = image;

      if (typeof Image === "function" && image instanceof Image) {
        this.width = image.width;
        this.height = image.height;
      }
    }

    this.enableMipmapped = true;
    this.enableRepeat = true;
    this.linearInterpolation = false;
    this.canMipmap = false;
    this._mipmapped = false;
  }

  setupParameters(): void {
    const gl = this.renderer.gl;

    if (this.canMipmap) {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

      if (this._mipmapped) {
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, this.linearInterpolation ?
          gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR_MIPMAP_NEAREST);
      } else {
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      }
    } else {
      // gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, this.linearInterpolation ? gl.LINEAR : gl.NEAREST);
      if (this.linearInterpolation) {
        this.linear();
      } else {
        this.nearest();
      }
    }

    if (this._mipmapped && this.enableRepeat) {
      this.repeat();
    } else {
      this.clampToEdge();
    }

  }

  linear(): this {
    const gl = this.renderer.gl;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    return this;
  }

  nearest(): this {
    const gl = this.renderer.gl;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    return this;
  }

  mipMapLinearToLinear(): this {
    const gl = this.renderer.gl;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    return this;
  }

  repeat(): this {
    const gl = this.renderer.gl;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    return this;
  }

  clampToEdge(): this {
    const gl = this.renderer.gl;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return this;
  }

  bind(renderer: any): void {
    // allows this.image === null
    if (this.image === undefined) return;

    if (!this.renderer) {
      this.renderer = renderer;
    }

    if (typeof Image === "function" && this.image instanceof Image) {
      this.width = this.image.width;
      this.height = this.image.height;
    }

    const gl = this.renderer.gl;

    this.glTexture = gl.createTexture();

    if (this.renderer.debugger) {
      this.renderer.debugger.totalNumberOfTexturesUsed++;
    }

    gl.bindTexture(gl.TEXTURE_2D, this.glTexture);

    if (this.flipY) gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

    if (this.hdr && this.renderer.isWebGL2) {
      // floating-point source (e.g. a decoded equirectangular HDR panorama).
      // RGBA16F is texture-filterable in core WebGL2, so LINEAR sampling works
      // without extra extensions.
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, this.width, this.height, 0, gl.RGBA, gl.FLOAT, this.image);
    } else if (this.image === null || this.image instanceof Uint8Array || this.image instanceof Float32Array) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.width, this.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.image);
    } else if (typeof Image === "function" && this.image instanceof Image) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.image);
    }

    if (this.flipY) gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);

    const err = gl.getError();
    if (err) console.log(err);

    // WebGL2 lifts the power-of-two restriction: NPOT textures support full
    // mipmapping and REPEAT/MIRRORED_REPEAT wrap. On WebGL1 they don't, so
    // there we still require power-of-two dimensions.
    this.canMipmap = this.enableMipmapped
      // && this.width > 4 && this.height > 4
      && (!!this.renderer.isWebGL2
        || (isPowerOf2(this.width) && isPowerOf2(this.height)));

    if (this.canMipmap) {
      this.generateMipmap();
    }

    this.setupParameters();
  }

  generateMipmap(): void {
    const gl = this.renderer.gl;
    gl.generateMipmap(gl.TEXTURE_2D);
    this._mipmapped = true;
  }

  use(renderer: any): boolean {
    this.renderer = renderer;

    if (this.isLoading && this.image && !this.image.complete) {
      return false;
    }

    if (!this.glTexture) {
      this.bind(this.renderer);
    }

    this.renderer.gl.bindTexture(this.renderer.gl.TEXTURE_2D, this.glTexture);
    // console.info('bind texture', this.image);

    return true;
  }

  disuse(): void {
    if (this.glTexture) {
      this.renderer.gl.bindTexture(this.renderer.gl.TEXTURE_2D, null);
    }
  }

  destroy(): void {
    if (!this.renderer) return;

    const gl = this.renderer.gl;
    if (!gl) return;

    if (this.glTexture) {
      gl.deleteTexture(this.glTexture);
      this.glTexture = null;

      if (this.renderer && this.renderer.debugger) {
        this.renderer.debugger.totalNumberOfTexturesUsed--;
      }
    }
  }

  static create(width: number, height: number): Texture {
    const tex = new Texture();
    tex.image = null;
    tex.width = width;
    tex.height = height;
    return tex;
  }

  static createEmpty(): Texture {
    const tex = new Texture(new Uint8Array([255, 255, 255, 255]));
    tex.width = 1;
    tex.height = 1;
    return tex;
  }

  // Create a floating-point (RGBA16F) 2D texture from linear float pixel data —
  // e.g. a decoded HDR equirectangular panorama. WebGL2 only; on WebGL1 the
  // data is uploaded as clamped RGBA8.
  static createFloat(renderer: any, width: number, height: number, data: Float32Array): Texture {
    // RGBA16F (half-float) can only represent magnitudes up to 65504. HDR
    // panoramas that contain the sun disk routinely store values of 10^5+,
    // which overflow to +Infinity the moment they're narrowed to half-float on
    // upload. That Infinity then bleeds into NaN through cubemap mip-filtering
    // and the IBL irradiance/specular convolution, smearing the whole scene
    // with magenta/purple garbage. Clamp the source to the half-float ceiling
    // (in place — the decoded buffer is single-use) so every downstream value
    // stays finite while the sun is still represented as an extremely bright,
    // well-defined highlight.
    const HALF_FLOAT_MAX = 65504;
    for (let i = 0; i < data.length; i++) {
      if (data[i] > HALF_FLOAT_MAX) data[i] = HALF_FLOAT_MAX;
    }

    const tex = new Texture();
    tex.renderer = renderer;
    tex.image = data;
    tex.width = width;
    tex.height = height;
    tex.hdr = true;
    tex.enableMipmapped = false;
    tex.linearInterpolation = true;
    return tex;
  }
}
