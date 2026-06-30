<script setup lang="ts">
// On-screen virtual control pads (pointer + touch), ported from landing-p2.html.
// Left cross = pitch + yaw, right = throttle. Each button holds a Controls key
// while pressed and shows an "on" state; pointerleave/cancel release it so a key
// can never get stuck.
import { reactive } from 'vue';
import type { Controls, ControlKey } from '../input/controls';

const props = defineProps<{ controls: Controls }>();

// local visual press-state per button (the Controls struct itself isn't reactive)
const on = reactive<Record<string, boolean>>({});

function press(key: ControlKey, e: PointerEvent) {
  props.controls.set(key, true);
  on[key] = true;
  e.preventDefault();
}
function release(key: ControlKey) {
  props.controls.set(key, false);
  on[key] = false;
}
</script>

<template>
  <!-- left pad: pitch + yaw cross -->
  <div id="vpad-left" class="vpad">
    <div class="vp-label">PITCH / YAW</div>
    <div class="vp-grid">
      <div
        class="vbtn vp-up"
        :class="{ on: on.up }"
        @pointerdown="press('up', $event)"
        @pointerup="release('up')"
        @pointercancel="release('up')"
        @pointerleave="release('up')"
      >
        ↑<span class="vb-sub">PUSH DN</span>
      </div>
      <div
        class="vbtn vp-left"
        :class="{ on: on.left }"
        @pointerdown="press('left', $event)"
        @pointerup="release('left')"
        @pointercancel="release('left')"
        @pointerleave="release('left')"
      >
        ←<span class="vb-sub">YAW L</span>
      </div>
      <div
        class="vbtn vp-right"
        :class="{ on: on.right }"
        @pointerdown="press('right', $event)"
        @pointerup="release('right')"
        @pointercancel="release('right')"
        @pointerleave="release('right')"
      >
        →<span class="vb-sub">YAW R</span>
      </div>
      <div
        class="vbtn vp-down"
        :class="{ on: on.down }"
        @pointerdown="press('down', $event)"
        @pointerup="release('down')"
        @pointercancel="release('down')"
        @pointerleave="release('down')"
      >
        ↓<span class="vb-sub">PULL UP</span>
      </div>
    </div>
  </div>

  <!-- right pad: throttle -->
  <div id="vpad-right" class="vpad">
    <div class="vp-label">THROTTLE</div>
    <div class="vp-grid">
      <div
        class="vbtn"
        :class="{ on: on.thrUp }"
        @pointerdown="press('thrUp', $event)"
        @pointerup="release('thrUp')"
        @pointercancel="release('thrUp')"
        @pointerleave="release('thrUp')"
      >
        ▲<span class="vb-sub">THR +</span>
      </div>
      <div
        class="vbtn"
        :class="{ on: on.thrDown }"
        @pointerdown="press('thrDown', $event)"
        @pointerup="release('thrDown')"
        @pointercancel="release('thrDown')"
        @pointerleave="release('thrDown')"
      >
        ▼<span class="vb-sub">THR −</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.vpad {
  position: fixed;
  bottom: 20px;
  z-index: 25;
  user-select: none;
  touch-action: none;
  -webkit-user-select: none;
}
#vpad-left {
  left: 24px;
}
#vpad-right {
  right: 24px;
}
.vp-grid {
  display: grid;
  gap: 8px;
}
#vpad-left .vp-grid {
  grid-template-columns: repeat(3, 56px);
  grid-template-rows: repeat(3, 56px);
}
#vpad-right .vp-grid {
  grid-template-columns: 64px;
  grid-template-rows: repeat(2, 56px);
}
.vbtn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  background: rgba(22, 32, 46, 0.55);
  color: #dceaff;
  border: 1px solid rgba(150, 190, 255, 0.25);
  backdrop-filter: blur(3px);
  font: 600 18px/1 system-ui, sans-serif;
  cursor: pointer;
  transition: background 0.08s, transform 0.08s;
  text-align: center;
}
.vb-sub {
  font: 600 8.5px/1.2 system-ui, sans-serif;
  opacity: 0.7;
  margin-top: 3px;
  letter-spacing: 0.02em;
}
.vbtn:active,
.vbtn.on {
  background: rgba(90, 150, 255, 0.6);
  border-color: rgba(180, 210, 255, 0.7);
  transform: translateY(1px);
}
.vp-up {
  grid-column: 2;
  grid-row: 1;
}
.vp-down {
  grid-column: 2;
  grid-row: 3;
}
.vp-left {
  grid-column: 1;
  grid-row: 2;
}
.vp-right {
  grid-column: 3;
  grid-row: 2;
}
.vp-label {
  color: #bcd0ea;
  font: 600 11px/1 system-ui, sans-serif;
  text-align: center;
  margin-bottom: 7px;
  opacity: 0.8;
  text-shadow: 0 1px 2px #000;
}
#vpad-right .vbtn {
  font-size: 22px;
}
</style>
