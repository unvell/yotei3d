import { Matrix4 } from "@jingwood/graphics-math";
import { Shader } from '../webgl/shader';

function generateSSAOSamples(sampleCount = 16) {
  const samples = [];

  for (let i = 0; i < sampleCount; i++) {
    let sample = [
      Math.random() * 2.0 - 1.0, // x: -1 to 1
      Math.random() * 2.0 - 1.0, // y: -1 to 1
      Math.random()              // z: 0 to 1 → 半球
    ];

    // 単位ベクトルに正規化
    const len = Math.sqrt(sample[0] ** 2 + sample[1] ** 2 + sample[2] ** 2);
    sample = sample.map(v => v / len);

    // サンプルのスケール（中心に密度を集中させる）
    const scale = i / sampleCount;
    const scaleFactor = 0.1 + 0.9 * scale * scale;
    sample = sample.map(v => v * scaleFactor);

    samples.push(sample);
  }

  return samples;
}

export class SSAOShader extends Shader {
	constructor(renderer, vertShaderSrc, fragShaderSrc) {
		super(renderer, vertShaderSrc, fragShaderSrc);

		this.use();

    this.depthMap = null;
    this.normalMap = null;

		this.vertexPositionAttribute = this.findAttribute("vertexPosition");
		this.vertexTexcoordAttribute = this.findAttribute("vertexTexcoord");

		this.projectViewMatrixUniform = this.bindUniform("projectViewMatrix", "mat4");
		this.uProjectionUniform = this.bindUniform("uProjection", "mat4");
		this.uInvProjectionUniform = this.bindUniform("uInvProjection", "mat4");

		this.depthMapUniform = this.bindUniform("depthMap", "tex", 0);
		this.normalMapUniform = this.bindUniform("normalMap", "tex", 1);

		this.uSamplesUniform = this.bindUniformArray("uSamples", "vec3", 16);
		this.radiusUniform = this.bindUniform("radius", "float");
		this.biasUniform = this.bindUniform("bias", "float");

    this.sampleVectors = generateSSAOSamples(16);
    this.projectionMatrix = new Matrix4().ortho(-1, 1, -1, 1, -1, 1);
	}

  beginScene(scene) {
		super.beginScene(scene);

    for (let i = 0; i < this.sampleVectors.length; i++) {
      this.uSamplesUniform[i].set(this.sampleVectors[i]);
    }
		this.projectViewMatrixUniform.set(this.projectionMatrix);

    this.depthMapUniform.set(this.depthMap);
    this.normalMapUniform.set(this.normalMap);

		this.radiusUniform.set(this.radius || 0.5);
		this.biasUniform.set(this.bias || 0.025);

    const projectionMatrix = this.renderer.viewMatrix.mul(this.renderer.cameraMatrix).mul(this.renderer.projectionMatrix)

		this.uProjectionUniform.set(projectionMatrix);
    const invProj = projectionMatrix.inverse();
    this.uInvProjectionUniform.set(invProj);

    this.gl.depthMask(false);
		this.gl.enable(this.gl.BLEND);
  }

  beginObject(obj) {
    super.beginObject(obj)
  }

  beginMesh(mesh) {
		super.beginMesh(mesh);
  }

	endMesh(mesh) {
		super.endMesh(mesh);
	}

  endScene(scene) {
    super.endScene(scene);

    this.gl.depthMask(true);
		this.gl.disable(this.gl.BLEND);

		this.depthMapUniform.unset();
		this.normalMapUniform.unset();
  }

}