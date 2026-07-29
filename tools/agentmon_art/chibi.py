"""Procedural GBA-style overworld character sprites.

Why this exists
---------------
Overworld characters live in a 20x28 cell. Downscaling AI concept art of a
realistically proportioned person into that cell leaves a four-pixel head and a
muddy hundred-colour blob - unreadable at the size the player actually sees it.

Real GBA overworld sprites cheat: the head is ~45% of the figure, the palette is
a dozen flat colours, and every silhouette carries a hard 1px keyline. Those are
authoring rules, not something a downscaler can recover, so the sprites are
drawn here instead - parameterised by a small `ChibiStyle` per character.

The result is one deterministic tool that emits all four facing directions and a
four-frame walk cycle for every character, with a guaranteed-consistent look.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
from PIL import Image

CELL_W, CELL_H = 20, 28

# Figure anatomy, in cell rows/columns. Deliberately head-heavy.
HEAD_TOP, HEAD_BOT = 2, 12
HEAD_X0, HEAD_X1 = 4, 15
TORSO_TOP, TORSO_BOT = 13, 20
TORSO_X0, TORSO_X1 = 5, 14
LEG_TOP, LEG_BOT = 21, 24
FOOT_TOP, FOOT_BOT = 25, 26

RGBA = tuple[int, int, int, int]


def _shade(c: str, f: float) -> str:
    """Multiply a hex colour toward black (f<1) or white (f>1)."""
    r, g, b = int(c[1:3], 16), int(c[3:5], 16), int(c[5:7], 16)
    if f <= 1:
        r, g, b = int(r * f), int(g * f), int(b * f)
    else:
        t = f - 1
        r, g, b = int(r + (255 - r) * t), int(g + (255 - g) * t), int(b + (255 - b) * t)
    return f'#{min(255, r):02x}{min(255, g):02x}{min(255, b):02x}'


@dataclass
class ChibiStyle:
    """Everything needed to draw one character."""

    skin: str = '#f0c8a0'
    hair: str = '#3c2c28'
    top: str = '#f0f0f4'
    bottom: str = '#384058'
    shoes: str = '#40e0f0'
    trim: str = '#40e0f0'
    outline: str = '#181420'
    hair_style: str = 'short'      # short | spiky | long | ponytail | bun | bald
    headgear: str = 'none'         # none | cap | hardhat | helmet | hood
    headgear_color: str = '#d83030'
    accessory: str = 'none'        # none | glasses | visor | goggles
    accessory_color: str = '#40e0f0'
    coat: bool = False             # long coat: torso colour continues over the hips
    backpack: bool = False
    beard: bool = False
    height: int = 0                # -2 shorter (kids), +1 taller (adults)
    extras: list[str] = field(default_factory=list)  # apron | collar | badge


class Canvas:
    """A tiny RGBA pixel canvas with the handful of primitives sprites need."""

    def __init__(self, w: int = CELL_W, h: int = CELL_H) -> None:
        self.a = np.zeros((h, w, 4), dtype=np.uint8)

    @staticmethod
    def _rgba(c: str) -> RGBA:
        return (int(c[1:3], 16), int(c[3:5], 16), int(c[5:7], 16), 255)

    def px(self, x: int, y: int, c: str) -> None:
        if 0 <= x < self.a.shape[1] and 0 <= y < self.a.shape[0]:
            self.a[y, x] = self._rgba(c)

    def rect(self, x0: int, y0: int, x1: int, y1: int, c: str) -> None:
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                self.px(x, y, c)

    def rrect(self, x0: int, y0: int, x1: int, y1: int, c: str, r: int = 1) -> None:
        """Rectangle with the corners chamfered, so heads read as heads."""
        for y in range(y0, y1 + 1):
            dy = min(y - y0, y1 - y)
            inset = max(0, r - dy)
            for x in range(x0 + inset, x1 - inset + 1):
                self.px(x, y, c)

    def keyline(self, c: str) -> None:
        """Classic 1px dark contour around the whole silhouette."""
        solid = self.a[:, :, 3] > 0
        h, w = solid.shape
        edge = np.zeros_like(solid)
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            shifted = np.zeros_like(solid)
            ys = slice(max(0, dy), h + min(0, dy))
            yd = slice(max(0, -dy), h + min(0, -dy))
            xs = slice(max(0, dx), w + min(0, dx))
            xd = slice(max(0, -dx), w + min(0, -dx))
            shifted[yd, xd] = solid[ys, xs]
            edge |= shifted
        edge &= ~solid
        self.a[edge] = self._rgba(c)

    def image(self) -> Image.Image:
        return Image.fromarray(self.a, 'RGBA')


# --------------------------------------------------------------------------- #
# Body parts
# --------------------------------------------------------------------------- #
def _draw_legs(cv: Canvas, s: ChibiStyle, step: int, side: bool, dy: int) -> None:
    """step: 0 neutral, +1/-1 alternating stride. `side` uses a scissor gait."""
    lo, hi = LEG_TOP + dy, LEG_BOT + dy
    lower = s.bottom if not s.coat else s.bottom
    dark = _shade(lower, 0.72)

    if side:
        # Profile: legs scissor forward/back rather than side to side.
        front = 8 + step * 2
        back = 8 - step * 2
        cv.rect(back, lo, back + 2, hi, dark)
        cv.rect(back, hi + 1, back + 2, hi + 2, _shade(s.shoes, 0.75))
        cv.rect(front, lo, front + 2, hi, lower)
        cv.rect(front, hi + 1, front + 3, hi + 2, s.shoes)
        return

    left = (6, 8)
    right = (11, 13)
    for i, (x0, x1) in enumerate((left, right)):
        forward = step if i == 0 else -step
        # Planted leg extends, trailing leg lifts: a 2px swing reads clearly
        # even at 20x28.
        bot = hi + (1 if forward > 0 else (-1 if forward < 0 else 0))
        cv.rect(x0, lo, x1, bot, lower if forward >= 0 else dark)
        cv.rect(x0, bot + 1, x1, bot + 2, s.shoes if forward >= 0 else _shade(s.shoes, 0.75))


def _draw_torso(cv: Canvas, s: ChibiStyle, facing: str, swing: int, dy: int) -> None:
    top, bot = TORSO_TOP + dy, TORSO_BOT + dy
    x0, x1 = (TORSO_X0, TORSO_X1) if facing != 'side' else (6, 13)
    body = s.top
    cv.rrect(x0, top, x1, bot if not s.coat else bot + 2, body, r=1)
    cv.rect(x0, bot - 1 if not s.coat else bot + 1, x1, bot if not s.coat else bot + 2,
            _shade(body, 0.82))

    if 'apron' in s.extras:
        cv.rect(x0 + 2, top + 2, x1 - 2, bot, _shade(s.trim, 1.0))
    if facing == 'down':
        # Glowing circuit trim down the chest - the game's signature detail.
        cv.rect(9, top + 1, 10, bot - 2, s.trim)
        cv.px(9, top + 1, _shade(s.trim, 1.3))
        if 'collar' in s.extras:
            cv.rect(x0 + 1, top, x1 - 1, top, _shade(s.trim, 1.15))
        if 'badge' in s.extras:
            cv.px(x0 + 1, top + 2, '#f0d040')
    elif facing == 'up':
        if s.backpack:
            cv.rrect(x0 + 1, top + 1, x1 - 1, bot - 1, _shade(s.bottom, 0.9), r=1)
            cv.rect(x0 + 3, top + 2, x1 - 3, top + 3, s.trim)
        else:
            cv.rect(x0 + 2, top + 1, x1 - 2, top + 1, _shade(body, 0.82))
    else:
        cv.rect(x1 - 2, top + 1, x1 - 1, bot - 2, s.trim)

    # Arms swing opposite the legs.
    arm = _shade(body, 0.88)
    hand = s.skin
    if facing == 'side':
        ay = top + 1 + swing
        cv.rect(x1 - 1, ay, x1, ay + 4, arm)
        cv.rect(x1 - 1, ay + 5, x1, ay + 5, hand)
    else:
        for i, ax in ((0, TORSO_X0 - 2), (1, TORSO_X1 + 1)):
            ay = top + 1 + (swing if i == 0 else -swing)
            cv.rect(ax, ay, ax + 1, ay + 4, arm)
            cv.rect(ax, ay + 5, ax + 1, ay + 5, hand)


def _draw_head(cv: Canvas, s: ChibiStyle, facing: str, dy: int) -> None:
    top, bot = HEAD_TOP + dy, HEAD_BOT + dy
    x0, x1 = (HEAD_X0, HEAD_X1) if facing != 'side' else (5, 14)
    hair_dark = _shade(s.hair, 0.7)

    cv.rrect(x0, top, x1, bot, s.skin, r=2)
    cv.rect(x0 + 1, bot, x1 - 1, bot, _shade(s.skin, 0.85))

    if s.hair_style != 'bald':
        # Fringe across the brow, plus side locks framing the face.
        cv.rrect(x0, top, x1, top + 3, s.hair, r=2)
        cv.rect(x0, top + 2, x0 + 1, top + 5, s.hair)
        cv.rect(x1 - 1, top + 2, x1, top + 5, s.hair)
        cv.rect(x0 + 1, top + 1, x1 - 1, top + 1, _shade(s.hair, 1.18))
        if s.hair_style in ('long', 'ponytail'):
            cv.rect(x0, top + 2, x0 + 1, bot, s.hair)
            cv.rect(x1 - 1, top + 2, x1, bot, s.hair)
        if s.hair_style == 'ponytail':
            cv.rect(x1 + 1, top + 3, x1 + 2, top + 8, s.hair)
            cv.rect(x1 + 1, top + 8, x1 + 2, top + 9, hair_dark)
        if s.hair_style == 'spiky':
            for sx in (x0 + 1, x0 + 4, x0 + 7, x0 + 10):
                cv.px(sx, top - 1, s.hair)
        if s.hair_style == 'bun':
            cv.rrect(x0 + 4, top - 3, x0 + 7, top, s.hair, r=1)

    if facing == 'up' and s.hair_style != 'bald':
        cv.rrect(x0, top, x1, bot - 1, s.hair, r=2)
        cv.rect(x0 + 2, top + 1, x1 - 2, top + 2, _shade(s.hair, 1.18))

    if s.headgear == 'cap':
        cv.rrect(x0, top - 1, x1, top + 3, s.headgear_color, r=2)
        cv.rect(x0 + 1, top, x1 - 1, top, _shade(s.headgear_color, 1.2))
        if facing != 'up':
            cv.rect(x0 - 1, top + 4, x1 + 1, top + 4, _shade(s.headgear_color, 0.8))
    elif s.headgear == 'hardhat':
        cv.rrect(x0, top - 1, x1, top + 3, s.headgear_color, r=2)
        cv.rect(x0 - 1, top + 4, x1 + 1, top + 4, _shade(s.headgear_color, 0.85))
        cv.rect(x0 + 5, top - 1, x0 + 6, top + 3, _shade(s.headgear_color, 1.2))
    elif s.headgear in ('helmet', 'hood'):
        cv.rrect(x0 - 1, top - 1, x1 + 1, bot - 1, s.headgear_color, r=2)
        cv.rect(x0, top, x1, top, _shade(s.headgear_color, 1.2))
        if facing != 'up':
            cv.rrect(x0 + 1, top + 4, x1 - 1, top + 9, s.skin, r=1)

    if facing != 'up':
        eye_y = top + 6
        if s.headgear in ('helmet', 'hood'):
            eye_y = top + 5
        if s.accessory == 'visor':
            cv.rect(x0 + 1, eye_y - 1, x1 - 1, eye_y + 1, s.accessory_color)
            cv.rect(x0 + 1, eye_y - 1, x1 - 1, eye_y - 1, _shade(s.accessory_color, 1.3))
        else:
            if facing == 'side':
                cv.rect(x1 - 4, eye_y, x1 - 3, eye_y + 1, s.outline)
                cv.px(x1 - 3, eye_y, '#f8f8f8')
            else:
                cv.rect(x0 + 2, eye_y, x0 + 3, eye_y + 1, s.outline)
                cv.rect(x1 - 3, eye_y, x1 - 2, eye_y + 1, s.outline)
                cv.px(x0 + 3, eye_y, '#f8f8f8')
                cv.px(x1 - 2, eye_y, '#f8f8f8')
            if s.accessory in ('glasses', 'goggles'):
                # Worn pushed up on the forehead, as the concept art describes.
                cv.rect(x0, top + 3, x1, top + 4, s.accessory_color)
                cv.rect(x0 + 1, top + 3, x1 - 1, top + 3, _shade(s.accessory_color, 1.35))
        if s.beard:
            cv.rect(x0 + 2, bot - 2, x1 - 2, bot, _shade(s.hair, 1.5))


def _frame(s: ChibiStyle, facing: str, step: int, swing: int) -> Image.Image:
    cv = Canvas()
    dy = -s.height
    # The upper body lifts a pixel mid-stride - the bob is what actually sells
    # walking at this size.
    bob = 1 if step != 0 else 0
    _draw_legs(cv, s, step, facing == 'side', dy)
    _draw_torso(cv, s, facing, swing, dy - bob)
    _draw_head(cv, s, facing, dy - bob)
    cv.keyline(s.outline)
    return cv.image()


def build_character(style: ChibiStyle) -> dict[str, list[Image.Image]]:
    """All four facings, four walk frames each: neutral, step, neutral, step."""
    gait = ((0, 0), (1, 1), (0, 0), (-1, -1))
    out: dict[str, list[Image.Image]] = {}
    for name, facing in (('walk_down', 'down'), ('walk_up', 'up'), ('walk_right', 'side')):
        out[name] = [_frame(style, facing, st, sw) for st, sw in gait]
    out['walk_left'] = [f.transpose(Image.FLIP_LEFT_RIGHT) for f in out['walk_right']]
    return out
