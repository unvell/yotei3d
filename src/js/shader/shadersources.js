
import { SolidColorShader } from './solidcolor';
import { PanoramaShader } from './panorama';
import { StandardShader } from './standard';
import { InstancedShader } from './instanced';
import { WireframeShader } from './wireframe';
import { PointShader } from './point';
import { RainShader } from './rain';
import { GroundFogShader } from './groundfog';
import { SnowShader } from './snow';
import { FireShader } from './fire';
import { SmokeShader } from './smoke';
import { CloudShader } from './cloud';
import { CloudShadowShader } from './cloudshadow';
import { CloudMapShader } from './cloudmap';
import { CloudGodrayShader } from './cloudgodray';
import { WaterShader } from './water';
import { ImageShader } from './image';
import { ScreenShader } from './screen';
import { ShadowMapShader } from './shadowmap';
import { AttributeShader } from './attrib';
import { SSAOShader } from './ssao';
import { IrradianceShader } from './ibl';
import { PrefilterSpecularShader } from './prefilter';
import { EquirectShader } from './equirect';
import { AtmosphereSkyShader } from './atmosky';
import { VolumetricCloudShader } from './volcloud';
import { VolumetricCloudCompositeShader } from './volcloudcomposite';
import { FluidShader, FluidRaymarchShader } from './fluidshader';

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
import fireVert from '../../shader/fire.vert';
import fireFrag from '../../shader/fire.frag';
import smokeVert from '../../shader/smoke.vert';
import smokeFrag from '../../shader/smoke.frag';
import cloudVert from '../../shader/cloud.vert';
import cloudFrag from '../../shader/cloud.frag';
import cloudShadowVert from '../../shader/cloudshadow.vert';
import cloudShadowFrag from '../../shader/cloudshadow.frag';
import cloudMapVert from '../../shader/cloudmap.vert';
import cloudMapFrag from '../../shader/cloudmap.frag';
import cloudGodrayVert from '../../shader/cloudgodray.vert';
import cloudGodrayFrag from '../../shader/cloudgodray.frag';
import waterVert from '../../shader/water.vert';
import waterFrag from '../../shader/water.frag';
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
import prefilterSpecFrag from '../../shader/prefilterspec.frag';
import equirectFrag from '../../shader/equirect.frag';
import atmoskyFrag from '../../shader/atmosky.frag';
import volcloudVert from '../../shader/volcloud.vert';
import volcloudFrag from '../../shader/volcloud.frag';
import volcloudCompositeVert from '../../shader/volcloudcomposite.vert';
import volcloudCompositeFrag from '../../shader/volcloudcomposite.frag';
import fluidVert from '../../shader/fluid.vert';
import fluidAdvectFrag from '../../shader/fluid_advect.frag';
import fluidForceFrag from '../../shader/fluid_force.frag';
import fluidEmitFrag from '../../shader/fluid_emit.frag';
import fluidDivergenceFrag from '../../shader/fluid_divergence.frag';
import fluidJacobiFrag from '../../shader/fluid_jacobi.frag';
import fluidProjectFrag from '../../shader/fluid_project.frag';
import fluidCurlFrag from '../../shader/fluid_curl.frag';
import fluidVorticityFrag from '../../shader/fluid_vorticity.frag';
import fluidRaymarchVert from '../../shader/fluid_raymarch.vert';
import fluidRaymarchFrag from '../../shader/fluid_raymarch.frag';

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
  fire: { vert: fireVert, frag: fireFrag, class: FireShader },
  smoke: { vert: smokeVert, frag: smokeFrag, class: SmokeShader },
  cloud: { vert: cloudVert, frag: cloudFrag, class: CloudShader },
  cloudshadow: { vert: cloudShadowVert, frag: cloudShadowFrag, class: CloudShadowShader },
  cloudmap: { vert: cloudMapVert, frag: cloudMapFrag, class: CloudMapShader },
  cloudgodray: { vert: cloudGodrayVert, frag: cloudGodrayFrag, class: CloudGodrayShader },
  water: { vert: waterVert, frag: waterFrag, class: WaterShader },
  image: { vert: imageVert, frag: imageFrag, class: ImageShader },
  // blur: { vert: blurVert, frag: blurFrag, class: "ImageShader" },
  screen: { vert: screenVert, frag: screenFrag, class: ScreenShader },
  shadowmap: { vert: shadowmapVert, frag: shadowmapFrag, class: ShadowMapShader },
  attributemap: { vert: attribmapVert, frag: attribmapFrag, class: AttributeShader },
  ssao: { vert: ssaoVert, frag: ssaoFrag, class: SSAOShader },
  irradiance: { vert: iblVert, frag: irradianceFrag, class: IrradianceShader },
  prefilterspec: { vert: iblVert, frag: prefilterSpecFrag, class: PrefilterSpecularShader },
  equirect: { vert: iblVert, frag: equirectFrag, class: EquirectShader },
  atmosky: { vert: iblVert, frag: atmoskyFrag, class: AtmosphereSkyShader },
  volcloud: { vert: volcloudVert, frag: volcloudFrag, class: VolumetricCloudShader },
  volcloudcomposite: { vert: volcloudCompositeVert, frag: volcloudCompositeFrag, class: VolumetricCloudCompositeShader },

  // GPU fluid (smoke/fire) simulation passes. The six sim kernels share one
  // wrapper class and vertex stage; the raymarch renders the density volume,
  // and the composite reuses the cloud's premultiplied-blend pass.
  fluid_advect: { vert: fluidVert, frag: fluidAdvectFrag, class: FluidShader },
  fluid_force: { vert: fluidVert, frag: fluidForceFrag, class: FluidShader },
  fluid_emit: { vert: fluidVert, frag: fluidEmitFrag, class: FluidShader },
  fluid_divergence: { vert: fluidVert, frag: fluidDivergenceFrag, class: FluidShader },
  fluid_jacobi: { vert: fluidVert, frag: fluidJacobiFrag, class: FluidShader },
  fluid_project: { vert: fluidVert, frag: fluidProjectFrag, class: FluidShader },
  fluid_curl: { vert: fluidVert, frag: fluidCurlFrag, class: FluidShader },
  fluid_vorticity: { vert: fluidVert, frag: fluidVorticityFrag, class: FluidShader },
  fluid_raymarch: { vert: fluidRaymarchVert, frag: fluidRaymarchFrag, class: FluidRaymarchShader },
  fluidcomposite: { vert: volcloudCompositeVert, frag: volcloudCompositeFrag, class: VolumetricCloudCompositeShader },

}
