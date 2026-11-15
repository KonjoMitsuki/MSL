#version 300 es
precision highp float;
uniform sampler2D uSurface;
uniform float uZoom;
uniform vec2 uPan;
in vec2 vUV;
out vec4 outColor;
// Bilinear reconstruction only for display. Simulation remains exact NEAREST RGB.
vec4 fetchAt(ivec2 p, ivec2 size) {
  return texelFetch(uSurface, clamp(p, ivec2(0), size - 1), 0);
}
void main() {
  ivec2 size = textureSize(uSurface, 0);
  vec2 uv = (vUV - 0.5 - vec2(uPan.x, -uPan.y)) / uZoom + 0.5;
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) {
    outColor = vec4(0.067, 0.082, 0.110, 1.0);
    return;
  }
  vec2 p = uv * vec2(size) - 0.5;
  ivec2 i = ivec2(floor(p));
  vec2 f = fract(p);
  outColor = mix(mix(fetchAt(i, size), fetchAt(i + ivec2(1, 0), size), f.x),
                 mix(fetchAt(i + ivec2(0, 1), size), fetchAt(i + ivec2(1, 1), size), f.x), f.y);
}
