"""Agentmon art pipeline.

A small, purpose-built toolchain that turns AI-generated concept art into
GBA-authentic pixel-art sprite sheets:

    azureimg  -> generate concept art with Azure gpt-image-2
    pixelize  -> chroma-key, trim, downscale, GBA-palette quantize, outline
    anim      -> procedurally derive animation frames from a single sprite
    sheet     -> pack frames into strips + JSON atlases
"""

__all__ = ["azureimg", "pixelize", "anim", "sheet"]
