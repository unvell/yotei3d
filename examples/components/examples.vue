<template>
	<header class="w-full flex flex-col items-center py-2">
		<div><img src="/img/logo.png"></img></div>
		<!-- <div>A lightweight 3D engine designed for ease of use</div> -->
    <div class="max-w-2xl mx-auto py-2 text-center">
      A lightweight WebGL-based 3D rendering engine designed with simplicity and ease of use in mind—even for users with minimal 3D programming experience.
    </div>
	</header>

  <main class="max-w-2xl mx-auto examples">
    
    <div class="separator"></div>

    <section>
      <h1>Features</h1>

      <div class="grid grid-cols-2 gap-8 feature-cards">
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
            Designed to be small and fast, Yotei3D minimizes memory usage and avoids unnecessary rendering overhead, making it ideal for web-based apps and low-power devices.
          </p>
        </div>

        <div>
          <h2>Powerful When Needed</h2>
          <p>
            While easy to start, Yotei3D also offers advanced features like realistic shadow mapping, a flexible particle system, post-processing effects, and more.
          </p>
          </div>
        </div>
    </section>

    <div class="separator"></div>

    <section id="example-app" class="">
      <h1>Examples</h1>

      <div class="grid grid-cols-1 gap-y-10 py-6">
        <div v-for="item of exampleItems" :key="item.title" 
          class="flex flex-row gap-x-2 transition-colors duration-300 cursor-pointer"
          :class="{'bg-gray-800': item.isHover, 'bg-black': !item.isHover}"
          @mouseenter.stop="item.isHover = true"
          @mouseleave.stop="item.isHover = false"
          @click="gotoExample(item)">
          <div class="w-2/5 h-48 overflow-clip">
              <img class="object-cover transition-transform duration-300" :class="{'scale-105': item.isHover}" :src="item.thumbnail">
          </div>
          <div class="w-3/5 p-4">
            <div class="font-bold pb-4 text-white text-lg">{{ item.title }}</div>
            <p class="text-sm">{{item.desc}}</p>
          </div>
        </div>
      </div>
    </section>

    <div class="separator"></div>

    <section>
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

    <div class="separator"></div>

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
    isHover: false,
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
    title: 'Showroom',
    thumbnail: '/img/examples/showroom.png',
    link: 'showroom.html',
    desc: 'Showcasing multiple objects in a room-like environment.',
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