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

# The generic "seen from behind" view produced a featureless blob for REACHYMINI
# that was indistinguishable from its COVER pose, so its rear is spelled out:
# the head must stay a separate dome sitting ABOVE the body on a visible neck.
REACHY_BACK = (
    "a small desk companion robot creature seen from behind, its rounded squarish head held fully "
    "upright and clearly separated from the body, sitting high above a smooth egg-shaped barrel body "
    "on a visible open neck gap crossed by several thin dark diagonal support rods, the smooth blank "
    "back of the head showing a soft rounded shell with a small round dark port at its centre and no "
    "eyes and no face anywhere, two long thin black spring antennae rising from the top of the head, "
    "the barrel body wider at the bottom with one horizontal seam and a dark grey base ring, the head "
    "plainly detached and floating above the shell opening rather than tucked inside it"
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
        antennae=True,
        dex="Two spring antennae read the room before it moves. At the first hint of trouble it bows "
            "its head into its shell.",
        art="Official Pokemon-style creature version of " + REACHY_BODY + ", in clean off-white and "
            "pale cream with a soft grey shadow, cheerful and curious, small stubby feet under the base",
        art_back="Official Pokemon-style creature version of " + REACHY_BACK + ", in clean off-white "
            "and pale cream with a soft grey shadow, small stubby feet under the base",
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
                 art_back="Official Pokemon-style creature: " + REACHY_BACK + ", the entire head and "
                     "body painted with bold black zebra stripes",
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
                     "a rounded top, with its head bowed steeply forward and downward into the top "
                     "opening so that only the smooth curved outer back of the head faces the viewer "
                     "like a closed lid, the face and both eyes completely hidden behind it, the head "
                     "a perfectly smooth round dome, a clean unbroken circular arc with no ears, no "
                     "ear bumps, no corners, no lumps and no protrusions of any kind on it, the upper "
                     "half of that dome still rising clearly above the body so the head is not "
                     "swallowed, two long thin solid black antennae rising cleanly from behind the "
                     "dome, each an unbroken continuous stalk firmly attached to the head and tipped "
                     "with a small white ball, clearly connected and never floating or broken, two "
                     "very narrow dark crescent slivers of the hidden eye opening barely visible at "
                     "the sides, a thin dark grey base ring flat on the ground, one faint horizontal "
                     "seam low on the body and two tiny vertical vent slots, no legs, no buttons, no "
                     "centre line, no visible face, quiet and closed",
        },
    ),

    # ----------------------------------------------------------------- OPTIMUS
    dict(
        key="optimus", name="OPTIMUS", inspired="Tesla Optimus",
        types=["alloy", "servo"], genus="Labor Unit",
        stats=(82, 105, 92, 68, 80, 83), catch=45, base_exp=196,
        growth="slow", height=1.73, weight=57.0, cell=(70, 70),
        accents=((0x30, 0xD8, 0xE8), (0x10, 0x88, 0xA0)),  # cyan faceplate outline + its falloff
        dex="Built for a full factory shift and never once complaining. It can lift a chassis twice "
            "its mass without a sound.",
        art="A tall slim human-proportioned bipedal humanoid robot creature standing upright and relaxed "
            "with its arms straight down at its sides: the head is a small smooth rounded helmet that is "
            "entirely glossy piano-black, front and sides alike, one seamless featureless black "
            "faceplate with absolutely no eyes and no mouth, and the whole outline of that faceplate is "
            "traced by one thin continuous glowing cyan light line running around its edge like neon "
            "piping, which is the single brightest detail on the creature; a short matte-black neck; a "
            "large smooth pearl-white chest plate with a soft vertical centre seam, flanked by "
            "matte-black shoulder caps and matte-black torso sides so the white chest reads as a panel "
            "set into black; a narrow matte-black waist band; pearl-white upper-arm and forearm shells "
            "separated by exposed matte-black elbow actuators; pearl-white five-fingered human-shaped "
            "hands with dark knuckle lines; a matte-black hip block; pearl-white thigh and shin shells "
            "with exposed matte-black knee actuators between them; pearl-white feet with dark soles; "
            "strong two-tone contrast of glossy black and satin pearl white only, no other colour "
            "besides the cyan face outline, calm and industrial",
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
        accents=((0xFF, 0xFF, 0xFF),),  # white pixel eyes on the black helmet
        dex="Its visor is one sheet of glass hiding a very fast mind. It watches a task once and can "
            "then repeat it forever.",
        art="A soft-looking human-proportioned bipedal humanoid robot creature standing calmly with arms "
            "at its sides: the head is a smooth glossy jet-black rounded egg-shaped helmet, taller than "
            "it is wide and completely black all over with no visor line, bearing across its front "
            "three or four large bright white square pixel blocks arranged in a short row like a "
            "minimal blocky pixel face, boldly drawn and the only light on the head; a short grey "
            "neck; the torso, shoulders and upper arms "
            "are wrapped in a mid slate-grey soft woven textile cover with a clearly visible ribbed "
            "knit weave and a vertical cloth seam down the chest, reading as padded fabric rather than "
            "hard armour, with a small dark chequered pixel logo high on the chest; matte charcoal "
            "elbow joints and light grey forearms; a moulded matte-black hip block; grey knitted thighs "
            "meeting chunky matte-black knee blocks; light grey shins; light five-fingered hands with "
            "dark joints; clean pale grey boots; an overall soft muted grey-and-black palette with the "
            "glossy black head standing out against the woven grey body; friendly domestic proportions, "
            "soft rounded edges, no exposed wiring; drawn with stylised creature proportions, the head "
            "deliberately oversized at roughly one quarter of the total body height and the limbs "
            "correspondingly shorter, so the pixel face reads clearly at small size",
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
        accents=((0x48, 0xC8, 0xF8), (0x18, 0x88, 0xC0)),  # glowing blue visor bar + its falloff
        dex="It trains kata four hundred times an hour. It knows how you mean to dodge and picks the "
            "kick you cannot.",
        art="A compact short agile bipedal humanoid robot creature in a low ready martial-arts stance "
            "with knees bent and fists raised: the head is a small smooth dark navy-black wraparound "
            "helmet, rounded like a motorcycle helmet with a glossy black visor covering the whole "
            "front, and across that visor runs one wide bright glowing electric-blue horizontal light "
            "bar from side to side, the single brightest feature of the creature, with no eyes and no "
            "mouth; a short dark neck; a bright glossy pearl-white rounded chest plate carrying small "
            "dark lettering across it, set between dark grey shoulder joints; brushed silver-white "
            "shells over the upper arms, forearms, thighs and shins; large clearly visible matte-black "
            "cylindrical rotary joint actuators like thick dark discs at both shoulders, both elbows, "
            "the waist, both hips and both knees, with slim dark linkages between them; small dark "
            "three-fingered gripper hands; short flat dark feet; crisp white-and-black two-tone "
            "colouring with the blue visor bar as the only accent; athletic, squat and springy "
            "proportions",
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
        accents=((0xFF, 0xFF, 0xFF), (0x28, 0x2C, 0x34)),  # ear ring + dark face
        dex="Wrapped head to toe in soft knit so it can never hurt anyone. It tidies your workshop "
            "while you sleep.",
        art="A gentle human-proportioned bipedal humanoid robot creature standing calmly with its arms "
            "relaxed at its sides, its entire body sheathed head to toe in one continuous soft pale "
            "oatmeal-beige knitted fabric suit like a full knitted bodysuit, the colour a very "
            "desaturated light greige sand tone close to raw undyed wool or unbleached linen, "
            "definitely NOT orange and NOT bright tan, kept muted and washed-out: the head is a smooth "
            "rounded egg shape covered in the same beige knit, and set into the front of that head is "
            "one large smooth glossy very dark charcoal-black oval face panel with no eyes and no "
            "mouth, a plain unbroken dark visor plate covering most of the front of the head and "
            "contrasting strongly against the pale knit around it; on the side of the head exactly "
            "where a human ear would sit there is one "
            "large bright glowing white circular ring, a bold luminous white halo outline taking up a "
            "third of the visible side of the head, which together with the dark face is the most "
            "distinctive feature of the creature; a soft knitted collar at "
            "the neck; the shoulders, chest, arms, hips and legs all show a clearly visible ribbed knit "
            "stitch texture with gentle fabric creases and soft seams running down the outside of the "
            "arms and legs; the hands are the only hard parts, large bright cream-white moulded "
            "five-fingered robotic hands, clearly much paler and glossier than the knit sleeves, with "
            "visible finger segments emerging from darker knitted cuffs; one "
            "small round darker port low on the outer hip; softly rounded knit feet; broad relaxed "
            "shoulders and a calm friendly stance, warm and domestic, everything else fabric with no "
            "exposed metal or machinery anywhere; drawn with stylised creature proportions, the head "
            "deliberately oversized at roughly one quarter of the total body height and the limbs "
            "correspondingly shorter, so the head reads clearly at small size",
        learn=[(1, "tackle"), (1, "mind_link"), (6, "empathy"), (11, "brace"), (16, "soft_grip"),
               (21, "prediction"), (27, "hull_plating"), (33, "logic_bomb"), (40, "plate_press"),
               (47, "neural_storm"), (55, "girder_smash")],
    ),
]


def total(stats: tuple[int, ...]) -> int:
    return sum(stats)
