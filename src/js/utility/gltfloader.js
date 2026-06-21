
import { Vec3, Matrix4, BoundingBox3D, Color3 } from "@jingwood/graphics-math";
import { Quaternion } from "@jingwood/graphics-math";

import { SceneObject, JointObject } from '../scene/object.js';
import { Material } from '../scene/material';
import { Mesh } from '../webgl/mesh.js';
import { Texture } from '../webgl/texture.js';
import { ResourceManager, ResourceTypes } from '../utility/resourcemanager';

function uriToBuffer(string) {
  // const regex = /^data:.+\/(.+);base64,(.*)/;

  // const matches = string.match(regex);
  // if (matches.length > 2) {
  //   // const type = matches[1];
  //   const data = matches[2];

  //   const buffer = _base64ToArrayBuffer(data);
  //   return buffer;
  // }
  if (string.startsWith('data:')) {
    const s = string.indexOf(';base64,');
    if (s > 0) {
      const data = string.substr(s + 8);
      return _base64ToArrayBuffer(data);
    }
  }
}

function _base64ToArrayBuffer(base64) {
  const binary_string = window.atob(base64);
  const len = binary_string.length;
  const array = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    array[i] = binary_string.charCodeAt(i);
  }
  return array.buffer;
}

function concatFloat32Array(first, second) {
  let result = new Float32Array(first.length + second.length);

  result.set(first);
  result.set(second, first.length);

  return result;
}

export class GLTFLoader {
  constructor(scene) {
    // optional: lets newly-decoded textures request a redraw on on-demand renderers
    this.scene = scene;
  }

  getBufferArray(accessor) {    
    const { json } = this.session;

    if (!Array.isArray(json.buffers)) return;

    const bufferView = json.bufferViews[accessor.bufferView];

    let buffer = bufferView._buffer;

    if (!buffer) {
      if (bufferView.buffer < 0 || bufferView.buffer >= json.buffers.length) {
        return;
      }

      buffer = json.buffers[bufferView.buffer];
      bufferView._buffer = buffer;
    }

    if (!buffer._data) {
      buffer._data = uriToBuffer(buffer.uri);
    }

    switch (accessor.type) {
      case 'VEC2':
        return new Float32Array(buffer._data, (accessor.byteOffset ?? 0) + (bufferView.byteOffset ?? 0), accessor.count * 2);
     
      case 'VEC3':
        return new Float32Array(buffer._data, (accessor.byteOffset ?? 0) + (bufferView.byteOffset ?? 0), accessor.count * 3);
     
      case 'VEC4':
        return new Float32Array(buffer._data, (accessor.byteOffset ?? 0) + (bufferView.byteOffset ?? 0), accessor.count * 4);
      
      case 'MAT4':
        return new Float32Array(buffer._data, (accessor.byteOffset ?? 0) + (bufferView.byteOffset ?? 0), accessor.count * 16);

      default:
      case 'SCALAR':
        switch (accessor.componentType) {
          default:
            return new Uint8Array(buffer._data, (accessor.byteOffset ?? 0) + (bufferView.byteOffset ?? 0), accessor.count || bufferView.byteLength);
        
          case 5123:
            return new Uint16Array(buffer._data, (accessor.byteOffset ?? 0) + (bufferView.byteOffset ?? 0), accessor.count);

          case 5125:
            return new Uint32Array(buffer._data, (accessor.byteOffset ?? 0) + (bufferView.byteOffset ?? 0), accessor.count);

          case 5126:
            return new Float32Array(buffer._data, (accessor.byteOffset ?? 0) + (bufferView.byteOffset ?? 0), accessor.count);
        }
    }
  }


  // Resolve a glTF textures[] index to a Texture, following its .source image.
  loadTextureByIndex(textureIndex) {
    const { json } = this.session;

    if (isNaN(textureIndex) || !Array.isArray(json.textures)
      || textureIndex < 0 || textureIndex >= json.textures.length) {
      return;
    }

    const sourceEntry = json.textures[textureIndex];
    if (isNaN(sourceEntry.source)) return;

    return this.loadTexture(sourceEntry.source);
  }

  loadTexture(sourceId) {
    const { json } = this.session;

    const imageEntry = json.images[sourceId];
    if (imageEntry._tex) {
      return imageEntry._tex;
    }

    const tex = new Texture();
    tex.isLoading = true;

    const img = new Image();

    if (typeof imageEntry.uri === "string") {
      // image referenced by URI (data: or external file relative to the model)
      if (imageEntry.uri.startsWith("data:")) {
        img.src = imageEntry.uri;
      } else if (this.basePath) {
        img.src = this.basePath.concat('/').concat(imageEntry.uri);
      } else {
        img.src = imageEntry.uri;
      }
    } else {
      // image embedded in a buffer view
      const imgData = this.getBufferArray(imageEntry);
      const blob = new Blob([imgData], { type: imageEntry.mimeType || "image/png" });
      img.src = URL.createObjectURL(blob);
    }

    img.onload = _ => {
      tex.image = img;
      tex.isLoading = false;
      if (this.scene) this.scene.requireUpdateFrame();
    };

    imageEntry._tex = tex;
    return tex;
  }

  loadMaterial(id) {
    const { json, loadedMats } = this.session;

    let mat = loadedMats[id];
    if (mat) return mat;

    mat = new Material();
    loadedMats[id] = mat;

    const matjson = json.materials[id];

    if (matjson.pbrMetallicRoughness) {
      const pbr = matjson.pbrMetallicRoughness;

      // base color factor (glTF default is opaque white)
      if (Array.isArray(pbr.baseColorFactor)) {
        mat.color = new Color3(pbr.baseColorFactor[0], pbr.baseColorFactor[1], pbr.baseColorFactor[2]);
        const a = pbr.baseColorFactor[3];
        if (typeof a === "number" && a < 1) {
          mat.transparency = 1 - a;
        }
      }

      // metallic / roughness factors (glTF default is 1.0 for both)
      mat.metallic = (typeof pbr.metallicFactor === "number") ? pbr.metallicFactor : 1.0;
      mat.roughness = (typeof pbr.roughnessFactor === "number") ? pbr.roughnessFactor : 1.0;

      // base color (albedo) texture
      if (pbr.baseColorTexture) {
        const tex = this.loadTextureByIndex(pbr.baseColorTexture.index);
        if (tex) mat.tex = tex;
      }

      // metallic-roughness texture (G = roughness, B = metallic)
      if (pbr.metallicRoughnessTexture) {
        const tex = this.loadTextureByIndex(pbr.metallicRoughnessTexture.index);
        if (tex) mat.metallicRoughnessMap = tex;
      }
    }

    // normal texture (+ scale)
    if (matjson.normalTexture) {
      const tex = this.loadTextureByIndex(matjson.normalTexture.index);
      if (tex) {
        mat.normalmap = tex;
        if (typeof matjson.normalTexture.scale === "number") {
          mat.normalIntensity = matjson.normalTexture.scale;
        }
      }
    }

    // occlusion (AO) texture — glTF packs it in the R channel
    if (matjson.occlusionTexture) {
      const tex = this.loadTextureByIndex(matjson.occlusionTexture.index);
      if (tex) mat.aoMap = tex;
    }

    // emissive factor + texture
    if (Array.isArray(matjson.emissiveFactor)) {
      mat.emissiveColor = new Color3(matjson.emissiveFactor[0],
        matjson.emissiveFactor[1], matjson.emissiveFactor[2]);
    }
    if (matjson.emissiveTexture) {
      const tex = this.loadTextureByIndex(matjson.emissiveTexture.index);
      if (tex) mat.emissiveMap = tex;
    }

    return mat;
  }

  loadMesh(gltfMesh) {
    const { json } = this.session;

    if (!Array.isArray(json.accessors)) {
      return;
    }

    const meshPrimitives = gltfMesh.primitives[0];
 
    const vertexBufferAccessor = json.accessors[meshPrimitives.attributes.POSITION];
    const normalBufferAccessor = json.accessors[meshPrimitives.attributes.NORMAL];
    const texcoord0BufferAccessor = json.accessors[meshPrimitives.attributes.TEXCOORD_0];
    const tangentBufferAccessor = json.accessors[meshPrimitives.attributes.TANGENT];
  
    const jointBufferAccessor = json.accessors[meshPrimitives.attributes.JOINTS_0];
    const jointWeightsBufferAccessor = json.accessors[meshPrimitives.attributes.WEIGHTS_0];
    const indicesBufferAccessor = json.accessors[meshPrimitives.indices];

    const mesh = new Mesh();
    mesh.vertexBuffer = this.getBufferArray(vertexBufferAccessor);
    mesh.indexBuffer = this.getBufferArray(indicesBufferAccessor);
  
    mesh.indexed = true;
    mesh.meta = {
      vertexCount: vertexBufferAccessor.count,
      indexCount: indicesBufferAccessor.count,
      stride: 0,
    };
    // mesh.composeMode = Mesh.ComposeModes.TriangleStrip;

    if (normalBufferAccessor) {
      // Attributes are repacked into a tightly-packed block buffer (positions,
      // then normals, then texcoords) and bound with stride 0, so offsets are
      // cumulative byte offsets into that packed buffer — not the source
      // glTF bufferView offsets.
      mesh.meta.normalOffset = mesh.meta.vertexCount * 12;   // after positions (vec3 f32)
      mesh.meta.normalStride = 0;
      mesh.meta.normalCount = normalBufferAccessor.count;

      if (mesh.vertexBuffer) {
        mesh.vertexBuffer = concatFloat32Array(mesh.vertexBuffer, this.getBufferArray(normalBufferAccessor));
      } else {
        mesh.vertexBuffer = normalBufferAccessor;
      }
    }

    if (texcoord0BufferAccessor) {
      const _tex0Buffer = this.getBufferArray(texcoord0BufferAccessor);

      if (_tex0Buffer) {
        // after positions (vec3) and normals (vec3), if present
        mesh.meta.texcoordOffset = mesh.meta.vertexCount * 12
          + (normalBufferAccessor ? mesh.meta.normalCount * 12 : 0);
        mesh.meta.texcoordStride = 0;
        mesh.meta.texcoordCount = texcoord0BufferAccessor.count;
        mesh.meta.uvCount = 1;

        if (mesh.vertexBuffer) {
          mesh.vertexBuffer = concatFloat32Array(mesh.vertexBuffer, _tex0Buffer);
        } else {
          mesh.vertexBuffer = texcoord0BufferAccessor;
        }
      }
    }

    // Tangent basis for normal mapping. glTF stores TANGENT as vec4 (xyz + a
    // handedness sign in w); the engine wants separate tangent/bitangent vec3
    // blocks, so we derive bitangent = cross(normal, tangent) * w per vertex.
    if (tangentBufferAccessor && normalBufferAccessor && mesh.vertexBuffer) {
      const _tangent4 = this.getBufferArray(tangentBufferAccessor);
      const _normal3 = this.getBufferArray(normalBufferAccessor);

      if (_tangent4 && _normal3) {
        const count = tangentBufferAccessor.count;
        const tangents = new Float32Array(count * 3);
        const bitangents = new Float32Array(count * 3);

        for (let i = 0; i < count; i++) {
          const tx = _tangent4[i * 4], ty = _tangent4[i * 4 + 1], tz = _tangent4[i * 4 + 2];
          const w = _tangent4[i * 4 + 3];
          const nx = _normal3[i * 3], ny = _normal3[i * 3 + 1], nz = _normal3[i * 3 + 2];

          tangents[i * 3] = tx; tangents[i * 3 + 1] = ty; tangents[i * 3 + 2] = tz;

          // bitangent = cross(normal, tangent) * handedness
          bitangents[i * 3]     = (ny * tz - nz * ty) * w;
          bitangents[i * 3 + 1] = (nz * tx - nx * tz) * w;
          bitangents[i * 3 + 2] = (nx * ty - ny * tx) * w;
        }

        // packed layout so far: positions, normals, texcoords -> then tangents, bitangents
        mesh.meta.tangentBasisCount = count;
        mesh.meta.tangentBasisOffset = mesh.meta.vertexCount * 12
          + (normalBufferAccessor ? mesh.meta.normalCount * 12 : 0)
          + (mesh.meta.texcoordCount ? mesh.meta.texcoordCount * 8 : 0);
        mesh.meta.bitangentBasisOffset = mesh.meta.tangentBasisOffset + count * 12;

        mesh.vertexBuffer = concatFloat32Array(mesh.vertexBuffer, tangents);
        mesh.vertexBuffer = concatFloat32Array(mesh.vertexBuffer, bitangents);
      }
    }

    if (jointBufferAccessor) {
      mesh.jointBuffer = this.getBufferArray(jointBufferAccessor);
      mesh.meta.jointStride = json.bufferViews[jointBufferAccessor.bufferView].byteStride ?? 0;
    }

    if (jointWeightsBufferAccessor) {
      mesh.jointWeightsBuffer = this.getBufferArray(jointWeightsBufferAccessor);
      mesh.meta.jointWeightsStride = json.bufferViews[jointWeightsBufferAccessor.bufferView].byteStride ?? 0;
    }

    // material
    if (!isNaN(meshPrimitives.material)) {
      mesh.mat = this.loadMaterial(meshPrimitives.material);
    }

    // FIXME: debug
    mesh._gltfMesh = gltfMesh;

    if (!mesh.vertexBuffer || mesh.vertexBuffer.length <= 0) {
      console.warn("mesh loaded from gltf doesn't contain vertex buffer");
    }

    return mesh;
  }

  loadSkin(skin) {
    const { json } = this.session;

    // let skinInfo = this.session.loadedSkins[skinId];
    // if (skinInfo) return skinInfo;

    const skinInfo = {
      joints: [],
      rootJoints: [],
      inverseMatrices: [],
    };
    
    if (Array.isArray(json.accessors)
      && skin.inverseBindMatrices >= 0 && skin.inverseBindMatrices < json.accessors.length) {
      const _im = this.getBufferArray(json.accessors[skin.inverseBindMatrices]);
  
      for (let i = 0; i < _im.length; i += 16) {
        const mat2 = new Matrix4();
        mat2.a1 = _im[i + 0]; mat2.b1 = _im[i + 1]; mat2.c1 = _im[i + 2]; mat2.d1 = _im[i + 3];
        mat2.a2 = _im[i + 4]; mat2.b2 = _im[i + 5]; mat2.c2 = _im[i + 6]; mat2.d2 = _im[i + 7];
        mat2.a3 = _im[i + 8]; mat2.b3 = _im[i + 9]; mat2.c3 = _im[i + 10]; mat2.d3 = _im[i + 11];
        mat2.a4 = _im[i + 12]; mat2.b4 = _im[i + 13]; mat2.c4 = _im[i + 14]; mat2.d4 = _im[i + 15];
        // mat2.transpose();
        skinInfo.inverseMatrices.push(mat2);
      }
    }

    if (Array.isArray(skin.joints)) {
      for (const jointId of skin.joints) {
        if (this.session.loadedJoints.hasOwnProperty(jointId)) {
          const jointObj = this.session.loadedJoints[jointId];
          skinInfo.joints.push(jointObj);
        }
      }
    }

    // find root joints
    for (const jointObj of skinInfo.joints) {
      let obj = jointObj;
      while (obj.parent) obj = obj.parent;
      if (!skinInfo.rootJoints.some(_j => _j === obj)) {
        skinInfo.rootJoints.push(obj);
      }
    }

    return skinInfo;
  }

  isJointNode(id) {
    const { json } = this.session;

    if (Array.isArray(json.skins)) {
      for (const skin of json.skins) {
        if (Array.isArray(skin.joints)) {
          if (skin.joints.includes(id)) return true;
        }
      }
    }

    return false;
  }

  loadNode(nodeId) {
    const { json } = this.session;
    const node = json.nodes[nodeId];
    const objTypeStack = this.session.objTypeStack;

    // const objType = objTypeStack[objTypeStack.length - 1];
    let objType;

    if (this.isJointNode(nodeId)) {
      objType = JointObject;
    } else {
      objType = SceneObject;
    }

    const obj = new objType();

    obj.name = node.name;
    obj._nodeId = nodeId;

    if (objType === JointObject) {
      this.session.loadedJoints[nodeId] = obj;
    }

    if (Array.isArray(json.meshes) && !isNaN(node.mesh)
      && node.mesh >= 0 && node.mesh < json.meshes.length) {
      const gltfMesh = json.meshes[node.mesh];
      const mesh = this.loadMesh(gltfMesh);
      obj.meshes.push(mesh);
    }

    if (Array.isArray(node.children)) {
      for (const childId of node.children) {
        const child = this.loadNode(childId);
        if (child) {
          obj.add(child);
        }
      }
    }

    if (node.translation) {
      obj.location.set(node.translation);
    }

    if (node.rotation) {
      obj._quaternion = new Quaternion(node.rotation[0], node.rotation[1],
        node.rotation[2], node.rotation[3]);
      obj.angle.set(obj._quaternion.toMatrix().extractEulerAngles());
      obj.rotationType = 'q';
    }

    if (!isNaN(node.skin)) {
      this.session.skinnedObjects.push({ obj, skinId: node.skin });
    }

    if (obj.meshes[0] && obj.meshes[0].mat) {
      obj.mat = obj.meshes[0].mat;
    }

    return obj;
  }

  reset() {
    this.session = {
      skinJointMats: {},
      loadedSkins: [],
      loadedJoints: {},
      loadedMats: {},
      objTypeStack: [SceneObject],
      skinnedObjects: [],
    };
  }

  loadFromUrl(url, callback) {
    const pathSplit = url.lastIndexOf('/');
    if (pathSplit >= 0) {
      this.basePath = url.substr(0, pathSplit);
    }

    ResourceManager.download(url, ResourceTypes.JSON, json => {
      this.load(json, obj => callback(obj));
    });
  }

  load(json, callback) {
    this.reset();
    this.session.json = json;

    if (Array.isArray(json.buffers)
      && json.buffers.some(_b => _b.uri && !_b.uri.startsWith('data:application/'))) {
      const rm = new ResourceManager();

      for (const buffer of json.buffers) {
        if (buffer.uri.startsWith('data:application/')) {
          continue;
        }

        let path;

        if ((buffer.uri.indexOf('//') < 0 || !buffer.uri.startsWith('/'))
          && this.basePath) {
          path = this.basePath.concat('/').concat(buffer.uri);
        } else {
          path = buffer.uri;
        }

        rm.add(path, ResourceTypes.Binary, _data => {
          buffer._data = _data
        });
      }

      rm.load(_ => callback(this.loadJson(json)));
    } else {
      callback(this.loadJson(json));
    }
  }

  loadJson(json) {

    const root = new SceneObject();
    root.mat = {};

    for (const scene of json.scenes) {
      for (const nodeId of scene.nodes) {
        const obj = this.loadNode(nodeId);
        if (obj) {
          root.add(obj);
        }
      }
    }

    if (Array.isArray(json.skins)) {
      for (const skin of json.skins) {
        this.session.loadedSkins.push(this.loadSkin(skin));
      }
    }

    for (const { obj, skinId } of this.session.skinnedObjects) {
      obj.skin = this.session.loadedSkins[skinId];
    }

    return root;
  }
    
}
