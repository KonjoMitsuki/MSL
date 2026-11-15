#version 300 es
precision highp float;
uniform sampler2D uSurface;
uniform sampler2D uMap;
in vec2 vUV;
out vec4 outColor;
void main() {
  vec4 bytes = floor(texture(uMap, vUV) * 255.0 + 0.5);
  vec2 uv = vec2(bytes.r * 256.0 + bytes.g, bytes.b * 256.0 + bytes.a) / 65535.0;
  // Only coordinates interpolate. Pigment always comes from the original snapshot.
  outColor = texture(uSurface, uv);
}
