
import { Shader } from '../webgl/shader.js';

export class AttributeShader extends Shader {
	constructor(renderer, vertShaderSrc, fragShaderSrc) {
		super(renderer, vertShaderSrc, fragShaderSrc);

		this.vertexPositionAttribute = this.findAttribute('vertexPosition');
    this.vertexNormalAttribute = this.findAttribute("vertexNormal");

		this.modelViewMatrixUniform = this.bindUniform("modelViewMatrix", "mat4");
		this.projectionMatrixUniform = this.bindUniform("projectionMatrix", "mat4");
		this.normalMatrixUniform = this.bindUniform("normalMatrix", "mat4");
    this.typeUniform = this.bindUniform("type", "int");
    this.uNearUniform = this.bindUniform("uNear", "float");
    this.uFarUniform = this.bindUniform("uFar", "float");

    this.type = 0;
	}

	beginScene(scene) {
    this.typeUniform.set(this.type);
    this.uNearUniform.set(this.renderer.options.perspective.near);
    this.uFarUniform.set(this.renderer.options.perspective.far);
    this.projectionMatrixUniform.set(this.renderer.projectionMatrix);
	}

	beginObject(obj) {
    super.beginObject(obj);

    const modelViewMatrix = obj._transform.mul(this.renderer.viewMatrix).mul(this.renderer.cameraMatrix);
    this.modelViewMatrixUniform.set(modelViewMatrix);

    const normalMatrix = modelViewMatrix.inverse().transpose();
    this.normalMatrixUniform.set(normalMatrix);
	}
}
