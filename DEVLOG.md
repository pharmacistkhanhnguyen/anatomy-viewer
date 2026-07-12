# Anatomy 3D Viewer — Development Log

## Quick Links
- **Live:** https://pharmacistkhanhnguyen.github.io/anatomy-viewer/
- **Repo:** https://github.com/pharmacistkhanhnguyen/anatomy-viewer
- **Local:** `/mnt/d/Openclaw/anatomy-viewer/`

## Tech Stack
| Layer | Technology |
|---|---|
| 3D Renderer | Three.js 0.170 (ES modules from jsDelivr CDN) |
| Compression | Draco (KHR_draco_mesh_compression) |
| Model Source | Z-Anatomy (CC-BY-SA 4.0), based on BodyParts3D |
| FBX→GLB | FBX2glTF v0.13.1 (Godot fork) |
| Draco Compress | gltf-transform CLI v4.4.1 |
| Hosting | GitHub Pages (Fastly CDN) |
| Dev Environment | WSL2 on Windows, served by `python3 -m http.server` |

## Data Pipeline
```
BodyParts3D (.blend)
  → Z-Anatomy FBX export (9 files, 222 MB)
    → FBX2glTF (.glb, 184 MB)
      → gltf-transform draco (.glb draco, 31 MB, -84%)
        → static/ in GitHub Pages
```

## File Map
```
anatomy-viewer/
├── index.html              # Single-file viewer (20KB)
├── structures.json         # 9,155 structure→mesh mappings (2.8MB)
├── models/glb/draco/       # Draco-compressed GLB
│   ├── SkeletalSystem100.glb       (6.8 MB, 1,948 meshes)
│   ├── CardioVascular41.glb        (6.4 MB, 676 meshes)
│   ├── NervousSystem100.glb        (6.0 MB, 880 meshes)
│   ├── MuscularSystem100.glb       (4.7 MB, 786 meshes)
│   ├── VisceralSystem100.glb       (2.2 MB, 296 meshes)
│   ├── Joints100.glb               (1.6 MB, ~400 meshes)
│   ├── Regions of human body100.glb(1.2 MB, ~250 meshes)
│   ├── LymphoidOrgans100.glb       (468 KB, ~167 meshes)
│   └── References100.glb           (75 KB, ~47 meshes)
├── models/glb/            # Original GLB (gitignored)
├── models/fbx/            # Source FBX (gitignored)
├── data/                  # CSV mappings + translations
├── parse_structures.py    # CSV→JSON parser
├── convert_fbx_to_glb.py  # Blender FBX→GLB (unused, FBX2glTF used)
└── deploy_surge.py        # Attempted surge deploy (unused)
```

## Issues & Fixes

### #1 — Model invisible on load
**Symptom:** Page loads, 3D canvas renders, but no model visible. "Loading viewer..." shows but model never appears.

**Root Cause:** FBX model vertices in ~0.0003 range (millimeter units from Blender/BodyParts3D). Three.js uses meters. Camera at distance 8 units — model is microscopic.

**Fix (commit b3228e3):**
```javascript
// In loadSystem() — scale group by 1000x
group.scale.set(1000, 1000, 1000);

// Adjusted camera
camera.position.set(0, 1, 3);    // was (0, 1.5, 8)
controls.target.set(0, 0.9, 0);  // was (0, 1, 0)
controls.minDistance = 0.3;       // was 0.5
controls.maxDistance = 8;         // was 20
scene.fog = new THREE.Fog(color, 5, 15); // was 15, 50
```

### #2 — 0/9 loading stuck on mobile
**Symptom:** Bore.pub tunnel showed "Loading 0/9" forever. No models loaded.

**Root Causes:**
1. Bore.pub tunnel bandwidth ~12KB/s — 184MB GLB impossible to load
2. All 9 systems loaded eagerly at startup

**Fixes:**
1. Draco-compressed GLB: 184MB → 31MB (-84%)
2. Lazy loading: only Skeleton loads at startup via `loadSystem(SYSTEMS[0])`. Other systems load on toggle click.
3. Moved to GitHub Pages with Fastly CDN

### #3 — FBX2glTF mesh naming
**Verified OK:** All 9,155 structures have matching mesh names in GLB. Example from VisceralSystem100:
- `Kidney.l`, `Kidney.r` → search "kidney" works
- Structure→mesh lookup uses `name.toLowerCase().includes()`

### #4 — Tunnel hosting failures
Attempted and failed:
- **cloudflared:** killed by sandbox (SIGTERM on process)
- **localhost.run:** SSH -R worked but connection timed out from external
- **bore.pub:** worked but 12KB/s bandwidth, unusable for GLB
- **pagekite:** requires email signup
- **surge.sh:** requires interactive login

**Solution:** GitHub Pages with `ghp_` token — works reliably, CDN-fast.

---

## Software Structure Review — 2026-07 (branch `claude/software-structure-review-un3e3i`)

> Log for AI collaborators (Claude Code / Codex / OpenClaw). Read this before touching
> `loadSys()`, the camera setup, or the search/select path — the reasons below are not
> obvious from the code alone.

### How this was diagnosed (reproduce before changing)
The sandbox blocks the jsDelivr CDN for the **browser**, so `index.html` can't import
Three.js there directly. To run the real page headless:
1. `curl` the 5 modules through the proxy into a local `vendor/` dir:
   `three/build/three.module.js`, and from `three/examples/jsm/`:
   `controls/OrbitControls.js`, `loaders/GLTFLoader.js`, `renderers/CSS2DRenderer.js`,
   `utils/BufferGeometryUtils.js` (GLTFLoader imports the last one).
2. Copy `index.html`, rewrite the importmap to `./vendor/three/three.module.js` and
   `./vendor/addons/`, symlink `models/` and `structures.json`.
3. `python3 -m http.server` + `playwright-core` with
   `executablePath:/opt/pw-browsers/chromium-1194/chrome-linux/chrome`, `--use-gl=swiftshader`.
   (swiftshader is slow: a 2nd heavy GLB can take 20–40 s to parse — budget accordingly.)

For GLB facts without a browser, parse the GLB directly: read the 12-byte header, walk
chunks, `JSON.parse` the `JSON` chunk (`0x4E4F534A`). `three` also loads in plain Node
(`npm i three`) for logic-only repros (used to reproduce the crash below).

### #5 — App crashed on first model load (nothing ever rendered) — FIXED (Phase 1)
**Symptom:** loader spinner stuck on "Loading …", HUD `0 meshes`, blank canvas.
**Root cause:** `loadSys()` did `g.add(c)` (reparent mesh into a new group) **inside**
`gltf.scene.traverse()`. Moving a node mid-traversal mutates the `children` array being
iterated, so `Object3D.traverse` dereferences an undefined child and throws
`Cannot read properties of undefined (reading 'traverse')`. The load promise rejected on
the very first system → spinner never cleared. Confirmed by browser stack trace at
`index.html:123` and by a pure-`three` Node repro (reparent-in-traverse crashes; collect-then-add is fine).
**Fix:** use the loaded `gltf.scene` as the system group and only modify meshes in place
during traversal (material/userData/`allMeshEntries`). No reparenting → no mutation, and
it preserves the original node transforms (important — see #6).
**Do NOT** go back to flattening meshes into a fresh group; if you must, collect the
meshes into an array during traverse and `add` them afterwards.

### #6 — Only the lower body was framed — FIXED (Phase 2)
**Symptom:** after #5, the skeleton rendered but the torso/head were cut off the top.
**Key insight (corrects an earlier wrong assumption):** the systems are **already
co-registered**. Do not "normalize each system to 1.7 m" — that BREAKS alignment
(it would blow the visceral organs up to full body height). Evidence: mesh-*local*
accessor bounds look wildly different (0.7 m … 41 m) but the **world-space** bounds
(`Box3.setFromObject`, node transforms applied) are all ~1.7 m tall centered at
`(0, 0.86, 0)`; visceral is naturally ~0.9 m and higher because it is only torso organs.
**Root cause:** camera targeted `y=-0.5` (fit the old flatten-to-origin behavior from #5,
where meshes rendered at mesh-local coords ~`y=-0.57`). With node transforms preserved the
body sits at `y≈0.86`, so the old target framed only the legs.
**Fix:** camera `position (0,1,3)`, OrbitControls `target (0,0.95,0)`; same values in the
reset button and Escape reset. No per-system rescale/re-center.

### #7 — Search failed for any structure in an unloaded system — FIXED (Phase 3)
**Symptom:** searching a muscle/nerve/artery (systems not loaded at startup) flashed the
red "not found" border and did nothing; only Skeletal + Visceral (auto-loaded) were searchable.
**Root cause:** `select()` called `findMesh()` **before** loading the system. `findMesh`
only searches `allMeshEntries`, which holds meshes of *loaded* systems, so it returned
null and the "load the system" branch was unreachable.
**Fix:** map the structure's `system` field → SYSTEMS key (`sysKeyFor`, via
`file.startsWith(system)`), load that system first if needed, THEN `findMesh(s, preferKey)`
which prefers a mesh in the structure's own system before falling back to any loaded system.
**Verified:** search now triggers on-demand load (browser: Muscular GLB loaded, HUD
2,561 → 3,473); and deterministically 97.5% of the 3,624 known-system structures match
within their own system after loading.
**Caveat / known gap:** ~60% of structures (5,531 / 9,155) have `system: null` in
`structures.json` (sub-parts: surfaces, borders, heads). For those we can't know the
system, so they only resolve if their system happens to be loaded, and name matching is
still substring-only. Fixing this properly = Phase 4 (below).

### Still open (not yet done)
- **Phase 4 — structure→mesh matching.** Substring match is fragile; the full display
  name often isn't a substring of the mesh name (e.g. "Long head of biceps brachii" vs a
  `Biceps brachii` mesh), and null-system structures have no system hint. Idea: precompute
  a structure→system (and structure→mesh) index offline by scanning each GLB's mesh names,
  bake it into `structures.json`, and handle `.l/.r/.j/.g/.t` suffixes + Latin synonyms.
- **Phase 5 — drop the runtime CDN dependency.** Three.js (and any future DRACO decoder)
  loads from jsDelivr at runtime; if the CDN is unreachable (offline/firewall/outage) the
  ES-module import throws and the canvas is never created (total blank). Vendor Three.js
  locally and/or switch to the Draco GLBs in `models/glb/draco/` (≈9 MB vs ≈43 MB) with a
  configured `DRACOLoader`. NOTE: the current app loads uncompressed `*_blender.glb` and
  configures **no** DRACOLoader — don't point it at the `draco/` files without adding one.
- **Phase 6 — polish:** Lymphoid orientation, labels/explode, mobile UI.
- **`.gitignore` landmine:** it lists `models/glb/` and `models/glb/draco/`. The
  `*_blender.glb` files are already tracked (committed before the rule) so deploy works,
  but a fresh `git add` won't pick up new GLBs there. Keep an eye on this when changing models.

## Architecture Notes

### Loading Strategy
- **Lazy:** Systems loaded on-demand when toggle clicked
- **Default:** Skeleton (SkeletalSystem100) + Visceral loaded at init
- **Draco:** DRACOLoader with jsDelivr CDN decoder

### Search
- Structure names from `structures.json` (9,155 entries)
- Fuzzy match: `name.toLowerCase().includes(query)`
- Sorted: exact match > starts-with > contains > shortest-name
- Mesh lookup: `findMesh(s, preferKey)` — prefers a mesh in the structure's own
  system (`sysKeyFor`), then falls back to any loaded system (`mesh.name.includes(name)`)
- If the structure's system isn't loaded, `select()` loads it first, THEN looks up the mesh
  (see Issue #7 — this order matters; the old code searched before loading and always failed)

### Fly-to Animation
- Ease-in-out interpolation over 0.8s
- Camera + OrbitControls target animated simultaneously
- Offset: `worldPos + (0.3, 0.2, 0.5)`

### Highlight
- Emissive glow: `#4fc3f7` at intensity 0.7
- Previous highlight restored on new selection
- Material cloned per-mesh for individual control

## TODO / P3
- [ ] Label overlay (CSS2DRenderer or sprite labels)
- [ ] Multi-language toggle (Translations0.txt has EN/FR/ES/PT)
- [ ] Opacity slider per system
- [ ] Explode view (offset systems)
- [ ] Better mobile UI (toggle panel collapsible)
- [ ] Preload next system after initial load
- [ ] Mesh name fuzzy matching (handle `.j`, `.r`, `.l` suffixes from FBX)
