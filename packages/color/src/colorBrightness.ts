export default function colorBrightness(color: string = ""): "dark" | "light" {
  let r = 0, g = 0, b = 0;

  if (color.match(/^rgb/)) {
    const rgb = color
      .match(/rgba?\(([^)]+)\)/)?.[1]
      .split(/ *, */)
      .map((v) => Number(v)) || [0, 0, 0];
    r = rgb[0]; g = rgb[1]; b = rgb[2];
  } else if (color[0] === "#" && color.length === 7) {
    r = parseInt(color.slice(1, 3), 16);
    g = parseInt(color.slice(3, 5), 16);
    b = parseInt(color.slice(5, 7), 16);
  } else if (color[0] === "#" && color.length === 4) {
    r = parseInt(color[1] + color[1], 16);
    g = parseInt(color[2] + color[2], 16);
    b = parseInt(color[3] + color[3], 16);
  }

  return (r * 299 + g * 587 + b * 114) / 1000 < 125 ? "dark" : "light";
}
