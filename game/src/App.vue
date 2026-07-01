<script setup lang="ts">
import { onMounted, onBeforeUnmount, reactive } from 'vue';
import Hud from './ui/Hud.vue';
import VirtualPads from './ui/VirtualPads.vue';
import { Game } from './core/Game';
import { Controls } from './input/controls';
import { createTelemetry } from './core/telemetry';

// Reactive HUD data + the shared control struct. The Game writes telemetry each
// frame; the pads + keyboard write controls.
const telemetry = reactive(createTelemetry());
const controls = new Controls();

let game: Game | null = null;

onMounted(() => {
  const container = document.getElementById('canvas-container')!;
  game = new Game(container, controls, telemetry);
  game.start();
});

onBeforeUnmount(() => {
  game?.dispose();
  game = null;
});
</script>

<template>
  <!-- 3D viewport — the engine mounts its canvases into this by id -->
  <div id="canvas-container" :style="{ position: 'fixed', inset: '0' }"></div>

  <!-- top info bar -->
  <header class="topbar">
    <div class="title">Carrier Landing — Yotei3D</div>
    <div class="hint">
      Land on the deck: hold the nose up, ease throttle to sink · ←/→ &amp; A/D yaw · ↑/↓ pitch
      (↑ down / ↓ up) · W/S throttle (S past idle = airbrake) · R reset · drag look · scroll zoom
    </div>
  </header>

  <!-- DOM overlay HUD -->
  <Hud :telemetry="telemetry" />
  <VirtualPads :controls="controls" :telemetry="telemetry" />
</template>

<style scoped>
.topbar {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 20;
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 8px 16px;
  box-sizing: border-box;
  background: rgba(31, 41, 55, 0.4);
  color: #fff;
  font-size: 13px;
}
.title {
  font-weight: 600;
}
.hint {
  opacity: 0.85;
  text-align: right;
}
</style>
