"""New Agéntmon proposed for the dex: designs, stats and art prompts.

Kept separate from `build_dex.py` so the sprites and stats can be reviewed and
approved before anything is folded into `shared/agentdex.json`.

Every creature here is an **original Agéntmon design** whose silhouette and
palette are inspired by a real-world robot, in the same way the existing 37
species are. Names are homages, never trademarks - consistent with STACKBIT,
REACHLET, PUPBOOT and the rest of the dex.
"""

from __future__ import annotations

# --------------------------------------------------------------------------- #
# New moves
# --------------------------------------------------------------------------- #
# (key, NAME, type, category, power, accuracy, pp, effect, chance, target, priority, desc)
NEW_MOVES = [
    ("cover", "COVER", "alloy", "status", 0, 100, 10, "shell_cover", 100, "self", 4,
     "Pulls its head into its shell. Blocks all damage for the turn and restores a little HP."),
    ("pixel_grin", "PIXEL GRIN", "data", "special", 65, 100, 15, "conf", 20, "foe", 0,
     "Flashes a grin so pixel-perfect it may CONFUSE."),
    ("jack_flare", "JACK FLARE", "thermal", "special", 75, 100, 15, "burn", 25, "foe", 0,
     "A carved lantern flare. May OVERHEAT the foe."),
    ("dazzle_stripe", "DAZZLE STRIPE", "optic", "special", 70, 100, 15, "acc_down", 30, "foe", 0,
     "Dizzying stripes that may lower ACCURACY."),
    ("many_hands", "MANY HANDS", "data", "physical", 22, 95, 20, "multi_hit", 100, "foe", 0,
     "Hugs the foe with every hand it has. Hits 2-5 times."),
    ("pile_drive", "PILE DRIVE", "servo", "physical", 100, 90, 10, "recoil_third", 100, "foe", 0,
     "A full-mass slam. The user takes recoil."),
    ("pounce", "POUNCE", "servo", "physical", 70, 100, 20, "flinch", 30, "foe", 0,
     "A sudden four-legged leap. May make the foe FLINCH."),
    ("grapple_arm", "GRAPPLE ARM", "alloy", "physical", 90, 100, 10, "def_down", 20, "foe", 0,
     "Seizes the foe with a manipulator. May lower DEFENSE."),
    ("spin_kick", "SPIN KICK", "servo", "physical", 85, 100, 15, "high_crit", 100, "foe", 0,
     "A whirling roundhouse. High critical-hit ratio."),
    ("soft_grip", "SOFT GRIP", "neural", "physical", 75, 100, 15, "atk_down", 30, "foe", 0,
     "A gentle but irresistible hold. May lower ATTACK."),
    ("visor_beam", "VISOR BEAM", "optic", "special", 95, 100, 10, "spd_down", 20, "foe", 0,
     "A focused beam from its visor. May lower SP.DEF."),
]

# --------------------------------------------------------------------------- #
# Art direction
# --------------------------------------------------------------------------- #
# Reachy's shell is recoloured programmatically, so the base is generated in a
# clean off-white: a palette swap keeps every colour form pixel-identical in
# silhouette, which a second AI generation could never guarantee.
REACHY_BODY = (
    "a small desk companion robot creature with a rounded squarish head, two very large round glossy "
    "black camera-lens eyes joined by a slim black bridge bar like a pair of goggles, two long thin "
    "black spring antennae rising from the top of the head, a smooth egg-shaped barrel body wider at "
    "the bottom, and a dark grey base ring"
)

SPECIES = [
    # --------------------------------------------------------------- STACKCHAN
    dict(
        key="stackchan", name="STACKCHAN", inspired="Stack-chan (M5Stack)",
        types=["data", "servo"], genus="Servo Face Unit",
        stats=(58, 65, 70, 92, 82, 98), catch=120, base_exp=172,
        growth="medium_fast", height=0.19, weight=1.4, cell=(54, 54),
        dex="A desktop unit whose whole face is one bright screen. It follows you across the room "
            "and mirrors your expression back.",
        art="A small palm-sized desk robot creature: a chunky rounded off-white plastic cube head with a "
            "large glossy black square screen face displaying a simple friendly face of two round white "
            "dots for eyes and a short white line for a mouth, the cube mounted on a chunky dark grey "
            "articulated servo bracket and a wide flat grey base plate, small teal accent panel on the "
            "side of the cube, tiny speaker holes",
        learn=[(1, "tackle"), (1, "data_spike"), (4, "smokescreen"), (8, "pixel_grin"), (12, "quick_jab"),
               (16, "recalibrate"), (20, "null_ptr"), (25, "debug"), (30, "stack_trace"),
               (36, "logic_bomb"), (43, "kernel_panic")],
    ),

    # -------------------------------------------------------------- REACHYMINI
    dict(
        key="reachymini", name="REACHYMINI", inspired="Reachy Mini (Pollen / Hugging Face)",
        types=["neural"], genus="Shell Unit",
        stats=(60, 52, 62, 95, 96, 90), catch=140, base_exp=168,
        growth="medium_fast", height=0.28, weight=1.5, cell=(56, 56),
        dex="Two spring antennae read the room before it moves. At the first hint of trouble it bows "
            "its head into its shell.",
        art="Official Pokemon-style creature version of " + REACHY_BODY + ", in clean off-white and "
            "pale cream with a soft grey shadow, cheerful and curious, small stubby feet under the base",
        learn=[(1, "scratch"), (1, "cover"), (5, "mind_link"), (9, "prediction"), (13, "quick_jab"),
               (17, "smokescreen"), (22, "logic_bomb"), (27, "empathy"), (32, "hypnotize"),
               (38, "neural_storm"), (45, "recalibrate")],
        # Cosmetic colour forms - identical stats, identical learnset, palette swap only.
        colour_forms=[
            ("snow", "SNOW", None),               # base generation, left untouched
            ("sky", "SKY", (0x5C, 0xC8, 0xD8)),
            ("lime", "LIME", (0xA8, 0xD0, 0x28)),
            ("sun", "SUN", (0xF8, 0xC0, 0x20)),
            ("ember", "EMBER", (0xE8, 0x50, 0x30)),
        ],
        # Shape forms - same base stats, extra type and their own signature moves.
        shape_forms=[
            dict(key="hallow", label="HALLOW", types=["neural", "thermal"], cover_rgb=(0xF0, 0x80, 0x18),
                 art="Official Pokemon-style creature: a small robot creature with a rounded squarish "
                     "off-white head with two very large round glossy black camera-lens eyes joined by a "
                     "slim black bridge bar, two long thin black spring antennae, and small black bat "
                     "wings on the sides of the head, its body replaced by a bright orange carved "
                     "jack-o-lantern pumpkin with a glowing triangular-eyed grinning face lit from "
                     "within, a small green stem",
                 learn=[(1, "scratch"), (1, "cover"), (5, "heat_vent"), (9, "prediction"),
                        (13, "jack_flare"), (18, "smokescreen"), (23, "logic_bomb"), (28, "empathy"),
                        (33, "solder_burst"), (39, "neural_storm"), (46, "meltdown")]),
            dict(key="zebra", label="ZEBRA", types=["neural", "alloy"], cover_rgb=None,
                 art="Official Pokemon-style creature: a small desk companion robot creature with a "
                     "rounded squarish white head with two very large round glossy black camera-lens "
                     "eyes joined by a slim black bridge bar, two long thin black spring antennae, and "
                     "a smooth egg-shaped white barrel body, the entire head and body painted with bold "
                     "black zebra stripes, dark grey base ring",
                 learn=[(1, "scratch"), (1, "cover"), (5, "mind_link"), (9, "dazzle_stripe"),
                        (13, "bolt_toss"), (18, "hull_plating"), (23, "logic_bomb"), (28, "empathy"),
                        (33, "plate_press"), (39, "neural_storm"), (46, "girder_smash")]),
            dict(key="hf", label="HF", types=["neural", "data"], cover_rgb=(0xFF, 0xD2, 0x1E),
                 art="Official Pokemon-style creature: a cheerful bright yellow desk robot creature with "
                     "a rounded squarish yellow head with two very large round glossy black camera-lens "
                     "eyes joined by a slim black bridge bar, two long thin black spring antennae, and a "
                     "plump yellow rounded body from which many small chunky yellow open hands reach "
                     "outward on both sides in a welcoming hug, glossy toy-like finish",
                 learn=[(1, "scratch"), (1, "cover"), (5, "mind_link"), (9, "many_hands"),
                        (13, "data_spike"), (18, "recursion"), (23, "logic_bomb"), (28, "empathy"),
                        (33, "null_ptr"), (39, "neural_storm"), (46, "stack_trace")]),
        ],
        # Extra pose used by the COVER animation. Faithful to the reference photo:
        # the head bows forward INTO the shell opening rather than sinking away, so
        # its smooth curved back becomes the front of the silhouette.
        extra_poses={
            "cover": "A small robot creature curled into a defensive shut-down posture: one smooth "
                     "seamless off-white egg-shaped barrel body, widest at the bottom and tapering to "
                     "a rounded top, with its rounded head bowed steeply forward and downward into the "
                     "top opening so that only the smooth curved outer back of the head faces the "
                     "viewer like a closed lid, the face and both eyes completely hidden behind it, "
                     "the upper half of the head still rising clearly above the body so the head is "
                     "not swallowed, two small soft rounded ear bumps on the top corners of the head, "
                     "two long thin solid black antennae rising cleanly from behind the head, each an "
                     "unbroken continuous stalk firmly attached to the head and tipped with a small "
                     "white ball, clearly connected and never floating or broken, two very narrow "
                     "dark crescent slivers of the hidden eye opening barely visible at the sides, a "
                     "thin dark grey base ring flat on the ground, one faint horizontal seam low on "
                     "the body and two tiny vertical vent slots, no legs, no buttons, no centre line, "
                     "no visible face, quiet and closed",
        },
    ),

    # ----------------------------------------------------------------- OPTIMUS
    dict(
        key="optimus", name="OPTIMUS", inspired="Tesla Optimus",
        types=["alloy", "servo"], genus="Labor Unit",
        stats=(82, 105, 92, 68, 80, 83), catch=45, base_exp=196,
        growth="slow", height=1.73, weight=57.0, cell=(70, 70),
        dex="Built for a full factory shift and never once complaining. It can lift a chassis twice "
            "its mass without a sound.",
        art="A tall human-proportioned bipedal humanoid robot creature standing upright and relaxed with "
            "its arms down at its sides: the head is a small smooth rounded-rectangle helmet whose "
            "entire front is one flat glossy pure-black faceplate with absolutely no eyes, mouth or "
            "features, framed by a bone-white shell over the top and sides of the helmet; a slim "
            "exposed matte-black neck; a bone-white chest plate split by a fine vertical centre seam "
            "over a matte-black abdomen; bone-white pearl armour shells covering the shoulders, upper "
            "arms, forearms, thighs and shins with slim matte-black actuator joints clearly exposed at "
            "the elbows, waist, hips and knees; realistic bone-white five-fingered human-shaped hands "
            "with dark finger joints; bone-white feet with dark soles; matte satin finish, calm and "
            "industrial",
        learn=[(1, "tackle"), (1, "bolt_toss"), (6, "brace"), (11, "plate_press"), (16, "power_surge"),
               (21, "gear_grind"), (27, "hull_plating"), (33, "slam"), (39, "pile_drive"),
               (46, "girder_smash"), (54, "hyper_drive")],
    ),

    # -------------------------------------------------------------------- SPOT
    dict(
        key="spot", name="SPOT", inspired="Boston Dynamics Spot",
        types=["servo", "optic"], genus="Patrol Unit",
        stats=(65, 76, 70, 58, 64, 97), catch=90, base_exp=148,
        growth="medium_slow", height=0.84, weight=32.5, cell=(64, 60),
        dex="A four-legged surveyor that never stumbles. Shove it and it takes one neat step sideways "
            "and keeps mapping.",
        art="A four-legged robot dog creature with no head: a bright safety-yellow rectangular body "
            "shell, a yellow forward sensor block at the front with a row of small dark camera lenses "
            "and a glowing green status strip instead of a face, four slender black articulated legs "
            "with bright yellow thigh shrouds and thin dark shins, alert forward-leaning stance",
        learn=[(1, "tackle"), (1, "laser_ping"), (5, "quick_jab"), (9, "lidar_scan"), (14, "pounce"),
               (19, "strobe"), (24, "gear_grind"), (30, "photon_beam"), (36, "slam"),
               (43, "prism_lance"), (50, "hyper_drive")],
        evo={"to": "spotarm", "level": 36},
    ),

    # ----------------------------------------------------------------- SPOTARM
    dict(
        key="spotarm", name="SPOTARM", inspired="Boston Dynamics Spot + Spot Arm",
        types=["servo", "alloy"], genus="Handler Unit",
        stats=(85, 112, 95, 70, 80, 103), catch=45, base_exp=228,
        growth="medium_slow", height=1.10, weight=43.0, cell=(72, 66),
        dex="The arm folded on its back can open a door, right a fallen crate or pin a rival. It "
            "decides which in a fifth of a second.",
        art="A large four-legged robot dog creature carrying equipment: a bright safety-yellow and black "
            "body shell, a yellow forward sensor block with dark camera lenses and a glowing green "
            "status strip instead of a face, four slender black articulated legs with bright yellow "
            "thigh shrouds, and mounted on its back a long yellow and black articulated manipulator arm "
            "ending in a chunky gripper claw raised over its shoulder, plus a small black sensor mast, "
            "commanding powerful stance",
        learn=[(1, "tackle"), (1, "laser_ping"), (5, "quick_jab"), (9, "lidar_scan"), (14, "pounce"),
               (19, "strobe"), (24, "gear_grind"), (30, "photon_beam"), (36, "grapple_arm"),
               (44, "slam"), (52, "prism_lance"), (60, "hyper_drive")],
    ),

    # ---------------------------------------------------------------- FIGURE03
    dict(
        key="figure03", name="FIGURE03", inspired="Figure 03",
        types=["alloy", "neural"], genus="Helper Unit",
        stats=(78, 88, 84, 100, 88, 77), catch=45, base_exp=194,
        growth="slow", height=1.68, weight=49.0, cell=(70, 70),
        dex="Its visor is one sheet of glass hiding a very fast mind. It watches a task once and can "
            "then repeat it forever.",
        art="A soft-looking human-proportioned bipedal humanoid robot creature standing calmly with arms "
            "at its sides: the head is a compact rounded helmet, glossy jet-black across the whole "
            "curved front like a single wraparound visor with no eyes or mouth, capped by a smooth "
            "light-grey shell over the crown; the torso, shoulders and upper arms are wrapped in a "
            "distinctly darker mid slate-grey soft woven textile cover with a clearly visible vertical "
            "cloth seam down the chest, reading as padded fabric rather than hard armour and standing "
            "out clearly against the much lighter limbs; matte dark charcoal forearms and slim dark hip "
            "and knee joints; bright off-white moulded thigh and shin panels; light five-fingered "
            "hands; clean off-white boots; strong light-dark contrast between the pale legs and the "
            "dark fabric torso; friendly domestic proportions, soft rounded edges, no exposed wiring",
        learn=[(1, "tackle"), (1, "mind_link"), (6, "prediction"), (11, "bolt_toss"), (16, "laser_ping"),
               (21, "hull_plating"), (27, "plate_press"), (33, "logic_bomb"), (40, "visor_beam"),
               (47, "neural_storm"), (55, "girder_smash")],
    ),

    # ----------------------------------------------------------------- UNITREE
    dict(
        key="unitree", name="UNITREE", inspired="Unitree G1",
        types=["alloy", "volt"], genus="Kata Unit",
        stats=(74, 118, 78, 66, 74, 115), catch=45, base_exp=204,
        growth="fast", height=1.32, weight=35.0, cell=(68, 68),
        dex="It trains kata four hundred times an hour. It knows how you mean to dodge and picks the "
            "kick you cannot.",
        art="A compact short agile bipedal humanoid robot creature in a low ready martial-arts stance "
            "with knees bent and fists raised: the head is a small dark-grey rounded pod dominated by a "
            "wide horizontal glossy black visor band with a single round camera lens at its centre, and "
            "a small dark depth-sensor dome sitting on top of the crown; brushed silver-grey metallic "
            "shells over the chest, upper arms, thighs and shins; large clearly visible black "
            "cylindrical rotary joint actuators like thick discs at both shoulders, both elbows, both "
            "hips and both knees; slim dark limb linkages between them; small dark three-fingered "
            "gripper hands; short flat dark feet; a small blue accent stripe on the chest; athletic, "
            "squat and springy proportions",
        learn=[(1, "scratch"), (1, "spark"), (5, "quick_jab"), (10, "volt_bite"), (15, "overclock"),
               (20, "spin_kick"), (26, "static_field"), (32, "gear_grind"), (38, "arc_bolt"),
               (45, "slam"), (53, "thunder_core")],
    ),

    # --------------------------------------------------------------------- NEO
    dict(
        key="neo", name="NEO", inspired="1X NEO",
        types=["neural", "alloy"], genus="Home Unit",
        stats=(100, 80, 90, 82, 96, 57), catch=45, base_exp=192,
        growth="slow", height=1.65, weight=30.0, cell=(68, 68),
        dex="Wrapped head to toe in soft knit so it can never hurt anyone. It tidies your workshop "
            "while you sleep.",
        art="A gentle human-proportioned bipedal humanoid robot creature standing calmly, its entire "
            "body sheathed head to toe in one continuous soft pale oatmeal-beige knitted fabric suit "
            "like a knitted bodysuit, the colour a very desaturated light greige sand tone close to raw "
            "undyed wool or unbleached linen, definitely NOT orange and NOT bright tan, kept muted and "
            "washed-out: the head is a smooth featureless rounded egg "
            "shape covered in the same beige knit, with no eyes, no mouth and no visor at all, only a "
            "faint slightly darker oval panel where a face would be; a soft knitted collar at the neck; "
            "the shoulders, arms, torso, hips and legs all show a visible ribbed knit stitch texture "
            "with gentle fabric creases; soft five-fingered knit-covered hands; softly rounded knit "
            "feet; slim calm friendly proportions, warm and domestic, entirely fabric with no exposed "
            "metal or machinery anywhere",
        learn=[(1, "tackle"), (1, "mind_link"), (6, "empathy"), (11, "brace"), (16, "soft_grip"),
               (21, "prediction"), (27, "hull_plating"), (33, "logic_bomb"), (40, "plate_press"),
               (47, "neural_storm"), (55, "girder_smash")],
    ),
]


def total(stats: tuple[int, ...]) -> int:
    return sum(stats)
