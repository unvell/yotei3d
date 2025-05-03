
export function toStringWithDigits(num, digits) {
			if (typeof digits === "undefined") {
				digits = 6;
			}
			var delta = Math.pow(10, digits);
			return Math.round(num * delta) / delta;
		}

export function roundDigits(num, digits) {
			if (typeof digits === "undefined") {
				digits = 6;
			}
			var delta = Math.pow(10, digits);
			return Math.round(num * delta) / delta;
		}
  

export function stringReplaceAll(str, search, replacement) {
  //return this.replace(new RegExp(search, 'g'), replacement); // need check illegal chars for regex
  return str.split(search).join(replacement);
}

export function objectForeach(obj, iterator) {
  if (typeof iterator !== "function") return;

  for (var key in obj) {
    if (obj.hasOwnProperty(key)) {
      iterator.call(obj, key, obj[key]);
    }
  }
}

export function objectIsEmpty(obj) {
  for (var key in obj) {
    if (obj.hasOwnProperty(key)) {
      return false;
    }
  }
  return true;
}

export function arrayRemove(arr, element) {
  var index = arrayIndexOf(arr, element);
  if (index > -1) arr.splice(index, 1);
}

export function arraySet(arr, i, ...values) {
  for (let j = 0; j < values.length; j++) {
    arr[i++] = values[j];
  }
}

export function invokeIfExist(obj, method, ...args) {
  if (typeof method === "string") {
    if (typeof obj[method] !== "function") return;
    method = obj[method];
  }

  if (typeof method === "function") {
    return method.apply(obj, args);
  }
}

export function deprecate(oldStaffName, newStaff) {
  let warningMessageDisplayed = false;

  return function(...args) {
    if (!warningMessageDisplayed) {
      console.warn(`${oldStaffName} is deprecated, use ${newStaff.name || 'the provided function'} instead`);
      warningMessageDisplayed = true;
    }

    if (typeof newStaff === 'function') {
      return newStaff.apply(this, args);
    } else {
      return newStaff;
    }
  };
}

export function getImageDataURLFromTexture(renderer, tex, imgformat = "image/png", imgQuality = 0.85) {
  if (!renderer || !tex) return;

  const width = tex.width, height = tex.height;
  const data = new Uint8Array(width * height * 4);

  tex.use(renderer);
  renderer.gl.readPixels(0, 0, width, height, renderer.gl.RGBA, renderer.gl.UNSIGNED_BYTE, data);
  tex.disuse();

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");

  if (ctx) {
    const imgData = ctx.createImageData(width, height);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index1 = y * width * 4 + x * 4;
        const index2 = (height - y - 1) * width * 4 + x * 4;

        imgData.data[index2 + 0] = data[index1 + 0];
        imgData.data[index2 + 1] = data[index1 + 1];
        imgData.data[index2 + 2] = data[index1 + 2];
        imgData.data[index2 + 3] = data[index1 + 3];
      }
    }

    ctx.putImageData(imgData, 0, 0);
  }

  return canvas.toDataURL(imgformat, imgQuality);
}

export function performMovementAccelerationAnimation(scene, intensity, attenuation, onframe, onfinish) {
  if (typeof onframe !== "function" || !scene) return;

  const renderer = scene.renderer;
  if (!renderer) return;

  const viewer = renderer.viewer;
  if (!viewer) return;

  const movement = {
    x: viewer.mouse.movement.x * intensity,
    y: viewer.mouse.movement.y * intensity,
  };

  function updateFrame() {
    const xvol = movement.x * attenuation;
    const yvol = movement.y * attenuation;
    movement.x -= xvol;
    movement.y -= yvol;

    onframe(xvol, yvol);

    scene.requireUpdateFrame();

    if (Math.abs(movement.x) > 0.2 || Math.abs(movement.y) > 0.2) {
      requestAnimationFrame(updateFrame);
    } else {
      if (typeof onfinish === "function") {
        onfinish();
      }
    }
  }

  requestAnimationFrame(updateFrame);
}

export function byteArrayToBase64(input) {
  const keyStr = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
  let output = "";
  let chr1, chr2, chr3, enc1, enc2, enc3, enc4;
  let i = 0;

  while (i < input.length) {
    chr1 = input[i++];
    chr2 = i < input.length ? input[i++] : Number.NaN;
    chr3 = i < input.length ? input[i++] : Number.NaN;

    enc1 = chr1 >> 2;
    enc2 = ((chr1 & 3) << 4) | (chr2 >> 4);
    enc3 = ((chr2 & 15) << 2) | (chr3 >> 6);
    enc4 = chr3 & 63;

    if (isNaN(chr2)) {
      enc3 = enc4 = 64;
    } else if (isNaN(chr3)) {
      enc4 = 64;
    }

    output += keyStr.charAt(enc1) + keyStr.charAt(enc2) +
              keyStr.charAt(enc3) + keyStr.charAt(enc4);
  }

  return output;
}

export const ImageToolkit = {
  convertToImageData(image) {
    // TODO: 実装する場合ここに
  }
};

export function byteToString(bytes) {
  const uarr = new Uint8Array(bytes);
  const carr = new Array(uarr.length);
  for (let i = 0; i < uarr.length; i++) {
    carr[i] = String.fromCharCode(uarr[i]);
  }

  return carr.join("");
}

export function isPowerOf2(value) {
  return (value & (value - 1)) === 0;
}

Object.defineProperties(Float32Array.prototype, {
	_t_set: {
		value: function(i) {
			if (arguments.length > 1) {
				for (var j = 0; j < arguments.length - 1; j++) {
					this[i++] = arguments[j + 1];
				}
			}
		},
		enumerable: false
	},
});
	
// IE ployfill
if (typeof Object.assign !== "function") {
	Object.assign = function(target, varArgs) { // .length of function is 2
		"use strict";

		if (target === undefined || target === null) { // TypeError if undefined or null
			throw new TypeError("cannot convert undefined or null to object");
		}

		var to = Object(target);

		for (var index = 1; index < arguments.length; index++) {
			var nextSource = arguments[index];

			if (nextSource !== undefined && nextSource !== null) { // Skip over if undefined or null
				for (var nextKey in nextSource) {
					// Avoid bugs when hasOwnProperty is shadowed
					if (Object.prototype.hasOwnProperty.call(nextSource, nextKey)) {
						to[nextKey] = nextSource[nextKey];
					}
				}
			}
		}
		return to;
	};
}
