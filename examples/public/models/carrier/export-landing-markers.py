# Re-export the carrier landing markers from scene.blend for the carrier-landing
# game (game/src/world/Carrier.ts loads landing-markers.gltf).
#
# The markers are:
#   • landing-runway      — a quad aligned to the angled flight-deck landing area
#   • landing-wire-origin — an empty at the centre of the 4 arresting wires
#
# They are exported ALONE (no carrier mesh) into landing-markers.gltf and loaded
# with the SAME fit transform as the carrier, so they land exactly where authored.
#
# Run (from this folder):
#   & "C:\Program Files\Blender Foundation\Blender 5.1\blender.exe" \
#       --background scene.blend --python export-landing-markers.py

import bpy, os

KEEP = {"landing-runway", "landing-wire-origin"}

for o in list(bpy.data.objects):
    if o.name not in KEEP:
        bpy.data.objects.remove(o, do_unlink=True)

# strip the runway's material so no stray texture is emitted (it's a logical
# helper, hidden at runtime)
rw = bpy.data.objects.get("landing-runway")
if rw and rw.data:
    rw.data.materials.clear()

here = os.path.dirname(bpy.data.filepath) or "."
out = os.path.join(here, "landing-markers.gltf")
bpy.ops.export_scene.gltf(
    filepath=out,
    export_format='GLTF_SEPARATE',
    use_selection=False,
    export_apply=True,
)
print("exported:", out)
