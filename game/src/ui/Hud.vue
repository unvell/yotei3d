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

// Throttle axis is −100..+100: positive = engine thrust, negative = speedbrake.
const powerLabel = computed(() => (props.telemetry.throttlePct < 0 ? 'BRK' : 'THR'));
const powerValue = computed(() => Math.abs(props.telemetry.throttlePct).toFixed(0));
const braking = computed(() => props.telemetry.throttlePct < 0);

// Sink rate (V/S): show + descending / − climbing; caution once it's steep on
// the approach (the deck won't accept a slam — see LandingZone.MAX_SINK).
const sinkText = computed(() => {
  const s = props.telemetry.sinkRate;
  return (s >= 0 ? '↓' : '↑') + Math.abs(s).toFixed(1);
});
const sinkHot = computed(() => props.telemetry.sinkRate > 12);

// Landing outcome banner (shown once trapped/crashed).
const outcome = computed(() => props.telemetry.phase); // flying | arrested | crashed
const showBanner = computed(() => outcome.value !== 'flying');
const crashed = computed(() => outcome.value === 'crashed');
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
      <span :class="{ hot: sinkHot }">V/S <b>{{ sinkText }}</b></span>
      <span>AoA <b>{{ telemetry.aoa.toFixed(1) }}</b>°</span>
      <span :class="{ brk: braking }">{{ powerLabel }} <b>{{ powerValue }}</b>%</span>
    </div>
    <div class="sb-warn">⚠ STALL — ADD POWER</div>
  </div>

  <!-- landing outcome banner -->
  <div v-if="showBanner" class="land-banner" :class="{ crash: crashed }">
    <div class="lb-title">{{ crashed ? 'CRASH' : 'TRAP! LANDED' }}</div>
    <div class="lb-msg">{{ telemetry.landingMsg }}</div>
    <div class="lb-hint">Press R to reset</div>
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
.sb-read .brk {
  color: #6fd0ff;
}
.sb-read .brk b {
  color: #aee7ff;
}
.sb-read .hot {
  color: #ff8a5a;
}
.sb-read .hot b {
  color: #ffb08a;
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

/* landing outcome banner (centred) */
.land-banner {
  position: fixed;
  left: 50%;
  top: 34%;
  transform: translate(-50%, -50%);
  z-index: 30;
  text-align: center;
  padding: 18px 40px;
  border-radius: 14px;
  background: rgba(12, 26, 18, 0.72);
  border: 1px solid rgba(90, 230, 150, 0.6);
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  color: #eafff2;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  animation: lbpop 0.25s ease-out;
}
.land-banner.crash {
  background: rgba(30, 12, 12, 0.72);
  border-color: rgba(255, 90, 82, 0.65);
  color: #ffecea;
}
.lb-title {
  font-size: 30px;
  font-weight: 800;
  letter-spacing: 0.06em;
  color: #6bff9e;
}
.land-banner.crash .lb-title {
  color: #ff6f66;
}
.lb-msg {
  margin-top: 6px;
  font-size: 13px;
  opacity: 0.9;
}
.lb-hint {
  margin-top: 10px;
  font-size: 11px;
  opacity: 0.65;
  letter-spacing: 0.08em;
}
@keyframes lbpop {
  from {
    transform: translate(-50%, -50%) scale(0.9);
    opacity: 0;
  }
}
</style>
