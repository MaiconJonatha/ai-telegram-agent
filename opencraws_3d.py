"""
Opencraws 3D Robot - Blender Script
Cria um robô crustáceo 3D e exporta como GLB para usar na web com Three.js
"""
import bpy
import math
import os

# Limpar cena
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()

# ── Materiais ──
def create_material(name, color, metallic=0.2, roughness=0.5, emission=None, emission_strength=2.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    bsdf = nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if emission:
        bsdf.inputs["Emission Color"].default_value = emission
        bsdf.inputs["Emission Strength"].default_value = emission_strength
    return mat

# Materiais - OpenClaw red theme
mat_body = create_material("Body", (0.55, 0.1, 0.1, 1), metallic=0.2, roughness=0.5,
                           emission=(0.55, 0.1, 0.1, 1), emission_strength=0.1)
mat_body_light = create_material("BodyLight", (0.6, 0.2, 0.2, 1), metallic=0.2, roughness=0.5,
                                 emission=(0.6, 0.2, 0.2, 1), emission_strength=0.1)
mat_cyan = create_material("Cyan", (0, 0.9, 0.8, 1), metallic=0.2, roughness=0.5,
                           emission=(0, 0.9, 0.8, 1), emission_strength=3.0)
mat_orange = create_material("Orange", (1, 0.27, 0.27, 1), metallic=0.2, roughness=0.5,
                             emission=(1, 0.27, 0.27, 1), emission_strength=2.0)
mat_eye_socket = create_material("EyeSocket", (0.08, 0.08, 0.12, 1), metallic=0.2, roughness=0.5)
mat_eye_glow = create_material("EyeGlow", (0, 0.9, 0.8, 1), metallic=0.2, roughness=0.5,
                               emission=(0, 0.9, 0.8, 1), emission_strength=5.0)
mat_dark = create_material("Dark", (0.05, 0.05, 0.08, 1), metallic=0.2, roughness=0.5)
mat_mouth = create_material("Mouth", (0.1, 0.1, 0.15, 1), metallic=0.2, roughness=0.5)
mat_lip = create_material("Lip", (0.2, 0.2, 0.28, 1), metallic=0.2, roughness=0.5)

# ── Cabeça (formato oval/ovo de caranguejo) ──
bpy.ops.mesh.primitive_uv_sphere_add(radius=1.2, segments=64, ring_count=32, location=(0, 0, 0))
head = bpy.context.object
head.name = "Head"
head.scale = (1.0, 0.85, 1.15)
head.data.materials.append(mat_body)

# Shell superior (casco de caranguejo)
bpy.ops.mesh.primitive_uv_sphere_add(radius=1.25, segments=32, ring_count=16, location=(0, 0, 0.15))
shell = bpy.context.object
shell.name = "Shell"
shell.scale = (1.05, 0.88, 0.6)
shell.data.materials.append(mat_body_light)

# ── Olhos ──
for side in [-1, 1]:
    x = side * 0.45

    # Socket do olho
    bpy.ops.mesh.primitive_cylinder_add(radius=0.32, depth=0.2, location=(x, -0.75, 0.15))
    socket = bpy.context.object
    socket.name = f"EyeSocket_{'L' if side < 0 else 'R'}"
    socket.rotation_euler = (math.radians(90), 0, 0)
    socket.data.materials.append(mat_eye_socket)

    # Anel externo do olho
    bpy.ops.mesh.primitive_torus_add(major_radius=0.33, minor_radius=0.03, location=(x, -0.82, 0.15))
    ring = bpy.context.object
    ring.name = f"EyeRing_{'L' if side < 0 else 'R'}"
    ring.rotation_euler = (math.radians(90), 0, 0)
    ring.data.materials.append(mat_cyan)

    # Globo ocular (lente)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.22, location=(x, -0.85, 0.15))
    eye = bpy.context.object
    eye.name = f"Eye_{'L' if side < 0 else 'R'}"
    eye.data.materials.append(mat_eye_glow)

    # Pupila
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.1, location=(x, -0.92, 0.15))
    pupil = bpy.context.object
    pupil.name = f"Pupil_{'L' if side < 0 else 'R'}"
    pupil.data.materials.append(mat_dark)

    # Pálpebra superior
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.34, location=(x, -0.76, 0.35))
    eyelid = bpy.context.object
    eyelid.name = f"Eyelid_{'L' if side < 0 else 'R'}"
    eyelid.scale = (1, 0.5, 0.4)
    eyelid.data.materials.append(mat_body)

# ── Boca ──
# Área da boca (recesso)
bpy.ops.mesh.primitive_cube_add(size=0.5, location=(0, -0.85, -0.45))
mouth_area = bpy.context.object
mouth_area.name = "MouthArea"
mouth_area.scale = (0.8, 0.15, 0.2)
mouth_area.data.materials.append(mat_mouth)

# Lábio superior
bpy.ops.mesh.primitive_cylinder_add(radius=0.35, depth=0.06, location=(0, -0.88, -0.35))
upper_lip = bpy.context.object
upper_lip.name = "UpperLip"
upper_lip.rotation_euler = (math.radians(90), 0, 0)
upper_lip.scale = (1, 1, 0.15)
upper_lip.data.materials.append(mat_lip)

# Lábio inferior
bpy.ops.mesh.primitive_cylinder_add(radius=0.3, depth=0.06, location=(0, -0.88, -0.55))
lower_lip = bpy.context.object
lower_lip.name = "LowerLip"
lower_lip.rotation_euler = (math.radians(90), 0, 0)
lower_lip.scale = (0.9, 1, 0.15)
lower_lip.data.materials.append(mat_lip)

# ── Antenas ──
for side in [-1, 1]:
    x = side * 0.3

    # Haste da antena
    bpy.ops.mesh.primitive_cylinder_add(radius=0.025, depth=0.8, location=(x, -0.1, 1.1))
    antenna = bpy.context.object
    antenna.name = f"Antenna_{'L' if side < 0 else 'R'}"
    antenna.rotation_euler = (0, math.radians(side * 20), 0)
    antenna.data.materials.append(mat_body_light)

    # Ponta da antena (bola brilhante)
    tip_x = x + side * 0.28
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.06, location=(tip_x, -0.1, 1.45))
    tip = bpy.context.object
    tip.name = f"AntennaTip_{'L' if side < 0 else 'R'}"
    tip.data.materials.append(mat_cyan)

# ── Garras ──
for side in [-1, 1]:
    x = side * 1.5

    # Braço
    bpy.ops.mesh.primitive_cylinder_add(radius=0.08, depth=0.5, location=(side * 1.1, -0.2, -0.1))
    arm = bpy.context.object
    arm.name = f"Arm_{'L' if side < 0 else 'R'}"
    arm.rotation_euler = (0, math.radians(90), math.radians(side * 10))
    arm.data.materials.append(mat_body)

    # Garra superior
    bpy.ops.mesh.primitive_cube_add(size=0.3, location=(x, -0.2, 0.05))
    claw_top = bpy.context.object
    claw_top.name = f"ClawTop_{'L' if side < 0 else 'R'}"
    claw_top.scale = (0.8, 0.3, 0.15)
    claw_top.rotation_euler = (0, 0, math.radians(side * -15))
    claw_top.data.materials.append(mat_orange)

    # Garra inferior
    bpy.ops.mesh.primitive_cube_add(size=0.3, location=(x, -0.2, -0.2))
    claw_bot = bpy.context.object
    claw_bot.name = f"ClawBot_{'L' if side < 0 else 'R'}"
    claw_bot.scale = (0.7, 0.3, 0.12)
    claw_bot.rotation_euler = (0, 0, math.radians(side * 10))
    claw_bot.data.materials.append(mat_orange)

# ── Detalhes do corpo ──
# Faixa laranja na testa
bpy.ops.mesh.primitive_cylinder_add(radius=1.05, depth=0.04, location=(0, 0, 0.55))
stripe = bpy.context.object
stripe.name = "Stripe"
stripe.rotation_euler = (math.radians(90), 0, 0)
stripe.scale = (0.6, 1, 0.08)
stripe.data.materials.append(mat_orange)

# Linhas de painel nas bochechas
for side in [-1, 1]:
    bpy.ops.mesh.primitive_cylinder_add(radius=0.01, depth=0.5, location=(side * 0.8, -0.5, -0.1))
    line = bpy.context.object
    line.name = f"PanelLine_{'L' if side < 0 else 'R'}"
    line.rotation_euler = (math.radians(70), 0, math.radians(side * 20))
    line.data.materials.append(mat_cyan)

# ── Luz e Câmera ──
# Luz principal
bpy.ops.object.light_add(type='AREA', radius=3, location=(0, -3, 2))
light = bpy.context.object
light.name = "KeyLight"
light.data.energy = 200
light.data.color = (0.9, 0.95, 1.0)
light.rotation_euler = (math.radians(60), 0, 0)

# Luz de preenchimento
bpy.ops.object.light_add(type='AREA', radius=2, location=(2, -1, 1))
fill = bpy.context.object
fill.name = "FillLight"
fill.data.energy = 50
fill.data.color = (0, 0.8, 1.0)

# Luz de contorno
bpy.ops.object.light_add(type='AREA', radius=2, location=(-2, 1, 2))
rim = bpy.context.object
rim.name = "RimLight"
rim.data.energy = 80
rim.data.color = (1, 0.4, 0.2)

# Câmera
bpy.ops.object.camera_add(location=(0, -4, 0.3))
cam = bpy.context.object
cam.name = "Camera"
cam.rotation_euler = (math.radians(85), 0, 0)
cam.data.lens = 50
bpy.context.scene.camera = cam

# ── Configurações de render ──
bpy.context.scene.render.engine = 'BLENDER_EEVEE'
bpy.context.scene.render.resolution_x = 1920
bpy.context.scene.render.resolution_y = 1080
bpy.context.scene.render.film_transparent = True

# ── Exportar GLB ──
output_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "opencraws_robot.glb")
bpy.ops.export_scene.gltf(
    filepath=output_path,
    export_format='GLB',
    use_selection=False,
    export_lights=True,
    export_cameras=True
)

print(f"\n✅ Modelo 3D exportado: {output_path}")
print("Agora use Three.js para renderizar no navegador!")
