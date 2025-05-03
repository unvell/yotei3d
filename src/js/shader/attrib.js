
import { Shader } from '../webgl/shader.js';

export class AttributeShader extends Shader {
	constructor(renderer, vertShaderSrc, fragShaderSrc) {
		super(renderer, vertShaderSrc, fragShaderSrc);

		this.vertexPositionAttribute = this.findAttribute('vertexPosition');
    this.vertexNormalAttribute = this.findAttribute("vertexNormal");
    
		this.projectionViewMatrixUniform = this.bindUniform("projectionViewMatrix", "mat4");
		this.normalMatrixUniform = this.bindUniform("normalMatrix", "mat4");
    this.typeUniform = this.bindUniform("type", "int");
    
    this.type = 0;
	}

	beginScene(scene) {
    this.typeUniform.set(this.type);
	}

	beginObject(obj) {
    super.beginObject(obj);

    const modelViewMatrix = obj._transform.mul(this.renderer.viewMatrix).mul(this.renderer.cameraMatrix);
		this.projectionViewMatrixUniform.set(modelViewMatrix.mul(this.renderer.projectionMatrix));

    const normalMatrix = modelViewMatrix.inverse().transpose()
    this.normalMatrixUniform.set(normalMatrix);
	}
}