#version 300 es
precision highp float;
uniform sampler2D uSurface;
uniform sampler2D uVelocity;
uniform int uMode; // 0 identity, 1 direct pen, 2 fluid advection
uniform vec2 uA;
uniform vec2 uB;
uniform float uSigma;
uniform float uStrength;
uniform float uMaxStep;
in vec2 vUV;
out vec4 outColor;

// Two 16-bit coordinates packed in RGBA8: no float-render-target extension.
vec2 decode(vec4 c) {
  vec4 bytes = floor(c * 255.0 + 0.5);
  return vec2(bytes.r * 256.0 + bytes.g, bytes.b * 256.0 + bytes.a) / 65535.0;
}
vec4 encode(vec2 p) {
  vec2 n = floor(clamp(p, 0.0, 1.0) * 65535.0 + 0.5);
  return vec4(floor(n.x / 256.0), mod(n.x, 256.0), floor(n.y / 256.0), mod(n.y, 256.0)) / 255.0;
}
vec2 coord(ivec2 p) {
  return decode(texelFetch(uSurface, clamp(p, ivec2(0), textureSize(uSurface, 0) - 1), 0));
}
vec2 mapping(vec2 uv) {
  vec2 p = uv * vec2(textureSize(uSurface, 0)) - 0.5;
  ivec2 i = ivec2(floor(p));
  vec2 f = fract(p);
  return mix(mix(coord(i), coord(i + ivec2(1, 0)), f.x),
    mix(coord(i + ivec2(0, 1)), coord(i + ivec2(1, 1)), f.x), f.y);
}
vec2 velocityAt(ivec2 p) {
  return texelFetch(uVelocity, clamp(p, ivec2(0), textureSize(uVelocity, 0) - 1), 0).rg;
}
vec2 velocity(vec2 q) {
  vec2 p = q / 1024.0 * vec2(textureSize(uVelocity, 0)) - 0.5;
  ivec2 i = ivec2(floor(p));
  vec2 f = fract(p);
  return mix(mix(velocityAt(i), velocityAt(i + ivec2(1, 0)), f.x),
    mix(velocityAt(i + ivec2(0, 1)), velocityAt(i + ivec2(1, 1)), f.x), f.y);
}
void main() {
  if (uMode == 0) { outColor = encode(vUV); return; }
  vec2 q = vec2(vUV.x, 1.0 - vUV.y) * 1024.0;
  vec2 delta = vec2(0.0);
  if (uMode == 1) {
    vec2 segment = uB - uA;
    float travel = length(segment);
    if (travel > 0.00001) {
      float t = clamp(dot(q - uA, segment) / dot(segment, segment), 0.0, 1.0);
      float distance = length(q - (uA + segment * t));
      float weight = distance <= 3.0 * uSigma ? exp(-0.5 * pow(distance / uSigma, 2.0)) : 0.0;
      delta = segment / travel * min(travel * uStrength * weight, uMaxStep);
    }
  } else {
    // Midpoint backtrace, fixed simulation dt = 1/60 s.
    delta = velocity(q - velocity(q) / 120.0) / 60.0;
  }
  vec2 oldCoord = clamp((q - delta) / 1024.0, vec2(0.0), vec2(1.0));
  outColor = encode(mapping(vec2(oldCoord.x, 1.0 - oldCoord.y)));
}
