# LPC neutral idle sources

Upstream: [ElizaWy/LPC](https://github.com/ElizaWy/LPC), pinned commit `f07f7f5892e67c932c68f70bb04472f2c64e46bc` (the same commit as the existing walking sources).

License: **OGA-BY 3.0**, [license text](https://static.opengameart.org/OGA-BY-3.0.txt).

- Body/head and original static idle: **Stephen Challener (Redshrike)**; edits, recolours and animated idle: **Eliza Wyatt (DeathsDarling)**.
- Hair and clothing: **Eliza Wyatt (DeathsDarling)**, based on the LPC body.
- Complete component notices: [body/head](../lpc/credits.txt), [hair](../lpc/hair-credits.txt), [clothing](../lpc/clothing-credits.txt).

`sources.json` records each original download path, pinned URL, Git blob SHA and SHA-256. Files are unmodified upstream PNGs, 192×256, three idle frames and four rows (up / left / down / right). The exporter selects neutral column 0 and repeats it only inside the existing costume compositor, then exports a 64×256, one-frame-per-facing sheet.

Modifications in the derived game sheets: the project's character palettes, costumes and hair accessories; a neutral side sleeve/hand restoration mask. The approved 512×256 walking sheets and supplied full-body portraits are independent and unchanged. Original character designs remain with their respective rights holders; this source license does not license the BanG Dream designs.
