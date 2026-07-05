interface colorObjectType {
  print: () => string;
}

class rgb implements colorObjectType {
  r?: number;
  g?: number;
  b?: number;

  print() {
    if (numberIs8Bit(this.r) && numberIs8Bit(this.g) && numberIs8Bit(this.b)) {
      return "rgb(" + this.r + "," + this.g + "," + this.b + ")";
    }
    return "";
  }
}

class hex implements colorObjectType {
  r?: string;
  g?: string;
  b?: string;

  print() {
    if (
      numberIsHex((this.r as string) + (this.g as string) + (this.b as string))
    ) {
      return "#" + this.r + this.g + this.b;
    }
    return "";
  }
}

class hsl implements colorObjectType {
  h?: number;
  s?: number;
  l?: number;

  print() {
    if (
      numberIsDegree(this.h) &&
      numberIsPercentage(this.s) &&
      numberIsPercentage(this.l)
    ) {
      return "hsl(" + this.h + "," + this.s + "%," + this.l + "%)";
    }
    return "";
  }
}

class hwb implements colorObjectType {
  h?: number;
  w?: number;
  b?: number;

  print() {
    if (
      numberIsDegree(this.h) &&
      numberIsPercentage(this.w) &&
      numberIsPercentage(this.b)
    ) {
      return "hwb(" + this.h + "," + this.w + "%," + this.b + "%)";
    }
    return "";
  }
}

class cmyk implements colorObjectType {
  c?: number;
  m?: number;
  y?: number;
  k?: number;

  print() {
    if (
      numberIsPercentage(this.c) &&
      numberIsPercentage(this.m) &&
      numberIsPercentage(this.y) &&
      numberIsPercentage(this.k)
    ) {
      return (
        "cmyk(" + this.c + "%," + this.m + "%," + this.y + "%," + this.k + "%)"
      );
    }
    return "";
  }
}

class lab implements colorObjectType {
  l?: number;
  a?: number;
  b?: number;

  print() {
    if (this.l !== undefined && this.a !== undefined && this.b !== undefined && numberIsPercentage(this.l)) {
      return `lab(${this.l},${this.a},${this.b})`;
    }
    return "";
  }
}

class lch implements colorObjectType {
  l?: number;
  c?: number;
  h?: number;

  print() {
    if (this.l !== undefined && this.c !== undefined && this.h !== undefined && numberIsPercentage(this.l)) {
      return `lch(${this.l},${this.c},${this.h})`;
    }
    return "";
  }
}

class oklch implements colorObjectType {
  l?: number; // 0-100 (stored as %, output as 0-1 fraction)
  c?: number; // 0-0.4
  h?: number; // 0-360

  print() {
    if (this.l !== undefined && this.c !== undefined && this.h !== undefined && numberIsPercentage(this.l)) {
      return `oklch(${this.l}%,${this.c.toFixed(3)},${this.h})`;
    }
    return "";
  }
}

class hsv implements colorObjectType {
  h?: number;
  s?: number;
  v?: number;

  print() {
    if (
      numberIsDegree(this.h) &&
      numberIsPercentage(this.s) &&
      numberIsPercentage(this.v)
    ) {
      return "hsv(" + this.h + "," + this.s + "%," + this.v + "%)";
    }
    return "";
  }
}

export class ColorObject {
  rgb: rgb;
  hex: hex;
  hsl: hsl;
  hwb: hwb;
  cmyk: cmyk;
  hsv: hsv;
  lab: lab;
  lch: lch;
  oklch: oklch;
  validColor: boolean;

  constructor(input: string) {
    this.rgb = new rgb();
    this.hex = new hex();
    this.hsl = new hsl();
    this.hwb = new hwb();
    this.cmyk = new cmyk();
    this.hsv = new hsv();
    this.lab = new lab();
    this.lch = new lch();
    this.oklch = new oklch();
    this.validColor = false;

    this.processInput(input);
  }

  processInput(input: string) {
    if (!input) {
      this.validColor = false;
      return void 0;
    }

    input = trim(input.toString());

    switch (true) {
      case /^transparent$/.test(input):
      // rgba(23,233,2,0)
      case /^[a-z]{3,4}a\((?:(?:[01]?[0-9][0-9]?|2[0-4][0-9]|25[0-5]),){3}0\)$/i.test(
        removeAllWhiteSpace(input)
      ):
        // this.rgb.print =
        //   this.hex.print =
        //   this.hsl.print =
        //   this.hwb.print =
        //   this.cmyk.print =
        //     () => {
        //       return "transparent";
        //     };
        this.validColor = false;
        break;
      case /^rgba?\((.*)\);?$/.test(input):
        this.processRGB(input);
        break;
      case /^hsva?\((.*)\);?$/.test(input):
        this.processHSV(input);
        break;
      case /^hsla?\((.*)\);?$/.test(input):
        this.processHSL(input);
        break;
      case /^hwba?\((.*)\);?$/.test(input):
        this.processHWB(input);
        break;
      case /^cmyka?\((.*)\);?$/.test(input):
        this.processCMYK(input);
        break;
      case /^laba?\((.*)\);?$/.test(input):
        this.processLab(input);
        break;
      case /^lcha?\((.*)\);?$/.test(input):
        this.processLch(input);
        break;
      case /^oklcha?\((.*)\);?$/.test(input):
        this.processOklch(input);
        break;
      case /^#/.test(input):
        this.processHEX(input);
        break;
    }
  }

  // RGB -> HEX, CMYK, HSL -> HWB
  processRGB(input: string) {
    const matches = input.match(
      /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*(\d+(?:\.\d+)?))?\)$/i
    );
    if (matches instanceof Array) {
      matches.shift();
    } else {
      this.validColor = false;
      return void 0;
    }
    if (
      (3 === matches.length || 4 === matches.length) &&
      numberIs8Bit(matches[0]) &&
      numberIs8Bit(matches[1]) &&
      numberIs8Bit(matches[2])
    ) {
      this.rgb.r = Number(matches[0]);
      this.rgb.g = Number(matches[1]);
      this.rgb.b = Number(matches[2]);
      this.validColor = true;

      this.rgbToHEX(this.rgb.r, this.rgb.g, this.rgb.b);
      this.rgbToCMYK(this.rgb.r, this.rgb.g, this.rgb.b);
      this.rgbToHSL(this.rgb.r, this.rgb.g, this.rgb.b);
      this.hslToHWB(this.hsl.h, this.hsl.s, this.hsl.l);
      this.rgbToHSV(this.rgb.r, this.rgb.g, this.rgb.b);
      this.rgbToLab(this.rgb.r, this.rgb.g, this.rgb.b);
      this.rgbToLch(this.rgb.r, this.rgb.g, this.rgb.b);
      this.rgbToOklch(this.rgb.r, this.rgb.g, this.rgb.b);
      this.validColor = true;
      return void 0;
    }
    this.validColor = false;
    return void 0;
  }

  // HEX -> RGB -> CMYK, HSL -> HWB
  processHEX(input: string) {
    input = input.split("#").reverse()[0];
    if (numberIsHex(input)) {
      if (3 === input.length) {
        // Input
        input =
          input.charAt(0) +
          input.charAt(0) +
          input.charAt(1) +
          input.charAt(1) +
          input.charAt(2) +
          input.charAt(2);
      }

      this.hex.r = input.substring(0, 2);
      this.hex.g = input.substring(2, 4);
      this.hex.b = input.substring(4, 6);

      this.hexToRGB(this.hex.r, this.hex.g, this.hex.b);
      this.rgbToCMYK(this.rgb.r, this.rgb.g, this.rgb.b);
      this.rgbToHSL(this.rgb.r, this.rgb.g, this.rgb.b);
      this.hslToHWB(this.hsl.h, this.hsl.s, this.hsl.l);
      this.rgbToHSV(this.rgb.r, this.rgb.g, this.rgb.b);
      this.rgbToLab(this.rgb.r, this.rgb.g, this.rgb.b);
      this.rgbToLch(this.rgb.r, this.rgb.g, this.rgb.b);
      this.rgbToOklch(this.rgb.r, this.rgb.g, this.rgb.b);
      this.validColor = true;
      return void 0;
    }
    this.validColor = false;
    return void 0;
  }

  // HSL -> HWB, RGB -> CMYK, HEX
  processHSL(input: string) {
    const matches = input.match(
      /^hsla?\((\d+),\s*(\d+)%?,\s*(\d+)%?(?:,\s*(\d+(?:\.\d+)?))?\)$/i
    );
    if (matches instanceof Array) {
      matches.shift();
    } else {
      this.validColor = false;
      return void 0;
    }
    if (
      (3 === matches.length || 4 === matches.length) &&
      numberIsDegree(matches[0]) &&
      numberIsPercentage(matches[1]) &&
      numberIsPercentage(matches[2])
    ) {
      this.hsl.h = Number(matches[0]);
      this.hsl.s = Number(matches[1]);
      this.hsl.l = Number(matches[2]);

      this.hslToHWB(this.hsl.h, this.hsl.s, this.hsl.l);
      this.hslToRGB(this.hsl.h, this.hsl.s, this.hsl.l);
      this.rgbToCMYK(this.rgb.r, this.rgb.g, this.rgb.b);
      this.rgbToHEX(this.rgb.r, this.rgb.g, this.rgb.b);
      this.rgbToHSV(this.rgb.r, this.rgb.g, this.rgb.b);
      this.rgbToLab(this.rgb.r, this.rgb.g, this.rgb.b);
      this.rgbToLch(this.rgb.r, this.rgb.g, this.rgb.b);
      this.rgbToOklch(this.rgb.r, this.rgb.g, this.rgb.b);
      this.validColor = true;
      return void 0;
    }
    this.validColor = false;
    return void 0;
  }

  // HWB -> HSL -> RGB -> CMYK, HEX
  processHWB(input: string) {
    const macthes = input.match(
      /^hwba?\((\d+),\s*(\d+)%?,\s*(\d+)%?(?:,\s*(\d+(?:\.\d+)?))?\)$/i
    );
    if (macthes instanceof Array) {
      macthes.shift();
    } else {
      this.validColor = false;
      return void 0;
    }
    if (
      (3 === macthes.length || 4 === macthes.length) &&
      numberIsDegree(macthes[0]) &&
      numberIsPercentage(macthes[1]) &&
      numberIsPercentage(macthes[2])
    ) {
      this.hwb.h = Number(macthes[0]);
      this.hwb.w = Number(macthes[1]);
      this.hwb.b = Number(macthes[2]);

      this.hwbToHSL(this.hwb.h, this.hwb.w, this.hwb.b);
      this.hslToRGB(this.hsl.h, this.hsl.s, this.hsl.l);
      this.rgbToCMYK(this.rgb.r, this.rgb.g, this.rgb.b);
      this.rgbToHEX(this.rgb.r, this.rgb.g, this.rgb.b);
      this.rgbToHSV(this.rgb.r, this.rgb.g, this.rgb.b);
      this.rgbToLab(this.rgb.r, this.rgb.g, this.rgb.b);
      this.rgbToLch(this.rgb.r, this.rgb.g, this.rgb.b);
      this.rgbToOklch(this.rgb.r, this.rgb.g, this.rgb.b);
      this.validColor = true;
      return void 0;
    }
    this.validColor = false;
    return void 0;
  }

  // CMYK -> RGB -> HEX, HSL -> HWB
  processCMYK(input: string) {
    const macthes = input.match(
      /^cmyka?\((\d+)%?,\s*(\d+)%?,\s*(\d+)%?,\s*(\d+)%?(?:,\s*(\d+(?:\.\d+)?))?\)$/i
    );
    if (macthes instanceof Array) {
      macthes.shift();
    } else {
      return null;
    }
    if (
      (4 === macthes.length || 5 === macthes.length) &&
      numberIsPercentage(macthes[0]) &&
      numberIsPercentage(macthes[1]) &&
      numberIsPercentage(macthes[2]) &&
      numberIsPercentage(macthes[3])
    ) {
      //if(5 !== macthes.length || isFiniteNumber(macthes[4])){
      this.cmyk.c = Number(macthes[0]);
      this.cmyk.m = Number(macthes[1]);
      this.cmyk.y = Number(macthes[2]);
      this.cmyk.k = Number(macthes[3]);

      this.cmykToRGB(this.cmyk.c, this.cmyk.m, this.cmyk.y, this.cmyk.k);
      this.rgbToHEX(this.rgb.r, this.rgb.g, this.rgb.b);
      this.rgbToHSL(this.rgb.r, this.rgb.g, this.rgb.b);
      this.hslToHWB(this.hsl.h, this.hsl.s, this.hsl.l);
      this.rgbToHSV(this.rgb.r, this.rgb.g, this.rgb.b);
      this.rgbToLab(this.rgb.r, this.rgb.g, this.rgb.b);
      this.rgbToLch(this.rgb.r, this.rgb.g, this.rgb.b);
      this.rgbToOklch(this.rgb.r, this.rgb.g, this.rgb.b);
      this.validColor = true;
      return void 0;
    }
    this.validColor = false;
    return void 0;
  }

  // HSV -> RGB -> HEX, CMYK, HSL -> HWB
  processHSV(input: string) {
    const matches = input.match(
      /^hsva?\((\d+),\s*(\d+)%?,\s*(\d+)%?(?:,\s*(\d+(?:\.\d+)?))?\)$/i
    );
    if (matches instanceof Array) {
      matches.shift();
    } else {
      this.validColor = false;
      return void 0;
    }
    if (
      (3 === matches.length || 4 === matches.length) &&
      numberIsDegree(matches[0]) &&
      numberIsPercentage(matches[1]) &&
      numberIsPercentage(matches[2])
    ) {
      this.hsv.h = Number(matches[0]);
      this.hsv.s = Number(matches[1]);
      this.hsv.v = Number(matches[2]);

      this.hsvToRGB(this.hsv.h, this.hsv.s, this.hsv.v);
      this.rgbToHEX(this.rgb.r, this.rgb.g, this.rgb.b);
      this.rgbToCMYK(this.rgb.r, this.rgb.g, this.rgb.b);
      this.rgbToHSL(this.rgb.r, this.rgb.g, this.rgb.b);
      this.hslToHWB(this.hsl.h, this.hsl.s, this.hsl.l);
      this.rgbToLab(this.rgb.r, this.rgb.g, this.rgb.b);
      this.rgbToLch(this.rgb.r, this.rgb.g, this.rgb.b);
      this.rgbToOklch(this.rgb.r, this.rgb.g, this.rgb.b);
      this.validColor = true;
      return void 0;
    }
    this.validColor = false;
    return void 0;
  }

  // RGB -> HEX
  rgbToHEX(r?: number, g?: number, b?: number) {
    if (undefined === r || undefined === g || undefined === b) {
      this.validColor = false;
      return null;
    }

    this.hex.r = decToHex(r).toUpperCase();
    this.hex.g = decToHex(g).toUpperCase();
    this.hex.b = decToHex(b).toUpperCase();
  }

  // HEX -> RGB
  hexToRGB(r?: string, g?: string, b?: string) {
    if (undefined === r || undefined === g || undefined === b) {
      this.validColor = false;
      return null;
    }

    this.rgb.r = Number(hexToDec(r));
    this.rgb.g = Number(hexToDec(g));
    this.rgb.b = Number(hexToDec(b));
  }

  // RGB -> HSL
  rgbToHSL(r?: number, g?: number, b?: number) {
    if (undefined === r || undefined === g || undefined === b) {
      this.validColor = false;
      return null;
    }

    r /= 255;
    g /= 255;
    b /= 255;
    const max: number = Math.max(r, g, b),
      min: number = Math.min(r, g, b),
      l: number = (max + min) / 2;
    let h: number, s: number;

    if (max == min) {
      h = s = 0; // achromatic
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r:
          h = (g - b) / d + (g < b ? 6 : 0);
          break;
        case g:
          h = (b - r) / d + 2;
          break;
        case b:
          h = (r - g) / d + 4;
          break;
        default:
          h = 6; //make h 6 so division works
          break;
      }
      h /= 6;
    }

    // Convert HSL from set [0,1] to Angle and Percent
    this.hsl.h = Math.round(h * 360);
    this.hsl.s = Math.round(s * 100);
    this.hsl.l = Math.round(l * 100);
  }

  // HSL -> RGB
  hslToRGB(h?: number, s?: number, l?: number) {
    if (undefined === h || undefined === s || undefined === l) {
      this.validColor = false;
      return null;
    }

    let r: number, g: number, b: number;

    // Convert HSL from Angle and Percent to set [0,1]
    h /= 360;
    s /= 100;
    l /= 100;

    if (s == 0) {
      r = g = b = l; // achromatic
    } else {
      const hue2rgb = (p: number, q: number, t: number) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
      };

      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1 / 3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1 / 3);
    }

    // Output
    this.rgb.r = Math.round(r * 255);
    this.rgb.g = Math.round(g * 255);
    this.rgb.b = Math.round(b * 255);
  }

  // HSL -> HWB
  hslToHWB(h?: number, s?: number, l?: number) {
    if (undefined === h || undefined === s || undefined === l) {
      this.validColor = false;
      return null;
    }

    const hwb1 = (s * (l < 50 ? l : 100 - l)) / 100,
      w = hwb1 === 0 ? 0 : ((2 * hwb1) / (l + hwb1)) * 100,
      b = l + hwb1;

    this.hwb.h = Math.round(h);
    this.hwb.w = Math.round(w);
    this.hwb.b = Math.round(b);
  }

  // HWB -> HSL
  hwbToHSL(h?: number, w?: number, b?: number) {
    if (undefined === h || undefined === w || undefined === b) {
      this.validColor = false;
      return null;
    }

    const l1 = ((200 - w) * b) / 100;
    const [s, l] = [
      l1 === 0 || l1 === 200
        ? 0
        : ((w * b) / 100 / (l1 <= 100 ? l1 : 200 - l1)) * 100,
      (l1 * 5) / 10,
    ];

    this.hsl.h = Math.round(h);
    this.hsl.s = Math.round(s);
    this.hsl.l = Math.round(l);
  }

  // RGB -> CMYK
  rgbToCMYK(r?: number, g?: number, b?: number) {
    if (undefined === r || undefined === g || undefined === b) {
      this.validColor = false;
      return null;
    }

    let c = 1 - r / 255,
      m = 1 - g / 255,
      y = 1 - b / 255,
      k = Math.min(c, Math.min(m, y));

    c = (c - k) / (1 - k);
    m = (m - k) / (1 - k);
    y = (y - k) / (1 - k);

    c = Math.round(c * 100);
    m = Math.round(m * 100);
    y = Math.round(y * 100);
    k = Math.round(k * 100);

    this.cmyk.c = isNaN(c) ? 0 : c;
    this.cmyk.m = isNaN(m) ? 0 : m;
    this.cmyk.y = isNaN(y) ? 0 : y;
    this.cmyk.k = isNaN(k) ? 0 : k;
  }

  // CMYK -> RGB
  cmykToRGB(c?: number, m?: number, y?: number, k?: number) {
    if (
      undefined === c ||
      undefined === m ||
      undefined === y ||
      undefined === k
    ) {
      this.validColor = false;
      return null;
    }

    c = c / 100;
    m = m / 100;
    y = y / 100;
    k = k / 100;

    c = c * (1 - k) + k;
    m = m * (1 - k) + k;
    y = y * (1 - k) + k;

    this.rgb.r = Math.round(255 * (1 - c));
    this.rgb.g = Math.round(255 * (1 - m));
    this.rgb.b = Math.round(255 * (1 - y));
  }

  // RGB -> HSV
  rgbToHSV(r?: number, g?: number, b?: number) {
    if (undefined === r || undefined === g || undefined === b) {
      this.validColor = false;
      return null;
    }

    const rn = r / 255, gn = g / 255, bn = b / 255;
    const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn), d = max - min;
    let h = 0;
    if (d !== 0) {
      if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
      else if (max === gn) h = ((bn - rn) / d + 2) / 6;
      else h = ((rn - gn) / d + 4) / 6;
    }

    this.hsv.h = Math.round(h * 360);
    this.hsv.s = Math.round(max === 0 ? 0 : (d / max) * 100);
    this.hsv.v = Math.round(max * 100);
  }

  // HSV -> RGB
  hsvToRGB(h?: number, s?: number, v?: number) {
    if (undefined === h || undefined === s || undefined === v) {
      this.validColor = false;
      return null;
    }

    s /= 100;
    v /= 100;
    const k = (n: number) => (n + h / 60) % 6;
    const f = (n: number) => v - v * s * Math.max(0, Math.min(k(n), 4 - k(n), 1));

    this.rgb.r = Math.round(f(5) * 255);
    this.rgb.g = Math.round(f(3) * 255);
    this.rgb.b = Math.round(f(1) * 255);
  }

  // Lab -> RGB -> all
  processLab(input: string) {
    const matches = input.match(/^laba?\((-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)(?:,\s*[\d.]+)?\)$/i);
    if (!(matches instanceof Array)) { this.validColor = false; return void 0; }
    matches.shift();
    const [L, a, b] = matches.map(Number);
    if (!numberIsPercentage(L)) { this.validColor = false; return void 0; }
    this.lab.l = Math.round(L);
    this.lab.a = Math.round(a);
    this.lab.b = Math.round(b);
    this.labToRGB(this.lab.l, this.lab.a, this.lab.b);
    this.rgbToHEX(this.rgb.r, this.rgb.g, this.rgb.b);
    this.rgbToCMYK(this.rgb.r, this.rgb.g, this.rgb.b);
    this.rgbToHSL(this.rgb.r, this.rgb.g, this.rgb.b);
    this.hslToHWB(this.hsl.h, this.hsl.s, this.hsl.l);
    this.rgbToHSV(this.rgb.r, this.rgb.g, this.rgb.b);
    this.rgbToLch(this.rgb.r, this.rgb.g, this.rgb.b);
    this.rgbToOklch(this.rgb.r, this.rgb.g, this.rgb.b);
    this.validColor = true;
    return void 0;
  }

  // LCH -> RGB -> all
  processLch(input: string) {
    const matches = input.match(/^lcha?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*[\d.]+)?\)$/i);
    if (!(matches instanceof Array)) { this.validColor = false; return void 0; }
    matches.shift();
    const [L, c, h] = matches.map(Number);
    if (!numberIsPercentage(L)) { this.validColor = false; return void 0; }
    this.lch.l = Math.round(L);
    this.lch.c = Math.round(c);
    this.lch.h = Math.round(h);
    this.lchToRGB(this.lch.l, this.lch.c, this.lch.h);
    this.rgbToHEX(this.rgb.r, this.rgb.g, this.rgb.b);
    this.rgbToCMYK(this.rgb.r, this.rgb.g, this.rgb.b);
    this.rgbToHSL(this.rgb.r, this.rgb.g, this.rgb.b);
    this.hslToHWB(this.hsl.h, this.hsl.s, this.hsl.l);
    this.rgbToHSV(this.rgb.r, this.rgb.g, this.rgb.b);
    this.rgbToLab(this.rgb.r, this.rgb.g, this.rgb.b);
    this.rgbToOklch(this.rgb.r, this.rgb.g, this.rgb.b);
    this.validColor = true;
    return void 0;
  }

  // Oklch -> RGB -> all
  processOklch(input: string) {
    const matches = input.match(/^oklcha?\(([\d.]+)%?,\s*([\d.]+),\s*([\d.]+)(?:,\s*[\d.]+)?\)$/i);
    if (!(matches instanceof Array)) { this.validColor = false; return void 0; }
    matches.shift();
    const [L, c, h] = matches.map(Number);
    if (!numberIsPercentage(L)) { this.validColor = false; return void 0; }
    this.oklch.l = Math.round(L);
    this.oklch.c = Math.round(c * 10000) / 10000;
    this.oklch.h = Math.round(h);
    this.oklchToRGB(this.oklch.l, this.oklch.c, this.oklch.h);
    this.rgbToHEX(this.rgb.r, this.rgb.g, this.rgb.b);
    this.rgbToCMYK(this.rgb.r, this.rgb.g, this.rgb.b);
    this.rgbToHSL(this.rgb.r, this.rgb.g, this.rgb.b);
    this.hslToHWB(this.hsl.h, this.hsl.s, this.hsl.l);
    this.rgbToHSV(this.rgb.r, this.rgb.g, this.rgb.b);
    this.rgbToLab(this.rgb.r, this.rgb.g, this.rgb.b);
    this.rgbToLch(this.rgb.r, this.rgb.g, this.rgb.b);
    this.validColor = true;
    return void 0;
  }

  // RGB -> Lab
  rgbToLab(r?: number, g?: number, b?: number) {
    if (undefined === r || undefined === g || undefined === b) { this.validColor = false; return null; }
    const [L, a, bv] = xyzToLab(...rgbToXyz(r, g, b));
    this.lab.l = Math.round(L);
    this.lab.a = Math.round(a);
    this.lab.b = Math.round(bv);
  }

  // Lab -> RGB (via XYZ)
  labToRGB(l?: number, a?: number, b?: number) {
    if (undefined === l || undefined === a || undefined === b) { this.validColor = false; return null; }
    const [r, g, bv] = xyzToRgb(...labToXyz(l, a, b));
    this.rgb.r = r; this.rgb.g = g; this.rgb.b = bv;
  }

  // RGB -> LCH (via Lab)
  rgbToLch(r?: number, g?: number, b?: number) {
    if (undefined === r || undefined === g || undefined === b) { this.validColor = false; return null; }
    const [L, a, bv] = xyzToLab(...rgbToXyz(r, g, b));
    let h = Math.round(Math.atan2(bv, a) * 180 / Math.PI);
    if (h < 0) h += 360;
    this.lch.l = Math.round(L);
    this.lch.c = Math.round(Math.sqrt(a * a + bv * bv));
    this.lch.h = h;
  }

  // LCH -> RGB (via Lab → XYZ)
  lchToRGB(l?: number, c?: number, h?: number) {
    if (undefined === l || undefined === c || undefined === h) { this.validColor = false; return null; }
    const hRad = h * Math.PI / 180;
    const [r, g, b] = xyzToRgb(...labToXyz(l, c * Math.cos(hRad), c * Math.sin(hRad)));
    this.rgb.r = r; this.rgb.g = g; this.rgb.b = b;
  }

  // RGB -> Oklch
  rgbToOklch(r?: number, g?: number, b?: number) {
    if (undefined === r || undefined === g || undefined === b) { this.validColor = false; return null; }
    const [L, a, bv] = rgbToOklab(r, g, b);
    let h = Math.round(Math.atan2(bv, a) * 180 / Math.PI);
    if (h < 0) h += 360;
    this.oklch.l = Math.round(L * 100);
    this.oklch.c = Math.round(Math.sqrt(a * a + bv * bv) * 10000) / 10000;
    this.oklch.h = h;
  }

  // Oklch -> RGB (l stored as 0-100)
  oklchToRGB(l?: number, c?: number, h?: number) {
    if (undefined === l || undefined === c || undefined === h) { this.validColor = false; return null; }
    const hRad = h * Math.PI / 180;
    const [r, g, b] = oklabToRgb(l / 100, c * Math.cos(hRad), c * Math.sin(hRad));
    this.rgb.r = r; this.rgb.g = g; this.rgb.b = b;
  }
}

// ─── Perceptual colour space helpers ──────────────────────────────────────────

function srgbToLinear(c: number): number {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function linearToSrgb(c: number): number {
  const v = Math.max(0, Math.min(1, c));
  return Math.round((v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055) * 255);
}

function rgbToXyz(r: number, g: number, b: number): [number, number, number] {
  const rn = srgbToLinear(r), gn = srgbToLinear(g), bn = srgbToLinear(b);
  return [
    rn * 0.4124564 + gn * 0.3575761 + bn * 0.1804375,
    rn * 0.2126729 + gn * 0.7151522 + bn * 0.0721750,
    rn * 0.0193339 + gn * 0.1191920 + bn * 0.9503041,
  ];
}

function xyzToRgb(x: number, y: number, z: number): [number, number, number] {
  return [
    linearToSrgb( 3.2404542 * x - 1.5371385 * y - 0.4985314 * z),
    linearToSrgb(-0.9692660 * x + 1.8760108 * y + 0.0415560 * z),
    linearToSrgb( 0.0556434 * x - 0.2040259 * y + 1.0572252 * z),
  ];
}

function xyzToLab(x: number, y: number, z: number): [number, number, number] {
  const Xn = 0.95047, Yn = 1.0, Zn = 1.08883;
  const f = (t: number) => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
  return [116 * f(y / Yn) - 16, 500 * (f(x / Xn) - f(y / Yn)), 200 * (f(y / Yn) - f(z / Zn))];
}

function labToXyz(L: number, a: number, b: number): [number, number, number] {
  const Xn = 0.95047, Yn = 1.0, Zn = 1.08883;
  const fy = (L + 16) / 116;
  const finv = (t: number) => t > 0.206897 ? t * t * t : (t - 16 / 116) / 7.787;
  return [Xn * finv(a / 500 + fy), Yn * finv(fy), Zn * finv(fy - b / 200)];
}

function rgbToOklab(r: number, g: number, b: number): [number, number, number] {
  const rn = srgbToLinear(r), gn = srgbToLinear(g), bn = srgbToLinear(b);
  const l_ = Math.cbrt(0.4122214708 * rn + 0.5363325363 * gn + 0.0514459929 * bn);
  const m_ = Math.cbrt(0.2119034982 * rn + 0.6806995451 * gn + 0.1073969566 * bn);
  const s_ = Math.cbrt(0.0883024619 * rn + 0.2817188376 * gn + 0.6299787005 * bn);
  return [
    0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
  ];
}

function oklabToRgb(L: number, a: number, b: number): [number, number, number] {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_;
  return [
    linearToSrgb( 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s),
  ];
}

// Is a number and is finite
function isFiniteNumber(input: number | string): boolean {
  if (typeof input === "string") {
    return !isNaN(parseFloat(input));
  } else if (typeof input === "number") {
    return isFinite(input);
  }
  return false;
}
// Strip white space at head and tail of string
function trim(input: string) {
  return input.toString().replace(/^\s+|\s+$/g, "");
}
// remove all white spaces
function removeAllWhiteSpace(input: string) {
  return input.toString().replace(/\s/g, "");
}
// Check if input is a number between 0 and 255
function numberInRange(
  input: string | number,
  floor: number,
  ceiling: number
): boolean {
  return (
    (input =
      typeof input === "string" ? Number(trim(input)) : (input as number)),
    isFiniteNumber(input) && input >= floor && ceiling >= input
  );
}
// Check if number is 0 to 255
function numberIs8Bit(input?: string | number): boolean {
  if (undefined === input) return false;
  return numberInRange(input, 0, 255);
}
// Check if number is 0 - 360
function numberIsDegree(input?: string | number): boolean {
  if (undefined === input) return false;
  return numberInRange(input, 0, 360);
}
// Check if number is percentage
function numberIsPercentage(input?: string | number): boolean {
  if (undefined === input) return false;
  return numberInRange(input, 0, 100);
}

// Check if number is between 0 - 1
// numberIs0To1(input?: string | number): boolean {
//   if (undefined === input) return false;
//   return numberInRange(input, 0, 1);
// }

// Check if number is hex value of length 3 or 6 characers
function numberIsHex(input?: string | number): boolean {
  if (undefined === input) return false;
  input = typeof input === "string" ? input : input.toString();
  return /^[0-9a-f]{3}$|^[0-9a-f]{6}$/i.test(trim(input));
}
// Convert input from Decimal to Hex as string
function decToHex(input?: string | number): string {
  if (undefined === input) return "";
  input = typeof input === "string" ? trim(input) : trim(input.toString());
  return (
    (input = parseInt(input, 10).toString(16)),
    1 === input.length ? "0" + input : input
  );
}
// Convert input from Hex to Decimal and output as string
function hexToDec(input: string) {
  return parseInt(input, 16).toString();
}
