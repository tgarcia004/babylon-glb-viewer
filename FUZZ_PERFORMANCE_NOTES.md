# Fuzz cards — performance and tuning

This note summarizes how the `FuzzGenerator` + Node Material setup behaves on the web and how to stay near the stated **~70k triangle** upholstered furniture budget.

## Triangle accounting

- Each fuzz card is **one quad** = **2 triangles** = **4 unique vertices** (no index sharing across cards).
- Total fuzz triangles ≈ `2 × acceptedCards`, capped by `maxFuzzCardCount` and by `floor(surfaceArea × cardDensity)` where `surfaceArea` is computed from mesh triangle geometry in **the mesh’s local units**.
- Example (local metres): hull surface ≈ 8 m², `cardDensity = 600`, uncapped card estimate ≈ 4800 → **~9600 fuzz triangles**. Combined with a 55–60k base sofa you remain close to a 70k ceiling.

## Strand textures and `invertY`

`DynamicTexture` defaults to **`invertY = true`**. If your strand alpha image is painted in normal canvas coordinates (opaque where `strandV` should be **0** at the root), that default **flips V** and the shader samples **transparent texels at every root**. Final alpha becomes ~0 and you only see the opaque hull.

Fix: pass **`invertY: false`** into `DynamicTexture`’s constructor (last argument), or bake the gradient with the GPU flip in mind. In recent Babylon builds `invertY` is not writable after creation.

## Cost hotspots

1. **Fill rate / overdraw** — Many overlapping transparent cards multiply fragment cost. Mitigations:
   - Lower `cardLength`, narrower `cardWidth`, fewer cards (`cardDensity` / `maxFuzzCardCount`).
   - Use `fuzzMaskTexture` / authored meshes so fuzz stays only where visually necessary (seat/back cushions, not hidden undersides).
   - Prefer darker upholstery LOD variants where fuzz contributes less perceptually.

2. **Alpha blending + sorting** — The fuzz Node Material uses **alpha blend** with **`disableDepthWrite = true`** to reduce harsh layering artifacts. This can expose sorting quirks when strands intersect opaque silhouettes strongly.
   - If popping appears on silhouette-heavy angles, reduce overdraw or simplify silhouette LOD mesh first.

3. **CPU placement (`cardDensity` high)** — Building triangle lists + prefix sums + rejection sampling runs once up-front but scales ~linearly with attempts (`≤ max(maxAttempts, …)`).
   - For authoring pipelines run fuzz bake offline once per SKU rather than every scene load.

4. **CPU mask sampling** — Optional mask textures call `readPixels` once at build time. Large masks increase stall risk briefly during startup.

## Skinned / morphed glTF meshes

The generator samples **static indexed geometry** in mesh-local space and parents the fuzz mesh under `baseMesh`. **Animated skeletal deformation will not drive fuzz strands.** Typical workflows:

- Bake upholstery hull for fuzz passes at rest pose and accept pose mismatch for subtle fuzz.
- Or regenerate fuzz client-side after bake export per pose (usually impractical).
- For hero shots use morph targets baked into the hull positions before fuzz generation.

## Matching NGE (Node Geometry Editor)

If you rebuild this stack visually in NGE, preserve buffer semantics:

| Channel | Meaning |
| --- | --- |
| `uv` | Inherited fabric UVs — must match `baseColorTexture`. |
| `uv2.x` | Per-card wind phase (0–1). |
| `uv2.y` | Strand height (0 root → 1 tip). |
| `color.rgb` | Random tint near white for variation. |
| `color.a` | Vertex mask from mesh sampling / authoring (multiplies shader alpha). |

## Parameter cheat sheet

| Knob | Lower value | Higher value |
| --- | --- | --- |
| `cardDensity` | Fewer cards, faster GPU | Fuller pile (watch triangle budget) |
| `cardLength` | Less overdraw / silhouette halo | Fluffier read |
| `cardWidth` | Finer fibers | Broader fuzzy ribbons |
| `randomLengthVariation` | Uniform strands | Natural uneven pile |
| `normalOffset` | Might z-fight base mesh | Lifts roots slightly |
| `colorVariationAmount` | Cleaner uniform fuzz | Breaks “cloned ribbon” look |
| `tipFadePower` (material) | Softer longer fade along strand | Sharper tips |
| `windStrength` / `windFrequency` | Static groom | Stronger breeze oscillation |

## Thin instances (advanced)

The default implementation emits **one merged mesh** so each vertex carries unique inherited UVs without custom instancing attributes. For extreme densities you could move to **thin instances** of a reference quad plus custom buffers for UV / tint — that requires extending the Node Material with matching **instance attributes**, which is more shader work but reduces CPU vertex duplication cost.
