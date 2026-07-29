"""Per-character `ChibiStyle` definitions for the overworld sprites.

Colours and silhouettes mirror the concept-art prompts in `CHARACTERS`
(generate_assets.py) so the overworld sprite, the battle portrait and the
in-world description all agree.
"""

from __future__ import annotations

from .chibi import ChibiStyle

CHARACTER_STYLES: dict[str, ChibiStyle] = {
    # White hoodie, cyan circuit trim, dark cargo shorts, cyan sneakers, AR glasses up.
    'player_m': ChibiStyle(
        hair='#3c2c28', top='#f0f0f4', bottom='#38445c', shoes='#40e0f0',
        trim='#40e0f0', hair_style='short', accessory='glasses',
        accessory_color='#40e0f0', backpack=True, extras=['collar'],
    ),
    # Teal ponytail, white/magenta techwear, black leggings, magenta sneakers.
    'player_f': ChibiStyle(
        hair='#2ca8a8', top='#f4f0f4', bottom='#2c2838', shoes='#e858a0',
        trim='#e858a0', hair_style='ponytail', accessory='glasses',
        accessory_color='#40e0f0', backpack=True, extras=['collar'],
    ),
    # Spiky orange hair, orange/white bomber, light grey jeans, white high-tops.
    'rival': ChibiStyle(
        hair='#f07820', top='#f08828', bottom='#c0c4cc', shoes='#f4f4f8',
        trim='#40e0f0', hair_style='spiky', extras=['collar'],
    ),
    # Grey beard, round glasses, long white lab coat over a navy turtleneck.
    'professor': ChibiStyle(
        skin='#e8c098', hair='#b0b0b8', top='#f4f4f8', bottom='#3c4460',
        shoes='#585460', trim='#3c4460', hair_style='short',
        accessory='glasses', accessory_color='#c8d8e8',
        coat=True, beard=True, height=1, extras=['collar'],
    ),
    # Grey hoodie, jeans, sneakers, lanyard badge.
    'npc_engineer': ChibiStyle(
        hair='#4c3c34', top='#9098a8', bottom='#4868a0', shoes='#e8e8ec',
        trim='#f0d040', hair_style='short', extras=['badge'],
    ),
    # Sky-blue coveralls with yellow stripes, white hard hat, tool belt.
    'npc_technician': ChibiStyle(
        hair='#503c30', top='#78b8e0', bottom='#78b8e0', shoes='#584c40',
        trim='#f0d040', hair_style='short',
        headgear='hardhat', headgear_color='#f4f4f8',
    ),
    # Yellow tee with a robot print, blue shorts, red cap worn backwards.
    'npc_kid': ChibiStyle(
        hair='#7c5030', top='#f0d040', bottom='#3868c8', shoes='#e8e8ec',
        trim='#d83030', hair_style='short',
        headgear='cap', headgear_color='#d83030', height=-2,
    ),
    # Mint medical uniform with a white cross, short pink hair, headset.
    'npc_medic': ChibiStyle(
        hair='#f088b0', top='#a8e0c0', bottom='#f4f4f8', shoes='#f4f4f8',
        trim='#f4f4f8', hair_style='short', extras=['collar'],
    ),
    # Teal apron over a white shirt, neat brown hair.
    'npc_clerk': ChibiStyle(
        hair='#6c4c30', top='#f4f4f8', bottom='#2c8c8c', shoes='#584c40',
        trim='#2c8c8c', hair_style='short', extras=['apron'],
    ),
    # Steel-grey uniform, cyan shoulder trim, white helmet with a blue visor.
    'npc_guard': ChibiStyle(
        top='#b0b8c8', bottom='#98a0b0', shoes='#f4f4f8', trim='#40e0f0',
        hair_style='bald', headgear='helmet', headgear_color='#f4f4f8',
        accessory='visor', accessory_color='#4898e0', height=1,
    ),
    # Lavender cardigan, cream blouse, long teal skirt, hair in a loose bun.
    'mom': ChibiStyle(
        hair='#4c3830', top='#c0a8e0', bottom='#2c8c94', shoes='#8c6c50',
        trim='#f4ecd8', hair_style='bun', coat=True,
    ),
    # Yellow twin-tails, electric-blue jumpsuit, yellow cable trim, goggles up.
    'leader_volt': ChibiStyle(
        hair='#f0d040', top='#3868c8', bottom='#3868c8', shoes='#f0d040',
        trim='#f8e858', hair_style='ponytail',
        accessory='goggles', accessory_color='#f0d040', extras=['collar'],
    ),
    # Frost-white parka over a chrome exosuit with pale-blue coolant lines.
    'leader_cryo': ChibiStyle(
        hair='#6c90b8', top='#f0f4f8', bottom='#b8c4d0', shoes='#88d8f8',
        trim='#88d8f8', hair_style='long', coat=True, height=1,
        extras=['collar'],
    ),
    # Violet/white hooded techwear, orange glowing seams, violet visor.
    'leader_thermal': ChibiStyle(
        hair='#3c2c40', top='#8850c0', bottom='#f0f0f4', shoes='#f4f4f8',
        trim='#f08828', hair_style='short', headgear='hood',
        headgear_color='#8850c0', accessory='visor', accessory_color='#f08828',
        coat=True, extras=['collar'],
    ),
    # Long white and gold coat, cyan data trim, silver hair, high collar.
    'champion': ChibiStyle(
        hair='#b0b4c8', top='#f4f4f8', bottom='#e0c060', shoes='#e0c060',
        trim='#40e0f0', hair_style='short', coat=True, height=1,
        extras=['collar', 'badge'],
    ),
}
