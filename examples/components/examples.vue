<template>
	<header class="w-full flex flex-col items-center px-4 py-2">
		<div><img src="/img/logo.png"></img></div>
		<!-- <div>A lightweight 3D engine designed for ease of use</div> -->
    <div class="max-w-2xl mx-auto py-2 text-center">
      A lightweight WebGL-based 3D rendering engine built for both simplicity and realism—small and fast, yet capable of physically based materials, image-based lighting, and post-processing. Approachable even for developers with minimal 3D experience.
    </div>
	</header>

  <main class="examples px-4">

    <div class="separator max-w-2xl mx-auto"></div>

    <section class="max-w-2xl mx-auto">
      <h1>Features</h1>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-8 feature-cards">
        <div>
          <h2>Beginner-Friendly Design</h2>
          <p>Yotei3D allows you to start building interactive 3D scenes with just a few lines of code. Perfect for developers with limited 3D knowledge.</p>
        </div>

        <div>
          <h2>User-Centric Architecture</h2>
          <p>Built around intuitive components like Renderer, Scene, and ready-to-use objects (Cube, Sphere, etc.), plus a built-in viewer controller for camera interaction.</p>
        </div>

        <div>
          <h2>Lightweight &amp; Memory-Efficient</h2>
          <p>
            Designed to be small and fast, Yotei3D minimizes memory usage and avoids unnecessary rendering overhead, making it ideal for web-based apps and low-power devices—all without trading away visual quality.
          </p>
        </div>

        <div>
          <h2>Lightweight, Yet Realistic</h2>
          <p>
            Staying small doesn't mean cutting corners on looks. Yotei3D pushes toward photoreal results with physically based rendering, HDRI image-based lighting, real-time shadow mapping, a flexible particle system, and post-processing effects like bloom, SSAO, and volumetric god rays.
          </p>
          </div>
        </div>
    </section>

    <div class="separator max-w-2xl mx-auto"></div>

    <section id="example-app" class="max-w-6xl mx-auto">
      <h1>Examples</h1>

      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 py-6">
        <div v-for="item of exampleItems" :key="item.title"
          class="group flex flex-col rounded-lg overflow-hidden bg-gray-950/60 ring-1 ring-white/5 hover:ring-white/20 hover:bg-gray-800/80 transition-all duration-300 cursor-pointer"
          @click="gotoExample(item)">
          <div class="aspect-video overflow-hidden bg-gray-800">
            <img class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              :src="item.thumbnail" :alt="item.title" loading="lazy">
          </div>
          <div class="flex flex-col flex-1 p-4">
            <div class="font-bold pb-2 text-white text-base">{{ item.title }}</div>
            <p class="text-sm leading-relaxed text-gray-400 line-clamp-3">{{ item.desc }}</p>
          </div>
        </div>
      </div>
    </section>

    <div class="separator max-w-2xl mx-auto"></div>

    <section class="max-w-2xl mx-auto">
      <h1>Getting Started</h1>

      <pre><code class="language-js" v-pre>
import { Renderer, Scene, Shapes } from '@unvell/yotei3d';

const renderer = new Renderer();
const scene = renderer.createScene();

const cube = new Shapes.Cube();
scene.add(cube);
scene.show();
      </code></pre>
      Here is what the rendered scene looks like:
      <img class="h-96 mx-auto py-4" src="/img/examples/helloworld.png">
      <p>
        Yotei3D handles camera control, rendering setup, and interaction for you—so you can focus on building.
      </p>

    </section>

    <div class="separator max-w-2xl mx-auto"></div>

  </main>

	
	<footer class="text-center py-12">
		©2025 UNVELL Inc. All rights reserved.
	</footer>
</template>

<script setup>
import { ref } from 'vue'

const exampleItems = ref([
  {
    title: 'Hello World',
    thumbnail: '/img/examples/helloworld.png',
    link: 'helloworld.html',
    desc: 'A simple example that shows how to get started with this engine.',
  },
  {
    title: 'Animation',
    thumbnail: '/img/examples/animation.png',
    link: 'animation.html',
    desc: 'Demonstrates how to animate objects within the scene.',
  },
  {
    title: 'Model Viewer',
    thumbnail: '/img/examples/model.png',
    link: 'model.html',
    desc: 'A simple viewer to display 3D models.',
  },
  {
    title: 'PBR Materials',
    thumbnail: '/img/examples/pbr.png',
    link: 'pbr.html',
    desc: 'Physically based rendering: a metallic × roughness sphere grid and a textured glTF model under image-based lighting.',
  },
  {
    title: 'Dynamic Sky',
    thumbnail: '/img/examples/sky.jpg',
    link: 'sky.html',
    desc: 'A procedural single-scattering (Rayleigh + Mie) atmosphere baked into an HDR cubemap. The sun cycles through the day and the sky gradient, the metal sphere\'s reflection, and the ambient light all follow — physically-motivated, yet light enough to re-bake every frame.',
  },
  {
    title: 'Volumetric Clouds',
    thumbnail: '/img/examples/volumetricclouds.jpg',
    link: 'volumetricclouds.html',
    desc: 'A ray-marched volumetric cloud layer: density from procedural 3D noise, single-scattering with a sun-ward self-shadow march, composited with premultiplied alpha. Lit by the dynamic sky\'s sun, so the clouds relight as the day moves. Rendered at half resolution to stay affordable.',
  },
  {
    title: 'GPU Fluid (Smoke / Fire)',
    thumbnail: '/img/examples/fluid.jpg',
    link: 'fluid.html',
    desc: 'A real-time 3D fluid simulation run entirely on the GPU: velocity, density and temperature live in writable 3D textures (rendered into one Z-slice at a time) and are updated every frame by the classic stable-fluids steps — advection, buoyancy, vorticity confinement, and a Jacobi pressure solve for incompressibility — then ray-marched with sun self-shadowing and blackbody fire emission that feeds the bloom. Toggle smoke ↔ fire, or turn on Stir and drag to inject.',
  },
  {
    title: 'HDRI Environment',
    thumbnail: '/img/examples/hdri.jpg',
    link: 'hdri.html',
    desc: 'Equirectangular .hdr (Radiance) panorama used as a skybox and image-based lighting source — projected to a float cubemap with diffuse irradiance + specular reflections.',
  },
  {
    title: 'F-2 under HDRI',
    thumbnail: '/img/examples/f2-hdri.jpg',
    link: 'f2-hdri.html',
    desc: 'A Blender aircraft model lit entirely by a clear-sky HDRI environment map, with an afterburner plume and wingtip vapor trails. Drag to orbit, scroll to zoom.',
  },
  {
    title: 'F-2 in Flight',
    thumbnail: '/img/examples/f2-flight.jpg',
    link: 'f2-flight.html',
    desc: 'Fly the F-2 through a drifting cloud deck — A/D bank, W/S pitch, ←/→ yaw, and the whole cloud field steers with you. A live Fire-particle afterburner throbs with the burner pulse while Smoke wingtip vortices trail off the wings.',
  },
  {
    title: 'F-2 Gun Run',
    thumbnail: '/img/examples/f2-gunfire.jpg',
    link: 'f2-gunfire.html',
    desc: 'Hold the mouse to fire the F-2\'s cannon — HDR over-bright tracers streak across the sky as a dashed line through the bloom pass, while a live Fire-particle muzzle flash spits hot sparks and the airframe shudders with recoil.',
  },
  {
    title: 'Carrier Landing — P1',
    thumbnail: '/img/examples/landing-p1.jpg',
    link: 'landing-p1.html',
    desc: 'Phase 1 of a carrier-landing simulation: the USS Dwight D. Eisenhower (CVN-69) glTF auto-fitted onto a GPU Gerstner-wave ocean under a clear-sky HDRI. The model is measured and reoriented on load (deck up, hull along Z) and scaled to keep the jet-to-ship ratio realistic for later phases. The carrier steams under way leaving a foam wake; an orbit camera keeps it centred — drag to orbit, scroll to zoom, shift+drag to pan.',
  },
  {
    title: 'Carrier Landing — P2',
    thumbnail: '/img/examples/landing-p2.jpg',
    link: 'landing-p2.html',
    desc: 'Phase 2: fly the F-2 toward the carrier with a simple arcade flight model and on-screen virtual controls — a left cross-pad for pitch / yaw and a right pad for throttle (or the arrow keys + W/S). Fly too slow and the wing stalls: lift collapses, the nose drops and the jet sinks until you add power. A chase camera trails the aircraft.',
  },
  {
    title: 'WaterBottle (glTF PBR)',
    thumbnail: '/img/examples/waterbottle.png',
    link: 'waterbottle.html',
    desc: 'A textured glTF model with the full PBR map set. Drag to rotate, scroll to zoom.',
  },
  {
    title: 'Showroom',
    thumbnail: '/img/examples/showroom.png',
    link: 'showroom.html',
    desc: 'Showcasing multiple objects in a room-like environment.',
  },
  {
    title: 'Light Probes (SH)',
    thumbnail: '/img/examples/showroom.png',
    link: 'probes.html',
    desc: 'Spherical-harmonic light-probe irradiance volume (toggle to compare).',
  },
  {
    title: 'Terrain',
    thumbnail: '/img/examples/terrain.jpg',
    link: 'terrain.html',
    desc: 'Procedural heightfield terrain scattered with a low-poly tree model.',
  },
  {
    title: 'Ocean',
    thumbnail: '/img/examples/ocean.jpg',
    link: 'ocean.html',
    desc: 'GPU Gerstner-wave ocean: waves are summed on the GPU so only a single time value updates per frame. The surface reflects the skybox cubemap (reusing the IBL environment — no extra reflection pass), with a Fresnel sky/water blend and sharp sun glints. A pod of procedural dolphins leaps along the sun road throwing sparkling spray, while gulls wheel overhead.',
  },
  {
    title: 'Ocean Editor',
    thumbnail: '/img/examples/ocean.jpg',
    link: 'ocean-editor.html',
    desc: 'The Ocean stripped to water, sun and lens flare, with every Gerstner-wave parameter on a live slider panel — wave shape, ripples, colour & reflection, sun glitter, sun elevation/azimuth and the lens flare. Tune the look and copy the resulting Ocean() options straight to the clipboard.',
  },
  {
    title: 'Volumetric Light',
    thumbnail: '/img/examples/volumelight.jpg',
    link: 'volumelight.html',
    desc: 'God rays (薄明光線) cast by a city of cubes against a low sun. A 2D-overlay effect projects each tower\'s silhouette, punches it out of a warm sun disc, then radially smears the mask outward from the sun — so the light streams down the avenue and through the gaps between buildings, shadowed by the skyline. Pairs with a lens flare on the same sun. Drag to orbit; the shafts re-carve live.',
  },
  {
    title: 'Cloud God Rays',
    thumbnail: '/img/examples/cloudrays.jpg',
    link: 'cloudrays.html',
    desc: 'The same volumetric-light effect, but the occluder is a drifting cloud field instead of hard geometry. The Clouds effect feeds its clusters in as soft, fuzzy occluders, so the sun\'s shafts break through the gaps in the cloud cover and rain down — shadowed by the clouds, and re-carving live as they drift. Shows that the god-ray occlusion isn\'t limited to cubes.',
  },
  {
    title: 'Instancing',
    thumbnail: '/img/examples/instancing.png',
    link: 'instancing.html',
    desc: 'Hardware instancing: 1,936 animated cubes drawn in a single draw call via per-instance transforms (WebGL2 drawElementsInstanced).',
  },
  {
    title: 'Floor Walkthrough',
    thumbnail: '/img/examples/floor-walkthrough.png',
    link: 'floor-walkthrough.html',
    desc: 'Navigate through a 3D floor layout with free camera control.',
  },
  {
    title: 'Navmesh',
    thumbnail: '/img/examples/navmesh.png',
    link: 'navmesh.html',
    desc: 'Demonstrates navigation mesh-based pathfinding.',
  },
  {
    title: 'Particle',
    thumbnail: '/img/examples/particle.png',
    link: 'particle.html',
    desc: 'Visual effects with a simple particle system.',
  },
  {
    title: 'Rain',
    thumbnail: '/img/examples/rain.jpg',
    link: 'rain.html',
    desc: 'Real-time rainfall with slanted streak particles.',
  },
  {
    title: 'Snow',
    thumbnail: '/img/examples/snow.jpg',
    link: 'snow.html',
    desc: 'Gentle snowfall with soft fluttering flakes.',
  },
  {
    title: 'Fire & Smoke',
    thumbnail: '/img/examples/fire.jpg',
    link: 'fire.html',
    desc: 'A glowing campfire — additive fire embers feeding the bloom pass, with soft rising smoke above.',
  },
  {
    title: 'Clouds',
    thumbnail: '/img/examples/clouds.jpg',
    link: 'cloud.html',
    desc: 'Soft, billowy clouds drifting across a blue sky — with self-shading for volume and gentle shadows cast on the ground below. Includes a live tuning panel.',
  },
  {
    title: 'Panorama',
    thumbnail: '/img/examples/panorama.png',
    link: 'panorama.html',
    desc: 'Explore a 360° panoramic environment.',
  }
])

function gotoExample(item) {
  window.location.href = item.link
}

</script>