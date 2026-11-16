#version 300 es
precision highp float;
uniform sampler2D uSurface;
uniform vec2 uCenter;
uniform float uRadius;
uniform vec3 uColor;
uniform float uWaterFade;
in vec2 vUV;
out vec4 outColor;

void main() {
  vec2 q = vec2(vUV.x, 1.0 - vUV.y) * 1024.0;
  vec2 offset = q - uCenter;
  float d2 = dot(offset, offset);
  float a2 = uRadius * uRadius;

  if (d2 < a2) {
    float alpha = 1.0;
    if (uWaterFade > 0.0 && uRadius > 0.0) {
      // Pigment stays labelled by its exact RGB. Only the alpha thins outward,
      // so display compositing reveals water without creating blended pigments.
      float radial = clamp(sqrt(d2) / uRadius, 0.0, 1.0);
      // Keep the core opaque and concentrate the fade in the outer third. This
      // avoids eroding earlier dabs when continuous drops overlap.
      float thinning = pow(smoothstep(0.6, 1.0, radial), 1.5);
      alpha = 1.0 - 0.9 * uWaterFade * thinning;
    }
    outColor = vec4(uColor, alpha);
  } else {
    float scale = d2 > 0.0 ? sqrt(max(0.0, d2 - a2) / d2) : 1.0;
    vec2 oldCoord = (uCenter + offset * scale) / 1024.0;
    outColor = texture(uSurface, vec2(oldCoord.x, 1.0 - oldCoord.y));
  }
}
