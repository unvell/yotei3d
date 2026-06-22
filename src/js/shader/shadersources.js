
import { SolidColorShader } from './solidcolor';
import { PanoramaShader } from './panorama';
import { StandardShader } from './standard';
import { InstancedShader } from './instanced';
import { WireframeShader } from './wireframe';
import { PointShader } from './point';
import { RainShader } from './rain';
import { GroundFogShader } from './groundfog';
import { SnowShader } from './snow';
import { CloudShader } from './cloud';
import { CloudShadowShader } from './cloudshadow';
import { ImageShader } from './image';
import { ScreenShader } from './screen';
import { ShadowMapShader } from './shadowmap';
import { AttributeShader } from './attrib';
import { SSAOShader } from './ssao';
import { IrradianceShader } from './ibl';

// import viewerVert from '../../shader/viewer.vert';
// import viewerFrag from '../../shader/viewer.frag';
import solidcolorVert from '../../shader/solidcolor.vert';
import solidcolorFrag from '../../shader/solidcolor.frag';
// import billboardVert from '../../shader/billboard.vert';
// import billboardFrag from '../../shader/billboard.frag';
// import simpleVert from '../../shader/simple.vert';
// import simpleFrag from '../../shader/simple.frag';
// import grayscaleVert from '../../shader/simple.vert';
// import grayscaleFrag from '../../shader/simple.frag';
import panoramaVert from '../../shader/panorama.vert';
import panoramaFrag from '../../shader/panorama.frag';
import standardVert from '../../shader/standard.vert';
import standardFrag from '../../shader/standard.frag';
import instancedVert from '../../shader/instanced.vert';
import instancedFrag from '../../shader/instanced.frag';
import wireframeVert from '../../shader/wireframe.vert';
import wireframeFrag from '../../shader/wireframe.frag';
import pointVert from '../../shader/points.vert';
import pointFrag from '../../shader/points.frag';
import rainVert from '../../shader/rain.vert';
import rainFrag from '../../shader/rain.frag';
import groundfogVert from '../../shader/groundfog.vert';
import groundfogFrag from '../../shader/groundfog.frag';
import snowVert from '../../shader/snow.vert';
import snowFrag from '../../shader/snow.frag';
import cloudVert from '../../shader/cloud.vert';
import cloudFrag from '../../shader/cloud.frag';
import cloudShadowVert from '../../shader/cloudshadow.vert';
import cloudShadowFrag from '../../shader/cloudshadow.frag';
import imageVert from '../../shader/image.vert';
import imageFrag from '../../shader/image.frag';
// import blurVert from '../../shader/blur.vert';
// import blurFrag from '../../shader/blur.frag';
import screenVert from '../../shader/screen.vert';
import screenFrag from '../../shader/screen.frag';
import shadowmapVert from '../../shader/shadowmap.vert';
import shadowmapFrag from '../../shader/shadowmap.frag';
import attribmapVert from '../../shader/attribmap.vert';
import attribmapFrag from '../../shader/attribmap.frag';
import ssaoVert from '../../shader/ssao.vert';
import ssaoFrag from '../../shader/ssao.frag';
import iblVert from '../../shader/ibl.vert';
import irradianceFrag from '../../shader/irradiance.frag';

export const ShaderSources = {
  // viewer: { vert: viewerVert, frag: viewerFrag, class: "ViewerShader" },
  solidcolor: { vert: solidcolorVert, frag: solidcolorFrag, class: SolidColorShader },
  // billboard: { vert: billboardVert, frag: billboardFrag, class: "BillboardShader" },
  // simple: { vert: simpleVert, frag: simpleFrag, class: "SimpleShader" },
  // grayscale: { vert: grayscaleVert, frag: grayscaleFrag, class: "GrayscaleShader" },
  // point: { vert: pointVert, frag: pointFrag, class: "PointShader" },
  panorama: { vert: panoramaVert, frag: panoramaFrag, class: PanoramaShader },
  standard: { vert: standardVert, frag: standardFrag, class: StandardShader },
  instanced: { vert: instancedVert, frag: instancedFrag, class: InstancedShader },
  wireframe: { vert: wireframeVert, frag: wireframeFrag, class: WireframeShader },
  points: { vert: pointVert, frag: pointFrag, class: PointShader },
  rain: { vert: rainVert, frag: rainFrag, class: RainShader },
  groundfog: { vert: groundfogVert, frag: groundfogFrag, class: GroundFogShader },
  snow: { vert: snowVert, frag: snowFrag, class: SnowShader },
  cloud: { vert: cloudVert, frag: cloudFrag, class: CloudShader },
  cloudshadow: { vert: cloudShadowVert, frag: cloudShadowFrag, class: CloudShadowShader },
  image: { vert: imageVert, frag: imageFrag, class: ImageShader },
  // blur: { vert: blurVert, frag: blurFrag, class: "ImageShader" },
  screen: { vert: screenVert, frag: screenFrag, class: ScreenShader },
  shadowmap: { vert: shadowmapVert, frag: shadowmapFrag, class: ShadowMapShader },
  attributemap: { vert: attribmapVert, frag: attribmapFrag, class: AttributeShader },
  ssao: { vert: ssaoVert, frag: ssaoFrag, class: SSAOShader },
  irradiance: { vert: iblVert, frag: irradianceFrag, class: IrradianceShader },

}
