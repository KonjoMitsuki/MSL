#version 300 es
precision highp float;
uniform sampler2D uSurface;
uniform vec2 uCenter;
uniform float uRadius;
uniform vec3 uColor;
in vec2 vUV;
out vec4 outColor;
void main() {
  vec2 q = vec2(vUV.x, 1.0 - vUV.y) * 1024.0;
  vec2 offset = q - uCenter;
  float d2 = dot(offset, offset);
  float a2 = uRadius * uRadius;
  if (d2 < a2) {
    outColor = vec4(uColor, 1.0);
  } else {
    float scale = d2 > 0.0 ? sqrt(max(0.0, d2 - a2) / d2) : 1.0;
    vec2 oldCoord = (uCenter + offset * scale) / 1024.0;
    outColor = texture(uSurface, vec2(oldCoord.x, 1.0 - oldCoord.y));
  }
}
