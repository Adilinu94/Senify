import re, os
os.chdir(r"C:/Users/adini/FramerExport/framer-fluffy-rectangle-418998")
wave = open("scripts/vendor/WaveBackground.pi3OodLN.mjs", encoding="utf-8").read()
# WaveBackground exports: export { l as n, c as t }  -> l init fn, c component fn
# consumer imports { n as F, t as I }: F = init, I = the React component
# I is used as i(I, {height, id, layoutId, style, width}) -> the canvas mounts itself.
# Confirm the component creates a canvas:
for kw in ["createElement(`canvas`", "createElement(`style`", "WebGLRenderer", "ShaderMaterial", "iResolution"]:
    print(kw, "->", wave.count(kw))
# and the internal component is `t` in export? check tail again
print(wave[-120:])
