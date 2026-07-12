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

## Architecture Notes

### Loading Strategy
- **Lazy:** Systems loaded on-demand when toggle clicked
- **Default:** Skeleton (SkeletalSystem100) + Visceral loaded at init
- **Draco:** DRACOLoader with jsDelivr CDN decoder

### Search
- Structure names from `structures.json` (9,155 entries)
- Fuzzy match: `name.toLowerCase().includes(query)`
- Sorted: exact match > starts-with > contains > shortest-name
- Mesh lookup: `mesh.name.toLowerCase().includes(structureName)`
- If system not loaded, triggers `loadSystem()` first

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
