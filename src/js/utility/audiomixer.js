
// AudioMixer — a tiny Web Audio helper for looping ambience + one-shot SFX.
//
// Why not several <audio> elements? iOS Safari plays multiple HTMLAudioElements
// unreliably together (it routes one to the media channel and mutes the others),
// and <audio loop> leaves an audible ~1s gap at the loop boundary while it
// rewinds. A single AudioContext mixes any number of sounds, and BufferSource
// loops are sample-accurate (seamless). One user gesture unlocks it everywhere.
//
//   const mix = new AudioMixer();
//   mix.loop("/audio/waves.mp3", { volume: 0.6 });    // seamless looping ambience
//   const thunder = mix.sound("/audio/thunder.mp3", { volume: 0.8 });  // one-shot
//   mix.unlockOnGesture();          // resume on the first pointer/key event
//   mix.enabled = true;             // start/stop all loops (one-shots are gated too)
//   thunder.play();                 // fire a one-shot (no self-overlap by default)
//
// Loops/sounds begin automatically once decoded if the mixer is enabled; the
// volume of any handle can be changed live via `handle.volume = x`.
export class AudioMixer {
	constructor(options = {}) {
		const AC = (typeof window !== "undefined") && (window.AudioContext || window.webkitAudioContext);
		this.ctx = AC ? new AC() : null;
		this._enabled = options.enabled !== false;   // default on
		this._loops = [];
		this.master = this.ctx ? this.ctx.createGain() : null;
		if (this.master) {
			this.master.gain.value = options.volume != null ? options.volume : 1;
			this.master.connect(this.ctx.destination);
		}
	}

	get enabled() { return this._enabled; }
	set enabled(on) {
		this._enabled = !!on;
		if (!this.ctx) return;
		if (on) { this.ctx.resume(); this._loops.forEach(l => l._start()); }
		else { this._loops.forEach(l => l._stop()); }
	}

	// A seamless looping track. Starts automatically when enabled and decoded.
	loop(url, opts = {}) {
		const l = new MixLoop(this, url, opts);
		this._loops.push(l);
		return l;
	}

	// A one-shot effect (decoded once; a fresh source each play()).
	sound(url, opts = {}) {
		return new MixSound(this, url, opts);
	}

	// Resume the context (and start enabled loops) on the first user gesture.
	// Browsers block audio until then; the Sound toggle click also counts.
	unlockOnGesture(target) {
		target = target || (typeof window !== "undefined" ? window : null);
		if (!this.ctx || !target) return;
		const unlock = () => {
			if (this._enabled) { this.ctx.resume(); this._loops.forEach(l => l._start()); }
			target.removeEventListener("pointerdown", unlock);
			target.removeEventListener("keydown", unlock);
		};
		target.addEventListener("pointerdown", unlock);
		target.addEventListener("keydown", unlock);
	}
}

class MixLoop {
	constructor(mixer, url, opts) {
		this.mixer = mixer;
		this.buffer = null;
		this.source = null;
		const ctx = mixer.ctx;
		if (!ctx) return;
		this.gain = ctx.createGain();
		this.gain.gain.value = opts.volume != null ? opts.volume : 1;
		this.gain.connect(mixer.master);
		fetch(url).then(r => r.arrayBuffer()).then(b => ctx.decodeAudioData(b)).then(buf => {
			this.buffer = buf;
			if (mixer.enabled) this._start();
		}).catch(() => {});
	}
	set volume(v) { if (this.gain) this.gain.gain.value = v; }
	_start() {
		const ctx = this.mixer.ctx;
		if (!ctx || !this.buffer || this.source) return;
		const src = ctx.createBufferSource();
		src.buffer = this.buffer;
		src.loop = true;
		src.connect(this.gain);
		src.start();
		this.source = src;
	}
	_stop() {
		if (this.source) { try { this.source.stop(); } catch (e) {} this.source.disconnect(); this.source = null; }
	}
}

class MixSound {
	constructor(mixer, url, opts) {
		this.mixer = mixer;
		this.buffer = null;
		this.source = null;
		this.allowOverlap = !!opts.overlap;   // by default a clip won't restack on itself
		const ctx = mixer.ctx;
		if (!ctx) return;
		this.gain = ctx.createGain();
		this.gain.gain.value = opts.volume != null ? opts.volume : 1;
		this.gain.connect(mixer.master);
		fetch(url).then(r => r.arrayBuffer()).then(b => ctx.decodeAudioData(b)).then(buf => { this.buffer = buf; }).catch(() => {});
	}
	set volume(v) { if (this.gain) this.gain.gain.value = v; }
	play() {
		const ctx = this.mixer.ctx;
		if (!ctx || !this.buffer || !this.mixer.enabled) return;
		if (!this.allowOverlap && this.source) return;   // already rolling
		ctx.resume();
		const src = ctx.createBufferSource();
		src.buffer = this.buffer;
		src.connect(this.gain);
		src.onended = () => { if (this.source === src) this.source = null; };
		this.source = src;
		src.start();
	}
	stop() {
		if (this.source) { try { this.source.stop(); } catch (e) {} this.source = null; }
	}
}
