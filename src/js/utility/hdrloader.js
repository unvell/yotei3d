
// Radiance .hdr (RGBE) decoder — pure JS, no dependencies.
//
// Decodes a Radiance HDR equirectangular/panorama image into a linear
// floating-point RGBA buffer suitable for uploading to a WebGL2 RGBA16F
// texture. Supports the common "32-bit_rle_rgbe" format with new-style
// adaptive RLE scanlines (what Poly Haven / most HDRI exporters produce),
// and falls back to flat / old-RLE scanlines.
//
// Returns: { width, height, data: Float32Array }  (RGBA, alpha = 1)

function readLine(bytes, pos) {
	// returns { line, pos } reading up to (and consuming) a '\n'
	let line = "";
	const len = bytes.length;
	while (pos < len) {
		const c = bytes[pos++];
		if (c === 0x0a) break; // '\n'
		line += String.fromCharCode(c);
	}
	return { line, pos };
}

// Decode a single scanline (width pixels) into scan[width*4] as raw RGBE bytes.
// Returns the new read position.
function decodeScanline(bytes, pos, width, scan) {
	// New-format adaptive RLE is only used for 8..0x7fff wide scanlines and is
	// flagged by a [2, 2, hi, lo] header where (hi<<8 | lo) === width.
	if (width >= 8 && width <= 0x7fff
		&& bytes[pos] === 2 && bytes[pos + 1] === 2
		&& (bytes[pos + 2] & 0x80) === 0
		&& (((bytes[pos + 2] << 8) | bytes[pos + 3]) === width)) {
		pos += 4;
		// each of the 4 channels (R,G,B,E) is RLE-encoded across the whole row
		for (let c = 0; c < 4; c++) {
			let x = 0;
			while (x < width) {
				let count = bytes[pos++];
				if (count > 128) {
					// run: (count - 128) copies of the next byte
					const val = bytes[pos++];
					count -= 128;
					while (count-- > 0) scan[(x++) * 4 + c] = val;
				} else {
					// literal dump of `count` bytes
					while (count-- > 0) scan[(x++) * 4 + c] = bytes[pos++];
				}
			}
		}
		return pos;
	}

	// Flat / old-RLE scanline: pixels stored as raw RGBE, with old-style runs
	// signalled by an (1,1,1,n) pixel that repeats the previous one n<<shift times.
	let x = 0;
	let shift = 0;
	while (x < width) {
		const r = bytes[pos], g = bytes[pos + 1], b = bytes[pos + 2], e = bytes[pos + 3];
		pos += 4;
		if (r === 1 && g === 1 && b === 1) {
			let count = e << shift;
			const prev = (x - 1) * 4;
			while (count-- > 0 && x < width) {
				const d = x * 4;
				scan[d] = scan[prev];
				scan[d + 1] = scan[prev + 1];
				scan[d + 2] = scan[prev + 2];
				scan[d + 3] = scan[prev + 3];
				x++;
			}
			shift += 8;
		} else {
			const d = x * 4;
			scan[d] = r; scan[d + 1] = g; scan[d + 2] = b; scan[d + 3] = e;
			x++;
			shift = 0;
		}
	}
	return pos;
}

// Decode a Radiance HDR file from a byte buffer.
export function decodeRGBE(buffer) {
	const bytes = (buffer instanceof Uint8Array) ? buffer : new Uint8Array(buffer);

	let pos = 0;
	let r = readLine(bytes, pos);
	pos = r.pos;
	const magic = r.line;
	if (magic[0] !== "#" || magic[1] !== "?") {
		throw new Error("Not a Radiance HDR file (missing '#?' magic).");
	}

	// header lines until a blank line
	let formatOk = false;
	for (;;) {
		r = readLine(bytes, pos);
		pos = r.pos;
		const line = r.line;
		if (line === "") break;
		if (line.indexOf("FORMAT=") === 0) {
			const fmt = line.substring(7).trim();
			if (fmt !== "32-bit_rle_rgbe" && fmt !== "32-bit_rle_xyze") {
				throw new Error("Unsupported HDR FORMAT: " + fmt);
			}
			formatOk = true;
		}
		// EXPOSURE / GAMMA / PRIMARIES etc. are ignored
	}
	if (!formatOk) {
		// some writers omit FORMAT; assume rgbe and continue
	}

	// resolution line, e.g. "-Y 2048 +X 4096" (rows top->bottom, cols left->right)
	r = readLine(bytes, pos);
	pos = r.pos;
	const m = r.line.match(/^\s*([+-][XY])\s+(\d+)\s+([+-][XY])\s+(\d+)/);
	if (!m) throw new Error("Invalid HDR resolution line: " + r.line);

	let width, height;
	if (m[1][1] === "Y") {
		height = parseInt(m[2], 10);
		width = parseInt(m[4], 10);
	} else {
		width = parseInt(m[2], 10);
		height = parseInt(m[4], 10);
	}

	const data = new Float32Array(width * height * 4);
	const scan = new Uint8Array(width * 4);

	for (let y = 0; y < height; y++) {
		pos = decodeScanline(bytes, pos, width, scan);

		// RGBE -> linear float. The shared exponent encodes a per-pixel scale:
		//   value = mantissa * 2^(exp - 128 - 8)
		const rowOffset = y * width * 4;
		for (let x = 0; x < width; x++) {
			const s = x * 4;
			const e = scan[s + 3];
			const d = rowOffset + s;
			if (e === 0) {
				data[d] = 0; data[d + 1] = 0; data[d + 2] = 0; data[d + 3] = 1;
			} else {
				const f = Math.pow(2.0, e - (128 + 8));
				data[d] = scan[s] * f;
				data[d + 1] = scan[s + 1] * f;
				data[d + 2] = scan[s + 2] * f;
				data[d + 3] = 1.0;
			}
		}
	}

	return { width, height, data };
}

// Fetch and decode a Radiance HDR file from a URL.
export function loadHDR(url) {
	return fetch(url)
		.then(res => {
			if (!res.ok) throw new Error("Failed to load HDR: " + url + " (" + res.status + ")");
			return res.arrayBuffer();
		})
		.then(buf => decodeRGBE(new Uint8Array(buf)));
}
