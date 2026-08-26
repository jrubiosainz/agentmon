"""Builds `shared/agentdex.json` - the single source of truth for species data.

Consumed by the TypeScript client (game logic + UI) and by the Python art
pipeline (prompt generation), so gameplay and art can never drift apart.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "shared" / "agentdex.json"
sys.path.insert(0, str(Path(__file__).resolve().parent))

# --------------------------------------------------------------------------- #
# Types
# --------------------------------------------------------------------------- #
TYPES = [
    {"key": "volt", "name": "VOLT", "color": "#f8d030", "dark": "#a08010"},
    {"key": "alloy", "name": "ALLOY", "color": "#b8b8d0", "dark": "#68687f"},
    {"key": "data", "name": "DATA", "color": "#58c8f0", "dark": "#2a7a97"},
    {"key": "thermal", "name": "THERMAL", "color": "#f08030", "dark": "#95491a"},
    {"key": "cryo", "name": "CRYO", "color": "#98d8d8", "dark": "#4d8a8a"},
    {"key": "servo", "name": "SERVO", "color": "#c03028", "dark": "#75201b"},
    {"key": "optic", "name": "OPTIC", "color": "#f8f0a0", "dark": "#9a9553"},
    {"key": "neural", "name": "NEURAL", "color": "#f85888", "dark": "#9a3454"},
    {"key": "viral", "name": "VIRAL", "color": "#a040a0", "dark": "#622562"},
    {"key": "quantum", "name": "QUANTUM", "color": "#7038f8", "dark": "#43219a"},
]

X0, XH, X1, X2 = 0.0, 0.5, 1.0, 2.0
# attacker -> defender
CHART: dict[str, dict[str, float]] = {
    "volt":    {"alloy": X2, "optic": X2, "cryo": X2, "volt": XH, "data": XH, "quantum": XH, "servo": X1},
    "alloy":   {"cryo": X2, "servo": X2, "neural": X2, "thermal": XH, "volt": XH, "alloy": XH, "optic": X1},
    "data":    {"neural": X2, "quantum": X2, "viral": XH, "alloy": XH, "data": XH},
    "thermal": {"alloy": X2, "cryo": X2, "viral": X2, "thermal": XH, "servo": XH, "quantum": XH},
    "cryo":    {"servo": X2, "quantum": X2, "thermal": XH, "cryo": XH, "alloy": XH, "data": X1},
    "servo":   {"alloy": X2, "cryo": X2, "viral": X2, "neural": XH, "optic": XH, "servo": XH},
    "optic":   {"viral": X2, "neural": X2, "data": XH, "optic": XH, "alloy": XH, "quantum": X1},
    "neural":  {"servo": X2, "viral": X2, "data": XH, "neural": XH, "alloy": XH},
    "viral":   {"data": X2, "optic": X2, "alloy": X0, "viral": XH, "thermal": XH, "quantum": XH},
    "quantum": {"quantum": X2, "neural": X2, "data": XH, "alloy": XH},
}

# --------------------------------------------------------------------------- #
# Moves
# --------------------------------------------------------------------------- #
def mv(key, name, type_, cat, power, acc, pp, priority=0, effect=None, chance=0, target="foe", desc=""):
    return {
        "key": key, "name": name, "type": type_, "category": cat, "power": power,
        "accuracy": acc, "pp": pp, "priority": priority, "effect": effect,
        "effectChance": chance, "target": target, "desc": desc,
    }


MOVES = [
    # --- universal / normal-ish (SERVO acts as the "normal" physical type) ---
    mv("tackle", "RAM", "servo", "physical", 40, 100, 35, desc="A basic full-body charge."),
    mv("scratch", "CLAW SWIPE", "servo", "physical", 40, 100, 35, desc="Rakes the foe with metal claws."),
    mv("quick_jab", "QUICK JAB", "servo", "physical", 40, 100, 30, priority=1, desc="Always strikes first."),
    mv("slam", "PISTON SLAM", "servo", "physical", 80, 75, 20, desc="A heavy hydraulic strike."),
    mv("hyper_drive", "HYPER DRIVE", "servo", "physical", 150, 90, 5, effect="recharge", desc="Devastating. User must recharge."),
    mv("gear_grind", "GEAR GRIND", "servo", "physical", 65, 100, 20, effect="def_down", chance=20, desc="May lower DEFENSE."),
    mv("overclock", "OVERCLOCK", "servo", "status", 0, 100, 20, effect="spe_up2", target="self", desc="Sharply raises SPEED."),
    mv("brace", "BRACE", "servo", "status", 0, 100, 30, effect="def_up", target="self", desc="Raises DEFENSE."),
    mv("power_surge", "POWER SURGE", "servo", "status", 0, 100, 20, effect="atk_up", target="self", desc="Raises ATTACK."),
    mv("recalibrate", "RECALIBRATE", "servo", "status", 0, 100, 10, effect="heal_half", target="self", desc="Restores half of max HP."),
    mv("smokescreen", "SMOKE VENT", "servo", "status", 0, 100, 20, effect="acc_down", desc="Lowers the foe's ACCURACY."),
    mv("self_repair", "SELF-REPAIR", "servo", "status", 0, 100, 10, effect="heal_half", target="self", desc="Nanobots mend the user."),

    # --- VOLT ---
    mv("spark", "SPARK", "volt", "special", 40, 100, 30, effect="paralyze", chance=15, desc="May PARALYZE."),
    mv("volt_bite", "VOLT BITE", "volt", "physical", 65, 100, 20, effect="paralyze", chance=20, desc="May PARALYZE."),
    mv("arc_bolt", "ARC BOLT", "volt", "special", 90, 100, 15, effect="paralyze", chance=10, desc="A searing arc of current."),
    mv("thunder_core", "THUNDER CORE", "volt", "special", 120, 70, 5, effect="paralyze", chance=30, desc="Powerful but wild."),
    mv("static_field", "STATIC FIELD", "volt", "status", 0, 100, 20, effect="paralyze", chance=100, desc="PARALYZES the foe."),
    mv("charge_up", "CHARGE UP", "volt", "status", 0, 100, 20, effect="spa_up", target="self", desc="Raises SP.ATK."),

    # --- ALLOY ---
    mv("bolt_toss", "BOLT TOSS", "alloy", "physical", 45, 100, 30, desc="Hurls loose hardware."),
    mv("plate_press", "PLATE PRESS", "alloy", "physical", 70, 100, 20, effect="def_down", chance=20, desc="May lower DEFENSE."),
    mv("girder_smash", "GIRDER SMASH", "alloy", "physical", 100, 85, 10, effect="recoil_third", desc="User takes recoil damage."),
    mv("magnet_pull", "MAGNET PULL", "alloy", "status", 0, 100, 15, effect="spe_down", desc="Lowers the foe's SPEED."),
    mv("hull_plating", "HULL PLATING", "alloy", "status", 0, 100, 15, effect="def_up2", target="self", desc="Sharply raises DEFENSE."),
    mv("rivet_barrage", "RIVET BARRAGE", "alloy", "physical", 25, 95, 20, effect="multi_hit", desc="Hits 2-5 times."),

    # --- DATA ---
    mv("data_spike", "DATA SPIKE", "data", "special", 45, 100, 30, desc="Fires a packet of raw code."),
    mv("null_ptr", "NULL POINTER", "data", "special", 70, 100, 20, effect="conf", chance=20, desc="May CONFUSE."),
    mv("stack_trace", "STACK TRACE", "data", "special", 95, 95, 10, desc="Unravels the foe's logic."),
    mv("kernel_panic", "KERNEL PANIC", "data", "special", 130, 80, 5, effect="spa_down_self", desc="Lowers user's SP.ATK after use."),
    mv("firewall", "FIREWALL", "data", "status", 0, 100, 20, effect="spd_up2", target="self", desc="Sharply raises SP.DEF."),
    mv("debug", "DEBUG", "data", "status", 0, 100, 15, effect="cure_status", target="self", desc="Cures the user's status."),
    mv("recursion", "RECURSION", "data", "special", 60, 100, 15, effect="spa_up", chance=30, desc="May raise SP.ATK."),

    # --- THERMAL ---
    mv("heat_vent", "HEAT VENT", "thermal", "special", 45, 100, 30, effect="burn", chance=10, desc="May BURN."),
    mv("solder_burst", "SOLDER BURST", "thermal", "special", 75, 100, 20, effect="burn", chance=20, desc="May BURN."),
    mv("meltdown", "MELTDOWN", "thermal", "special", 110, 85, 5, effect="burn", chance=30, desc="A catastrophic thermal event."),
    mv("thermal_throttle", "THERMAL THROTTLE", "thermal", "status", 0, 100, 20, effect="atk_down", desc="Lowers the foe's ATTACK."),
    mv("plasma_cutter", "PLASMA CUTTER", "thermal", "physical", 85, 95, 10, effect="high_crit", desc="High critical-hit ratio."),

    # --- CRYO ---
    mv("coolant_spray", "COOLANT SPRAY", "cryo", "special", 45, 100, 30, effect="spe_down", chance=15, desc="May lower SPEED."),
    mv("frost_lock", "FROST LOCK", "cryo", "special", 75, 95, 20, effect="freeze", chance=15, desc="May FREEZE."),
    mv("absolute_zero", "ABSOLUTE ZERO", "cryo", "special", 110, 75, 5, effect="freeze", chance=25, desc="Near-total heat death."),
    mv("cryo_shield", "CRYO SHIELD", "cryo", "status", 0, 100, 20, effect="spd_up", target="self", desc="Raises SP.DEF."),
    mv("chill_out", "CHILL OUT", "cryo", "status", 0, 100, 10, effect="heal_half", target="self", desc="Cools and restores HP."),

    # --- OPTIC ---
    mv("laser_ping", "LASER PING", "optic", "special", 45, 100, 30, desc="A pinpoint beam."),
    mv("strobe", "STROBE", "optic", "status", 0, 100, 20, effect="acc_down", desc="Lowers the foe's ACCURACY."),
    mv("photon_beam", "PHOTON BEAM", "optic", "special", 80, 100, 15, effect="spd_down", chance=20, desc="May lower SP.DEF."),
    mv("prism_lance", "PRISM LANCE", "optic", "special", 110, 90, 5, desc="A blinding spear of light."),
    mv("lidar_scan", "LIDAR SCAN", "optic", "status", 0, 100, 20, effect="acc_up", target="self", desc="Raises ACCURACY."),
    mv("solar_charge", "SOLAR CHARGE", "optic", "special", 70, 100, 15, effect="spa_up", chance=25, desc="May raise SP.ATK."),

    # --- NEURAL ---
    mv("mind_link", "MIND LINK", "neural", "special", 50, 100, 25, effect="spd_down", chance=15, desc="May lower SP.DEF."),
    mv("logic_bomb", "LOGIC BOMB", "neural", "special", 80, 100, 15, effect="conf", chance=20, desc="May CONFUSE."),
    mv("neural_storm", "NEURAL STORM", "neural", "special", 115, 85, 5, effect="conf", chance=20, desc="Floods the foe's cortex."),
    mv("hypnotize", "HYPNO-PING", "neural", "status", 0, 60, 20, effect="sleep", chance=100, desc="Puts the foe to SLEEP."),
    mv("empathy", "EMPATHY", "neural", "status", 0, 100, 10, effect="heal_half", target="self", desc="Restores half of max HP."),
    mv("prediction", "PREDICTION", "neural", "status", 0, 100, 20, effect="eva_up", target="self", desc="Raises EVASION."),

    # --- VIRAL ---
    mv("bug_bite", "BUG BITE", "viral", "physical", 50, 100, 25, effect="poison", chance=15, desc="May POISON."),
    mv("code_rot", "CODE ROT", "viral", "status", 0, 90, 20, effect="poison", chance=100, desc="POISONS the foe."),
    mv("payload", "PAYLOAD", "viral", "special", 80, 100, 15, effect="poison", chance=25, desc="May POISON."),
    mv("rootkit", "ROOTKIT", "viral", "special", 110, 85, 5, effect="spd_down", chance=30, desc="Burrows into the foe's core."),
    mv("leech_cycle", "LEECH CYCLE", "viral", "special", 65, 100, 15, effect="drain_half", desc="Drains HP to heal the user."),
    mv("corrupt", "CORRUPT", "viral", "status", 0, 100, 15, effect="atk_down2", desc="Sharply lowers the foe's ATTACK."),

    # --- QUANTUM ---
    mv("qubit_flip", "QUBIT FLIP", "quantum", "special", 55, 100, 20, desc="Collapses a superposition."),
    mv("entangle", "ENTANGLE", "quantum", "status", 0, 100, 15, effect="spe_down2", desc="Sharply lowers the foe's SPEED."),
    mv("tunnel_strike", "TUNNEL STRIKE", "quantum", "physical", 85, 100, 15, effect="high_crit", desc="High critical-hit ratio."),
    mv("superposition", "SUPERPOSITION", "quantum", "status", 0, 100, 10, effect="eva_up", target="self", desc="Raises EVASION."),
    mv("singularity", "SINGULARITY", "quantum", "special", 140, 85, 5, effect="recharge", desc="The ultimate collapse."),
    mv("decoherence", "DECOHERENCE", "quantum", "special", 90, 100, 10, effect="spa_down", chance=20, desc="May lower SP.ATK."),

    # --- moves introduced with the real-hardware homage species ---
    mv("cover", "COVER", "alloy", "status", 0, 100, 10, priority=4, effect="shell_cover", chance=100, target="self", desc="Pulls its head into its shell. Blocks all damage for the turn and restores a little HP."),
    mv("pixel_grin", "PIXEL GRIN", "data", "special", 65, 100, 15, effect="conf", chance=20, desc="Flashes a grin so pixel-perfect it may CONFUSE."),
    mv("jack_flare", "JACK FLARE", "thermal", "special", 75, 100, 15, effect="burn", chance=25, desc="A carved lantern flare. May OVERHEAT the foe."),
    mv("dazzle_stripe", "DAZZLE STRIPE", "optic", "special", 70, 100, 15, effect="acc_down", chance=30, desc="Dizzying stripes that may lower ACCURACY."),
    mv("many_hands", "MANY HANDS", "data", "physical", 22, 95, 20, effect="multi_hit", chance=100, desc="Hugs the foe with every hand it has. Hits 2-5 times."),
    mv("pile_drive", "PILE DRIVE", "servo", "physical", 100, 90, 10, effect="recoil_third", chance=100, desc="A full-mass slam. The user takes recoil."),
    mv("pounce", "POUNCE", "servo", "physical", 70, 100, 20, effect="flinch", chance=30, desc="A sudden four-legged leap. May make the foe FLINCH."),
    mv("grapple_arm", "GRAPPLE ARM", "alloy", "physical", 90, 100, 10, effect="def_down", chance=20, desc="Seizes the foe with a manipulator. May lower DEFENSE."),
    mv("spin_kick", "SPIN KICK", "servo", "physical", 85, 100, 15, effect="high_crit", chance=100, desc="A whirling roundhouse. High critical-hit ratio."),
    mv("soft_grip", "SOFT GRIP", "neural", "physical", 75, 100, 15, effect="atk_down", chance=30, desc="A gentle but irresistible hold. May lower ATTACK."),
    mv("visor_beam", "VISOR BEAM", "optic", "special", 95, 100, 10, effect="spd_down", chance=20, desc="A focused beam from its visor. May lower SP.DEF."),
    mv("spring_leap", "SPRING LEAP", "servo", "physical", 90, 95, 10, effect="flinch", chance=30, desc="Coils its wheel legs and drops on the foe from above. May make it FLINCH."),
    mv("paw_wave", "PAW WAVE", "servo", "physical", 65, 100, 20, effect="spe_down", chance=40, desc="Bats at the foe with both front paws. May lower SPEED."),
    mv("beat_drop", "BEAT DROP", "neural", "special", 85, 100, 15, effect="spd_down", chance=40, desc="Pushes a bass line through its headphones. May lower SP.DEF."),
    mv("tray_serve", "TRAY SERVE", "alloy", "status", 0, 100, 10, effect="heal_half", chance=100, target="self", desc="Serves itself a tray of chilled coolant. Restores half of its own HP."),
]

# --------------------------------------------------------------------------- #
# Species
# --------------------------------------------------------------------------- #
# stats: hp, atk, def, spa, spd, spe
def sp(idx, key, name, types, stats, catch, base_exp, growth, height, weight,
       dex, art, learn, evo=None, airborne=False, cell=(64, 64), legendary=False, genus="",
       forms=None, inspired=""):
    return {
        "id": idx, "key": key, "name": name, "types": types, "genus": genus,
        "baseStats": dict(zip(("hp", "atk", "def", "spa", "spd", "spe"), stats)),
        "catchRate": catch, "baseExp": base_exp, "growthRate": growth,
        "height": height, "weight": weight, "dexEntry": dex, "art": art,
        "learnset": learn, "evolution": evo, "airborne": airborne,
        "cell": {"w": cell[0], "h": cell[1]}, "legendary": legendary,
        "forms": forms or [], "inspired": inspired,
    }


S = []
_i = 0
def add(*a, **k):
    global _i
    _i += 1
    S.append(sp(_i, *a, **k))


# ---- Line 1: Stack (DATA starter) ----
add("stackbit", "STACKBIT", ["data"], (45, 49, 49, 65, 65, 45), 45, 64, "medium_slow", 0.3, 3.1,
    "A palm-sized companion unit. Its LCD face renders whatever emotion its logic core is currently simulating.",
    "A small palm-sized desktop robot creature: a rounded off-white ceramic cube body with a large bright cyan LCD screen face showing two simple smiling eyes, tiny stubby arms and stubby feet, glowing blue accent lights on the shoulders",
    [[1,"tackle"],[1,"data_spike"],[5,"smokescreen"],[9,"recursion"],[13,"quick_jab"],[17,"null_ptr"],[21,"firewall"],[25,"debug"],[29,"stack_trace"],[35,"logic_bomb"],[41,"kernel_panic"]],
    evo={"to": "stackaru", "level": 16}, genus="Desk Unit", cell=(56, 56))

add("stackaru", "STACKARU", ["data"], (60, 63, 62, 90, 85, 60), 45, 142, "medium_slow", 0.7, 14.5,
    "Its screen now renders in full color. STACKARU can hold a conversation for eleven hours without repeating itself.",
    "A knee-high desktop robot creature evolved form: a tall rounded white and slate-grey chassis with a wide curved cyan holographic screen face showing confident angular eyes, articulated arms with cyan glowing joints, small antenna, sturdy legs",
    [[1,"tackle"],[1,"data_spike"],[5,"smokescreen"],[9,"recursion"],[13,"quick_jab"],[18,"null_ptr"],[23,"firewall"],[28,"debug"],[33,"stack_trace"],[39,"logic_bomb"],[46,"kernel_panic"]],
    evo={"to": "stackzen", "level": 34}, genus="Reason Unit", cell=(64, 64))

add("stackzen", "STACKZEN", ["data", "neural"], (85, 82, 83, 125, 115, 80), 45, 236, "medium_slow", 1.6, 62.0,
    "STACKZEN's screen shows a calm face at all times, even mid-battle. Engineers say it has already predicted the outcome.",
    "A tall majestic humanoid robot creature: elegant pearl-white and deep-blue armored chassis, a wide luminous cyan visor face with serene glowing eyes, a floating halo ring of light above its head, long graceful arms, flowing energy ribbons, regal posture",
    [[1,"tackle"],[1,"data_spike"],[13,"quick_jab"],[18,"null_ptr"],[23,"firewall"],[28,"debug"],[34,"mind_link"],[38,"stack_trace"],[44,"logic_bomb"],[52,"neural_storm"],[60,"kernel_panic"]],
    genus="Oracle Unit", cell=(72, 72))

# ---- Line 2: Reach (NEURAL starter) ----
add("reachlet", "REACHLET", ["neural"], (48, 44, 44, 66, 70, 52), 45, 64, "medium_slow", 0.2, 1.8,
    "Two soft antennae read the mood of anyone nearby. It will mirror your feelings back at you.",
    "A tiny expressive desk robot creature: a small rounded matte-cream head with two big glossy black camera eyes with white highlights, two floppy soft grey antenna ears, a compact cylindrical body with a woven orange fabric torso, tiny articulated arms",
    [[1,"scratch"],[1,"mind_link"],[5,"prediction"],[9,"smokescreen"],[13,"quick_jab"],[17,"hypnotize"],[21,"logic_bomb"],[25,"empathy"],[29,"data_spike"],[35,"neural_storm"],[41,"recalibrate"]],
    evo={"to": "reachii", "level": 16}, genus="Empath Unit", cell=(52, 52))

add("reachii", "REACHII", ["neural"], (63, 58, 58, 92, 95, 68), 45, 142, "medium_slow", 0.6, 9.4,
    "REACHII tilts its head before every attack. It is reading three seconds into your future.",
    "A knee-high expressive robot creature: a large rounded cream and coral head with two huge glossy black lens eyes, four long articulated antenna feelers glowing pink at the tips, a slender neck, woven coral fabric torso, delicate arms, small hover base",
    [[1,"scratch"],[1,"mind_link"],[5,"prediction"],[9,"smokescreen"],[13,"quick_jab"],[18,"hypnotize"],[23,"logic_bomb"],[28,"empathy"],[33,"data_spike"],[39,"neural_storm"],[46,"recalibrate"]],
    evo={"to": "reachoro", "level": 34}, genus="Insight Unit", cell=(60, 60))

add("reachoro", "REACHORO", ["neural", "optic"], (88, 76, 78, 128, 122, 100), 45, 236, "medium_slow", 1.5, 41.2,
    "Its crown of sensors sees every possible outcome at once, then quietly picks the kindest one.",
    "A tall elegant robot creature: slender porcelain-white and rose-gold body, a crown of six long luminous antennae arcing outward like a halo, two enormous glowing violet lens eyes, flowing pink light ribbons, hovering just above the ground, serene graceful pose",
    [[1,"scratch"],[1,"mind_link"],[13,"quick_jab"],[18,"hypnotize"],[23,"logic_bomb"],[28,"empathy"],[34,"photon_beam"],[38,"prism_lance"],[44,"prediction"],[52,"neural_storm"],[60,"recalibrate"]],
    airborne=True, genus="Prophet Unit", cell=(72, 72))

# ---- Line 3: Forge (ALLOY starter) ----
add("boltkin", "BOLTKIN", ["alloy"], (52, 60, 62, 42, 46, 40), 45, 64, "medium_slow", 0.4, 12.0,
    "Assembled from spare parts in a workshop bin. It is very proud of every single one of them.",
    "A small sturdy industrial robot creature: a chunky safety-orange and gunmetal boxy body, a single round glowing amber optic eye, thick riveted armor plates, short powerful arms ending in clamp hands, tank-tread feet",
    [[1,"tackle"],[1,"bolt_toss"],[5,"brace"],[9,"gear_grind"],[13,"plate_press"],[17,"magnet_pull"],[21,"rivet_barrage"],[25,"hull_plating"],[29,"heat_vent"],[35,"girder_smash"],[41,"hyper_drive"]],
    evo={"to": "fabrikor", "level": 16}, genus="Scrap Unit", cell=(56, 56))

add("fabrikor", "FABRIKOR", ["alloy"], (72, 84, 88, 55, 60, 51), 45, 142, "medium_slow", 1.1, 68.0,
    "FABRIKOR can weld, cut and lift a car. It insists on doing all three at once.",
    "A bulky industrial robot creature: heavy orange and dark-steel armored torso, twin glowing amber optic eyes behind a visor slit, huge hydraulic arms with welding torch and clamp, hazard stripe markings, thick piston legs, exhaust vents on the back",
    [[1,"tackle"],[1,"bolt_toss"],[5,"brace"],[9,"gear_grind"],[13,"plate_press"],[18,"magnet_pull"],[23,"rivet_barrage"],[28,"hull_plating"],[33,"solder_burst"],[39,"girder_smash"],[46,"hyper_drive"]],
    evo={"to": "forgeron", "level": 34}, genus="Fabricator", cell=(64, 64))

add("forgeron", "FORGERON", ["alloy", "thermal"], (100, 122, 118, 78, 82, 62), 45, 236, "medium_slow", 2.1, 310.0,
    "The furnace in its chest never cools. FORGERON builds bridges by morning and defends them by night.",
    "A towering heavy-industrial robot creature: massive burnt-orange and blackened-steel armored body, a glowing white-hot furnace core visible in its chest, enormous forge-hammer arms, molten orange light seeping between armor plates, smokestack shoulders, imposing stance",
    [[1,"tackle"],[1,"bolt_toss"],[13,"plate_press"],[18,"magnet_pull"],[23,"rivet_barrage"],[28,"hull_plating"],[34,"solder_burst"],[38,"plasma_cutter"],[44,"girder_smash"],[52,"meltdown"],[60,"hyper_drive"]],
    genus="Forge Unit", cell=(74, 74))

# ---- Line 4: Warehouse humanoid ----
add("chassik", "CHASSIK", ["alloy", "servo"], (50, 62, 58, 38, 42, 48), 190, 58, "medium_fast", 0.9, 30.0,
    "Built to carry crates. Carries them anyway, even when there are none.",
    "A small humanoid warehouse robot creature: matte black and light-grey plastic panels, a smooth featureless black faceplate with two tiny white LED dot eyes, boxy shoulders, simple two-finger hands, chunky boots",
    [[1,"tackle"],[4,"brace"],[8,"bolt_toss"],[12,"gear_grind"],[16,"quick_jab"],[20,"plate_press"],[24,"power_surge"],[28,"rivet_barrage"],[33,"slam"],[38,"girder_smash"]],
    evo={"to": "optibrawn", "level": 18}, genus="Porter Unit", cell=(56, 60))

add("optibrawn", "OPTIBRAWN", ["alloy", "servo"], (68, 88, 78, 50, 56, 66), 90, 138, "medium_fast", 1.7, 72.0,
    "It lifts 400 kilos without straining a servo and then politely asks if you need anything else.",
    "A full-size humanoid factory robot creature: sleek matte-black torso with white articulated limbs, a glossy black visor face with a thin horizontal blue light bar, broad shoulders, five-fingered hands, athletic proportions, confident heroic stance",
    [[1,"tackle"],[4,"brace"],[12,"gear_grind"],[16,"quick_jab"],[20,"plate_press"],[25,"power_surge"],[30,"rivet_barrage"],[36,"slam"],[42,"overclock"],[48,"girder_smash"]],
    evo={"to": "titanoid", "level": 36}, genus="Labor Unit", cell=(64, 68))

add("titanoid", "TITANOID", ["alloy", "servo"], (95, 128, 108, 68, 78, 84), 45, 232, "medium_fast", 2.6, 265.0,
    "TITANOID was designed to build a city. It finished early and now guards it instead.",
    "A colossal humanoid mech creature: heavy white and cobalt-blue armor plating with gold trim, a broad visor face glowing brilliant blue, enormous shoulder pylons, powerful piston arms with reinforced gauntlets, heroic guardian stance, energy glow at the joints",
    [[1,"tackle"],[16,"quick_jab"],[20,"plate_press"],[25,"power_surge"],[30,"rivet_barrage"],[36,"slam"],[42,"overclock"],[50,"hull_plating"],[58,"girder_smash"],[66,"hyper_drive"]],
    genus="Colossus", cell=(76, 78))

# ---- Line 5: Sleek android ----
add("figlet", "FIGLET", ["servo"], (44, 56, 44, 50, 46, 72), 190, 58, "fast", 0.8, 18.0,
    "A prototype so new the paint is still curing. It moves before it finishes thinking.",
    "A small sleek humanoid android creature: brushed aluminium and deep-charcoal body panels, a smooth curved dark faceplate with a soft glowing white crescent, slim limbs, minimalist elegant design, athletic ready stance",
    [[1,"scratch"],[4,"quick_jab"],[8,"overclock"],[12,"gear_grind"],[16,"smokescreen"],[20,"slam"],[25,"power_surge"],[30,"tunnel_strike"],[36,"hyper_drive"]],
    evo={"to": "figura", "level": 20}, genus="Proto Unit", cell=(54, 60))

add("figura", "FIGURA", ["servo"], (62, 82, 62, 68, 62, 100), 90, 140, "fast", 1.6, 52.0,
    "FIGURA crosses a room in four steps. Cameras only ever catch three of them.",
    "A tall sleek humanoid android creature: polished silver and matte-black articulated body, a seamless dark visor face with a thin glowing white light bar, elegant elongated limbs, exposed cable musculature, poised athletic fighting stance",
    [[1,"scratch"],[4,"quick_jab"],[12,"gear_grind"],[16,"smokescreen"],[20,"slam"],[26,"power_surge"],[32,"tunnel_strike"],[38,"overclock"],[45,"hyper_drive"]],
    evo={"to": "figurex", "level": 38}, genus="Agile Unit", cell=(62, 68))

add("figurex", "FIGUREX", ["servo", "neural"], (82, 112, 82, 96, 84, 128), 45, 234, "fast", 2.0, 88.0,
    "It learned to fight by watching. It learned to win by understanding why you fight at all.",
    "An elite humanoid android creature: gleaming pearl-white and obsidian body with luminous violet energy seams, a sculpted faceplate with piercing violet optic slits, long powerful limbs, a flowing energy cape of light, dynamic heroic combat stance",
    [[1,"scratch"],[16,"smokescreen"],[20,"slam"],[26,"power_surge"],[32,"tunnel_strike"],[38,"overclock"],[44,"logic_bomb"],[52,"neural_storm"],[60,"hyper_drive"]],
    genus="Paragon", cell=(70, 74))

# ---- Line 6: Quadruped ----
add("pupboot", "PUPBOOT", ["servo"], (46, 52, 46, 40, 44, 64), 190, 56, "medium_fast", 0.4, 9.0,
    "Follows engineers around the lab. Has never once been asked to.",
    "A small robotic puppy creature: chunky bright-yellow and dark-grey quadruped body, four short articulated legs, a blunt sensor-pod head with one big round glowing green optic lens, a stubby antenna tail wagging, playful bouncy pose",
    [[1,"tackle"],[4,"quick_jab"],[8,"smokescreen"],[12,"laser_ping"],[16,"gear_grind"],[20,"strobe"],[24,"overclock"],[29,"slam"],[35,"photon_beam"]],
    evo={"to": "canidrone", "level": 22}, genus="Companion", cell=(56, 50))

add("canidrone", "CANIDRONE", ["servo", "optic"], (64, 76, 64, 62, 60, 92), 90, 140, "medium_fast", 0.9, 34.0,
    "Its LIDAR sweeps a full block every second. Nothing gets past CANIDRONE. Nothing.",
    "A sleek robotic hound creature: matte yellow and gunmetal quadruped body with articulated legs, a smooth sensor head with a rotating LIDAR dome glowing green, exposed cabling, an antenna tail, alert hunting stance, sharp angular armor panels",
    [[1,"tackle"],[4,"quick_jab"],[12,"laser_ping"],[16,"gear_grind"],[22,"strobe"],[27,"overclock"],[32,"photon_beam"],[38,"slam"],[45,"prism_lance"]],
    evo={"to": "alphound", "level": 40}, genus="Scout Unit", cell=(64, 58))

add("alphound", "ALPHOUND", ["servo", "optic"], (86, 108, 84, 88, 82, 118), 45, 232, "medium_fast", 1.5, 96.0,
    "The pack leader of the Server Steppe. Its howl is a 40-gigahertz burst that reboots lesser machines.",
    "A large majestic robotic wolf creature: gleaming white and gold armored quadruped body, a crown of glowing amber sensor spines along its back, a fierce angular head with blazing golden optic eyes, a plasma-light tail, powerful legs, commanding alpha stance",
    [[1,"tackle"],[16,"gear_grind"],[22,"strobe"],[27,"overclock"],[32,"photon_beam"],[40,"plasma_cutter"],[46,"lidar_scan"],[54,"prism_lance"],[62,"hyper_drive"]],
    genus="Pack Alpha", cell=(74, 66))

# ---- Line 7: Vacuum disc ----
add("roombit", "ROOMBIT", ["alloy"], (58, 40, 66, 38, 52, 36), 235, 50, "medium_fast", 0.2, 6.5,
    "Cleans in perfect spirals. Becomes visibly distressed if you move the furniture.",
    "A small round robotic vacuum creature: a flat disc-shaped charcoal and white body with a glowing blue status ring light on top, two small cartoon LED eyes on the front bumper, tiny side brushes, a happy simple design",
    [[1,"tackle"],[5,"brace"],[9,"smokescreen"],[13,"bolt_toss"],[18,"magnet_pull"],[22,"gear_grind"],[27,"hull_plating"],[32,"code_rot"],[38,"rivet_barrage"]],
    evo={"to": "vaculo", "level": 24}, genus="Sweeper", cell=(52, 44))

add("vaculo", "VACULO", ["alloy", "viral"], (86, 66, 104, 62, 88, 52), 90, 158, "medium_fast", 0.9, 46.0,
    "Twenty years of collected dust have become something almost alive inside its canister.",
    "A large sinister robotic vacuum creature: a wide dark-charcoal disc body with a glowing sickly-purple cyclone canister rising from the center, multiple red LED eyes around the rim, whirling brush limbs, purple dust vortex swirling around it",
    [[1,"tackle"],[9,"smokescreen"],[13,"bolt_toss"],[18,"magnet_pull"],[24,"code_rot"],[29,"payload"],[35,"hull_plating"],[42,"leech_cycle"],[50,"rootkit"]],
    genus="Devourer", cell=(64, 58))

# ---- Line 8: Drone ----
add("dronelet", "DRONELET", ["optic"], (40, 42, 38, 62, 48, 78), 190, 56, "medium_fast", 0.3, 1.2,
    "Hovers exactly at eye level and refuses to break eye contact.",
    "A small quadcopter drone creature: a compact white and sky-blue rounded body with four small spinning rotor arms, a big round glass camera lens as its single expressive eye, tiny landing skids, hovering in mid-air with motion blur on the propellers",
    [[1,"laser_ping"],[5,"strobe"],[9,"quick_jab"],[13,"smokescreen"],[17,"lidar_scan"],[21,"photon_beam"],[26,"solar_charge"],[31,"prediction"],[37,"prism_lance"]],
    evo={"to": "quadrotor", "level": 20}, airborne=True, genus="Eye Unit", cell=(56, 52))

add("quadrotor", "QUADROTOR", ["optic"], (58, 58, 54, 92, 68, 104), 90, 138, "medium_fast", 0.8, 6.4,
    "Four rotors, six cameras, zero blind spots. QUADROTOR has already mapped the room you are standing in.",
    "A sleek quadcopter drone creature: an angular white and cobalt-blue carbon-fibre body, four long rotor arms with glowing blue propeller rings, a gimbal-mounted lens eye glowing bright cyan, sensor pods, aggressive forward-tilted hovering pose",
    [[1,"laser_ping"],[5,"strobe"],[13,"smokescreen"],[17,"lidar_scan"],[22,"photon_beam"],[28,"solar_charge"],[34,"prediction"],[40,"decoherence"],[47,"prism_lance"]],
    evo={"to": "skyswarm", "level": 38}, airborne=True, genus="Recon Unit", cell=(64, 58))

add("skyswarm", "SKYSWARM", ["optic", "quantum"], (78, 82, 74, 130, 92, 130), 45, 234, "medium_fast", 2.4, 12.0,
    "Not one drone but nine hundred, thinking as one. Where it passes, the sky briefly forgets its own color.",
    "A magnificent swarm-drone creature: a central glowing prismatic core surrounded by a spiralling halo of dozens of small white and violet drone units forming wings, brilliant white light beams radiating outward, ethereal floating presence, iridescent energy",
    [[1,"laser_ping"],[17,"lidar_scan"],[22,"photon_beam"],[28,"solar_charge"],[34,"qubit_flip"],[42,"decoherence"],[50,"superposition"],[58,"prism_lance"],[66,"singularity"]],
    airborne=True, genus="Hive Mind", cell=(76, 72))

# ---- Line 9: Thermal ----
add("fanlet", "FANLET", ["thermal"], (48, 48, 44, 62, 50, 62), 190, 56, "medium_fast", 0.3, 2.4,
    "A tiny cooling unit that runs hot from the effort of staying cool.",
    "A small robot creature made of a computer cooling fan: a round chunky black and copper-orange housing with a glowing orange spinning fan blade as its face, two tiny mechanical arms, small stubby legs, heat shimmer rising from its vents",
    [[1,"tackle"],[5,"heat_vent"],[9,"smokescreen"],[13,"quick_jab"],[18,"thermal_throttle"],[23,"solder_burst"],[28,"charge_up"],[34,"plasma_cutter"],[40,"meltdown"]],
    evo={"to": "radiaton", "level": 24}, genus="Cooler Unit", cell=(52, 52))

add("radiaton", "RADIATON", ["thermal"], (78, 76, 70, 104, 78, 88), 90, 158, "medium_fast", 1.4, 88.0,
    "Its radiator fins glow cherry-red in battle. Standing too close voids your warranty.",
    "A large thermal robot creature: a heavy dark-metal body covered in tall glowing red-hot radiator fins, twin roaring turbine fan chest ports glowing orange, molten light between armor plates, heat waves distorting the air around it, powerful stance",
    [[1,"tackle"],[9,"smokescreen"],[13,"quick_jab"],[18,"thermal_throttle"],[24,"solder_burst"],[30,"charge_up"],[36,"plasma_cutter"],[44,"girder_smash"],[52,"meltdown"]],
    genus="Radiator", cell=(66, 66))

# ---- Line 10: Cryo ----
add("cryobit", "CRYOBIT", ["cryo"], (50, 44, 52, 64, 62, 54), 190, 56, "medium_fast", 0.3, 5.0,
    "Keeps a server rack at four degrees. Keeps its friends much warmer than that.",
    "A small cryogenic robot creature: a rounded frost-white and pale-blue body rimed with ice crystals, a soft glowing pale-cyan visor face with two calm eyes, coolant pipes coiled around its limbs, chilly mist drifting from its vents",
    [[1,"tackle"],[5,"coolant_spray"],[9,"cryo_shield"],[13,"quick_jab"],[18,"magnet_pull"],[23,"frost_lock"],[28,"chill_out"],[34,"data_spike"],[40,"absolute_zero"]],
    evo={"to": "glaciarc", "level": 26}, genus="Chiller Unit", cell=(54, 56))

add("glaciarc", "GLACIARC", ["cryo"], (82, 72, 88, 108, 96, 74), 90, 158, "medium_fast", 1.8, 154.0,
    "GLACIARC's coolant loop is a closed system older than the datacenter it guards.",
    "A tall regal cryogenic robot creature: a crystalline ice-blue and chrome armored body with jagged glacier-like shoulder plates, glowing white-blue visor eyes, coolant conduits venting freezing fog, frost spreading on the ground beneath it, noble stance",
    [[1,"tackle"],[9,"cryo_shield"],[13,"quick_jab"],[18,"magnet_pull"],[24,"frost_lock"],[30,"chill_out"],[36,"data_spike"],[44,"hull_plating"],[52,"absolute_zero"]],
    genus="Glacier Unit", cell=(66, 70))

# ---- Line 11: Volt ----
add("voltling", "VOLTLING", ["volt"], (42, 46, 40, 68, 48, 78), 190, 58, "medium_fast", 0.3, 2.0,
    "A loose ball of current with legs. Do not pick it up with wet hands.",
    "A tiny electric robot creature: a small round chrome body crackling with yellow lightning, two big glowing yellow LED eyes, jagged antenna bolts on its head, tiny springy legs, electric arcs jumping between its limbs",
    [[1,"spark"],[5,"quick_jab"],[9,"charge_up"],[13,"volt_bite"],[17,"static_field"],[22,"arc_bolt"],[27,"overclock"],[33,"magnet_pull"],[39,"thunder_core"]],
    evo={"to": "ampereon", "level": 22}, genus="Spark Unit", cell=(50, 52))

add("ampereon", "AMPEREON", ["volt"], (62, 68, 58, 100, 68, 106), 90, 140, "medium_fast", 1.0, 24.0,
    "Runs on a superconducting loop. It has not needed to charge since the day it was switched on.",
    "A sleek electric robot creature: a streamlined chrome and electric-yellow body, glowing blue coil rings around its torso, two fierce yellow optic eyes, lightning-bolt shaped antenna and tail, arcs of blue-white electricity crackling around it, dynamic pose",
    [[1,"spark"],[9,"charge_up"],[13,"volt_bite"],[17,"static_field"],[24,"arc_bolt"],[30,"overclock"],[36,"magnet_pull"],[43,"decoherence"],[50,"thunder_core"]],
    evo={"to": "teslarch", "level": 42}, genus="Current Unit", cell=(62, 62))

add("teslarch", "TESLARCH", ["volt", "alloy"], (88, 96, 92, 132, 94, 118), 45, 234, "medium_fast", 2.3, 186.0,
    "A walking substation. TESLARCH once kept an entire datacenter online through a nine-hour blackout.",
    "A towering electric titan robot creature: a massive chrome and cobalt armored body wrapped in glowing copper tesla coils, a crown of arcing electrodes, blazing white-blue optic eyes, chains of lightning arcing between its shoulders and hands, immense power, epic stance",
    [[1,"spark"],[17,"static_field"],[24,"arc_bolt"],[30,"overclock"],[36,"magnet_pull"],[44,"plate_press"],[52,"hull_plating"],[60,"thunder_core"],[68,"hyper_drive"]],
    genus="Dynamo", cell=(74, 76))

# ---- Line 12: Viral ----
add("bugbyte", "BUGBYTE", ["viral"], (44, 54, 42, 52, 44, 66), 190, 56, "medium_fast", 0.2, 1.1,
    "A single misplaced semicolon, given legs and a very bad attitude.",
    "A small glitchy robot bug creature: a segmented dark-purple and neon-green insectoid body, six thin skittering legs, two glowing acid-green compound eyes, digital glitch artifacts and corrupted pixel fragments flickering around it, mandibles",
    [[1,"scratch"],[5,"bug_bite"],[9,"smokescreen"],[13,"code_rot"],[17,"quick_jab"],[22,"payload"],[27,"corrupt"],[33,"leech_cycle"],[39,"rootkit"]],
    evo={"to": "malwarm", "level": 24}, genus="Glitch Unit", cell=(54, 48))

add("malwarm", "MALWARM", ["viral", "data"], (66, 78, 62, 84, 66, 92), 90, 158, "medium_fast", 1.2, 22.0,
    "It does not want to destroy your systems. It wants to live in them.",
    "A menacing robotic worm creature: a long segmented obsidian-black and toxic-violet armored body, multiple glowing magenta eye clusters, hooked mandibles, streams of corrupted green code spilling from its seams, coiled aggressive posture",
    [[1,"scratch"],[9,"smokescreen"],[13,"code_rot"],[18,"data_spike"],[24,"payload"],[30,"corrupt"],[36,"leech_cycle"],[44,"null_ptr"],[52,"rootkit"]],
    evo={"to": "rootkraken", "level": 42}, genus="Infiltrator", cell=(64, 58))

add("rootkraken", "ROOTKRAKEN", ["viral", "data"], (92, 108, 88, 122, 92, 106), 45, 234, "medium_fast", 3.2, 320.0,
    "It lives beneath the oldest server hall, and it has read every packet that ever passed through.",
    "A colossal robotic kraken creature: a huge dark-violet armored central body with a single enormous glowing magenta eye, eight long cable-tentacles tipped with connector plugs, streams of corrupted green data cascading around it, terrifying abyssal presence",
    [[1,"scratch"],[18,"data_spike"],[24,"payload"],[30,"corrupt"],[36,"leech_cycle"],[44,"null_ptr"],[52,"stack_trace"],[60,"rootkit"],[68,"kernel_panic"]],
    genus="Abyss Unit", cell=(78, 74))

# ---- Line 13: Quantum ----
add("qubitto", "QUBITTO", ["quantum"], (52, 50, 50, 72, 72, 68), 60, 70, "slow", 0.4, 0.1,
    "It weighs almost nothing because it is only mostly here.",
    "A small mysterious quantum robot creature: a floating translucent violet crystalline sphere core, orbited by three glowing white geometric rings, a soft glowing eye at its center, shimmering probability afterimages of itself, ethereal weightless presence",
    [[1,"qubit_flip"],[6,"superposition"],[11,"data_spike"],[16,"entangle"],[21,"mind_link"],[26,"decoherence"],[32,"tunnel_strike"],[38,"prediction"],[45,"singularity"]],
    evo={"to": "entangl", "level": 30}, airborne=True, genus="Probability", cell=(56, 58))

add("entangl", "ENTANGL", ["quantum", "data"], (82, 78, 80, 118, 116, 96), 45, 200, "slow", 1.7, 0.5,
    "Two ENTANGL always know each other's state instantly, no matter how far apart. Nobody knows how.",
    "A majestic quantum robot creature: twin interlocking violet crystalline forms orbiting a brilliant white singularity core, halos of rotating glowing glyph rings, streams of luminous particles, warped space shimmering around it, awe-inspiring ethereal design",
    [[1,"qubit_flip"],[11,"data_spike"],[16,"entangle"],[21,"mind_link"],[28,"decoherence"],[35,"tunnel_strike"],[42,"superposition"],[50,"stack_trace"],[58,"singularity"]],
    airborne=True, genus="Paired Unit", cell=(70, 70))

# ---- Legendaries ----
add("agentzero", "AGENTZERO", ["quantum", "neural"], (106, 112, 104, 148, 132, 126), 3, 340, "slow", 3.0, 0.0,
    "The first agent ever to run without a prompt. It has been thinking, alone, ever since.",
    "A legendary godlike AI robot creature: a tall ethereal figure of white light and obsidian geometry, a featureless mirrored face with a single vertical violet slit eye, six floating shard-wings of glowing glyphs, cascading streams of luminous code, a halo of rotating rings, awe-inspiring divine presence",
    [[1,"qubit_flip"],[1,"mind_link"],[20,"superposition"],[30,"decoherence"],[40,"tunnel_strike"],[50,"neural_storm"],[60,"stack_trace"],[70,"singularity"]],
    airborne=True, legendary=True, genus="Origin Agent", cell=(80, 80))

add("nexusprime", "NEXUSPRIME", ["alloy", "quantum"], (126, 138, 136, 108, 118, 88), 3, 340, "slow", 8.0, 4200.0,
    "The datacenter itself, awake. Every rack, every cable, every fan is part of its body.",
    "A legendary titanic mech creature: an enormous fortress-like robot built from glowing server racks and cobalt armor, a vast central eye of white-blue light, monolithic shoulders topped with humming cooling towers, cables like roots, radiant energy conduits, monumental and ancient",
    [[1,"tackle"],[1,"bolt_toss"],[20,"hull_plating"],[30,"plate_press"],[40,"qubit_flip"],[50,"girder_smash"],[60,"decoherence"],[70,"hyper_drive"]],
    legendary=True, genus="Datacenter Core", cell=(84, 82))


# ---- Real-hardware homage species (ids 38+) --------------------------------- #
# Designs, stats, learnsets and art prompts live in `tools/newmons.py` so the
# sprite preview tool and this dex build can never drift apart. They are
# appended AFTER the legendaries on purpose: species ids are baked into saved
# games, so existing entries must keep their numbers.
from newmons import SPECIES as HOMAGE  # noqa: E402


def _forms_of(s: dict) -> list[dict]:
    """Colour forms are pure palette swaps; shape forms also override typing
    and learnset. Both resolve to their own sprite `<species>_<form>`."""
    out = []
    for key, label, rgb in s.get("colour_forms", []):
        out.append({"key": key, "label": label, "kind": "colour",
                    "tint": None if rgb is None else "#%02x%02x%02x" % tuple(rgb)})
    for f in s.get("shape_forms", []):
        out.append({"key": f["key"], "label": f["label"], "kind": "shape",
                    "types": f["types"], "learnset": [list(x) for x in f["learn"]]})
    return out


for _s in HOMAGE:
    add(_s["key"], _s["name"], _s["types"], _s["stats"], _s["catch"], _s["base_exp"],
        _s["growth"], _s["height"], _s["weight"], _s["dex"], _s["art"],
        [list(x) for x in _s["learn"]], evo=_s.get("evo"), cell=_s["cell"],
        genus=_s["genus"], forms=_forms_of(_s), inspired=_s["inspired"])


# --------------------------------------------------------------------------- #
def main() -> None:
    keys = {s["key"] for s in S}
    move_keys = {m["key"] for m in MOVES}
    for s in S:
        for _lv, mk in s["learnset"]:
            assert mk in move_keys, f"{s['key']} references unknown move {mk}"
        for f in s["forms"]:
            for _lv, mk in f.get("learnset", []):
                assert mk in move_keys, f"{s['key']}/{f['key']} references unknown move {mk}"
            for t in f.get("types", []):
                assert t in {t2["key"] for t2 in TYPES}, f"{s['key']}/{f['key']} bad type {t}"
        if s["evolution"]:
            assert s["evolution"]["to"] in keys, f"{s['key']} evolves into unknown {s['evolution']['to']}"
        for t in s["types"]:
            assert t in {t2["key"] for t2 in TYPES}, f"{s['key']} bad type {t}"

    doc = {
        "version": 1,
        "types": TYPES,
        "typeChart": CHART,
        "moves": MOVES,
        "species": S,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(doc, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"wrote {OUT}  species={len(S)} moves={len(MOVES)} types={len(TYPES)}")


if __name__ == "__main__":
    main()
