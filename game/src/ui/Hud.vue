<script setup lang="ts">
// Airspeed bar + readout (bottom-centre). Ported from landing-p2.html's #spd-hud:
// the fill shows speed, a yellow marker is the stall boundary, and the fill turns
// green → amber → red approaching / below stall.
import { computed } from 'vue';
import type { Telemetry } from '../core/telemetry';
import { HUD_SPEED_SCALE } from '../aircraft/tunables';
import { stallSpeed } from '../aircraft/aero';

const props = defineProps<{ telemetry: Telemetry }>();

// the bar shows speed/energy; its colour now comes from AoA (stall is AoA-based).
const fillPct = computed(() =>
  Math.max(0, Math.min(100, (props.telemetry.speed / HUD_SPEED_SCALE) * 100)),
);
// yellow marker = the level-flight stall speed (slowest speed that can hold weight)
const markPct = (stallSpeed() / HUD_SPEED_SCALE) * 100;
const stateClass = computed(() => ({
  stall: props.telemetry.stalled,
  caution: !props.telemetry.stalled && props.telemetry.stallT > 0,
}));
</script>

<template>
  <div id="spd-hud" :class="stateClass">
    <div class="sb-track">
      <div class="sb-fill" :style="{ width: fillPct + '%' }"></div>
      <div class="sb-mark" :style="{ left: markPct + '%' }"></div>
    </div>
    <div class="sb-read">
      <span>SPD <b>{{ telemetry.speedKmh.toFixed(0) }}</b> km/h</span>
      <span>ALT <b>{{ telemetry.alt.toFixed(0) }}</b> u</span>
      <span>AoA <b>{{ telemetry.aoa.toFixed(1) }}</b>°</span>
      <span>THR <b>{{ telemetry.throttlePct.toFixed(0) }}</b>%</span>
    </div>
    <div class="sb-warn">⚠ STALL — ADD POWER</div>
  </div>
</template>

<style scoped>
#spd-hud {
  position: fixed;
  left: 50%;
  bottom: 20px;
  transform: translateX(-50%);
  z-index: 24;
  user-select: none;
  text-align: center;
  font: 600 12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
  color: #eaf2ff;
}
.sb-track {
  position: relative;
  width: 340px;
  height: 15px;
  border-radius: 8px;
  background: rgba(12, 18, 28, 0.62);
  border: 1px solid rgba(150, 190, 255, 0.28);
  overflow: hidden;
  backdrop-filter: blur(3px);
}
.sb-fill {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 0%;
  background: #46d27a;
  transition: width 0.08s linear, background 0.2s;
}
#spd-hud.caution .sb-fill {
  background: #ffb43a;
}
#spd-hud.stall .sb-fill {
  background: #ff4f47;
}
.sb-mark {
  position: absolute;
  top: -3px;
  bottom: -3px;
  width: 2px;
  background: #ffe24a;
  box-shadow: 0 0 5px rgba(0, 0, 0, 0.85);
}
.sb-read {
  margin-top: 6px;
  display: flex;
  gap: 20px;
  justify-content: center;
  text-shadow: 0 1px 2px #000;
}
.sb-read b {
  font-variant-numeric: tabular-nums;
  color: #fff;
}
.sb-warn {
  margin-top: 3px;
  height: 13px;
  color: #ff5a52;
  font-weight: 700;
  letter-spacing: 0.1em;
  visibility: hidden;
}
#spd-hud.stall .sb-warn {
  visibility: visible;
  animation: sbblink 0.5s steps(1) infinite;
}
@keyframes sbblink {
  50% {
    opacity: 0.25;
  }
}
</style>
