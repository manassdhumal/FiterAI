# FiterAI Blueprint

## 1. Product vision

FiterAI is a web-first virtual try-on product with two connected experiences:

- `Live Try-On Mode`: a webcam-based mirror view that detects the body, aligns garments, and updates the fit as the user moves.
- `Render Mode`: a slower backend pipeline that produces a higher-quality saved image showing the user wearing the garment in the current scene or in an optional studio-style output.

The product starts as a personal prototype for laptop webcam usage, but the architecture should support later expansion into:

- a browser extension
- a floating always-on-top widget
- a multi-user consumer product
- a wardrobe and recommendation platform

## 2. Product goals

### Primary goals

- Support garment capture from uploads, screenshots, and shopping-page content.
- Provide a visually convincing live try-on experience in the browser.
- Produce a more realistic saved render that looks like the user is actually wearing the garment.
- Support a long-term architecture that can scale to more garment types, stronger ML, and personalization.

### Non-goals for the first build

- Authentication and user accounts
- Deep personalization and style recommendations
- Perfect cloth physics and advanced fold simulation
- Production-grade multi-tenant scaling

## 3. User personas

### Initial user

- Solo builder/tester using a laptop webcam
- Will tolerate slower rendering if quality is better
- Wants a strong technical base more than polished UI

### Future users

- Online shoppers evaluating garments from product pages
- Creators trying outfits quickly while recording or streaming
- Consumers saving wardrobes and fit history

## 4. Success criteria

### MVP success

- User can select or capture a garment.
- User can open the webcam and see the garment fit onto the body in live view.
- The fit remains reasonably stable through natural movement.
- User can manually correct the fit when needed.
- User can save a higher-quality render of the result.

### Strong v1 success

- Garment extraction works on common shopping images.
- Upper-body and basic lower-body try-on are usable.
- Saved renders look materially more realistic than the live preview.
- Wardrobe history retains tried items and saved renders.

## 5. Core user flows

### Flow A: garment capture to live try-on

1. User lands on the home page.
2. User chooses a garment source:
   - upload image
   - paste image URL
   - upload screenshot
   - crop from screenshot
   - capture from shopping-page content
   - select a saved wardrobe item
3. System detects one or more garments.
4. If multiple garments are found, user picks one.
5. System removes the background and tags the garment.
6. User opens the try-on studio.
7. Webcam starts in mirror mode.
8. Live try-on engine aligns the garment to the body.
9. User adjusts the fit if needed.

### Flow B: live try-on to realistic render

1. User freezes or selects the current live frame.
2. System submits the frame, garment, and fit state to the render pipeline.
3. Backend returns:
   - live-scene realistic render
   - optional studio render
4. User saves the final look.
5. Result is attached to wardrobe/history.

### Flow C: future floating widget workflow

1. User opens the lightweight widget or extension.
2. Widget detects the currently visible shopping garment.
3. User confirms or changes the selected garment.
4. Live mirror preview opens in a compact side view.
5. User can save, re-fit, or send the look to the full studio.

## 6. Functional requirements

### Garment intake

- Accept uploads in common image formats.
- Accept screenshots and crop-based selection.
- Support future direct browser tab/window capture.
- Auto-detect the primary garment when possible.
- Let the user choose when multiple garments are present.
- Remove garment backgrounds if transparency is missing.
- Tag garments with metadata when possible:
  - category
  - color
  - pattern
  - sleeve type
  - length
  - occasion

### Live try-on

- Use laptop webcam input.
- Run in mirror mode by default.
- Support upper-body-only camera framing when full body is not visible.
- Support full-body framing when available.
- Track pose continuously during movement.
- Fit garments with category-aware placement logic.
- Allow manual corrections:
  - move X/Y
  - scale
  - rotate
  - torso length
  - sleeve adjustment
  - recalibrate body
- Preserve original garment visual identity as much as possible.

### Render mode

- Generate a higher-quality result than live mode.
- Default to matching the actual webcam scene.
- Offer studio-style output later or as an optional mode.
- Prefer realism and fit quality over speed.
- Ask for a better image only if the garment input is too degraded to use.

### Wardrobe and history

- Save cleaned garment assets.
- Save tried items.
- Save final renders.
- Let the user delete saved garments and renders.
- Build toward a personal wardrobe experience.

## 7. Non-functional requirements

- Prefer visual quality over raw frame rate.
- Keep the architecture modular so live mode and render mode can evolve independently.
- Design for later support of many clothing categories, layers, and shopping sources.
- Make failure handling explicit for poor garment inputs or weak camera framing.
- Keep privacy controls simple but visible, especially around saved images and camera access.

## 8. Technical architecture

### 8.1 High-level system

```text
Frontend Web App
  -> Garment Intake UI
  -> Live Camera Studio
  -> Wardrobe/History
  -> Render Controls

Backend API
  -> Session Service
  -> Garment Intake Service
  -> Live Fit Service
  -> Render Service
  -> Wardrobe Service
  -> Metadata Tagging Service

ML/Vision Layer
  -> Pose Estimation
  -> Person Segmentation
  -> Garment Detection
  -> Background Removal
  -> Garment Classification
  -> Alignment/Warp Engine
  -> Realistic Try-On Model

Storage
  -> Garment Assets
  -> Render Assets
  -> Metadata DB
  -> Session State
```

### 8.2 Mode split

#### Live Try-On Engine

Optimized for:

- continuous preview
- low-to-medium latency
- stable tracking
- user-controlled fit correction

Pipeline:

1. Webcam frame capture
2. Pose landmark detection
3. Person segmentation
4. Body region estimation
5. Garment alignment and warp
6. Temporal smoothing
7. Canvas/WebGL compositing

#### Realistic Render Engine

Optimized for:

- realism
- texture preservation
- scene consistency
- saved output quality

Pipeline:

1. Select best frame
2. Refine body and garment masks
3. Normalize garment and body conditioning inputs
4. Run higher-quality virtual try-on model
5. Post-process result
6. Save asset and metadata

### 8.3 Garment intake pipeline

1. Receive source asset
2. Detect garment candidates
3. Let user confirm when multiple candidates exist
4. Crop and normalize selected garment
5. Remove background
6. Classify garment type
7. Extract metadata
8. Store cleaned asset

## 9. Recommended tech stack

### Frontend

- `React`
- `TypeScript`
- `Vite` for fast iteration, or `Next.js` if SSR and SEO later matter
- `Canvas` or `WebGL` for live compositing
- `zustand` or equivalent lightweight state store

### Backend

- `FastAPI`
- `Pydantic`
- `Uvicorn`
- `OpenCV`
- `Pillow`

### ML and vision

- Fast pose and segmentation model for live mode
- Background removal model for garment cleanup
- Garment detection and classification pipeline
- Higher-quality virtual try-on pipeline for render mode

### Storage

- local filesystem in early development
- `SQLite` first if a DB is needed immediately
- `PostgreSQL` later for durable production storage
- object storage later for garment and render assets

## 10. Proposed repository structure

```text
FiterAI/
  README.md
  docs/
    fitcheck-blueprint.md
    api-contract.md
    model-roadmap.md
  frontend/
    package.json
    src/
      app/
        routes/
          landing/
          studio/
          wardrobe/
      components/
        camera/
        garment/
        studio/
        wardrobe/
        common/
      hooks/
        use-camera.ts
        use-garment-intake.ts
        use-live-fit.ts
        use-render-job.ts
      lib/
        api/
        canvas/
        capture/
        state/
        types/
      styles/
  backend/
    requirements.txt
    app/
      main.py
      api/
        routes/
          health.py
          sessions.py
          garments.py
          tryon.py
          renders.py
          wardrobe.py
      core/
        config.py
        logging.py
      schemas/
        garment.py
        session.py
        tryon.py
        render.py
      services/
        garment_intake/
        live_fit/
        render_fit/
        wardrobe/
        tagging/
        storage/
      repositories/
      utils/
  ml/
    pose/
    segmentation/
    garment_parsing/
    tryon/
    shared/
  assets/
    sample-garments/
    sample-renders/
  data/
    garments/
    renders/
    sessions/
```

## 11. API contract draft

### `POST /api/garments/intake`

Purpose:

- upload or register a garment source

Input:

- source type
- file or reference
- optional crop coordinates

Output:

- garment id
- preview image
- candidate garments
- extracted metadata

### `POST /api/garments/{id}/select`

Purpose:

- confirm the chosen garment candidate

### `POST /api/sessions`

Purpose:

- create a live try-on session

Output:

- session id
- camera mode settings
- calibration defaults

### `POST /api/sessions/{id}/calibrate`

Purpose:

- recalibrate body alignment inputs

### `POST /api/tryon/live-fit`

Purpose:

- submit live body state and garment selection

Output:

- fit parameters
- overlay transform
- warnings if quality drops

### `POST /api/renders`

Purpose:

- generate a high-quality render from a selected frame and garment

Output:

- render job id
- status

### `GET /api/renders/{id}`

Purpose:

- fetch render status and result asset

### `GET /api/wardrobe`

Purpose:

- return saved garments and render history

### `DELETE /api/wardrobe/garments/{id}`

Purpose:

- remove a stored garment

### `DELETE /api/wardrobe/renders/{id}`

Purpose:

- remove a stored render

## 12. Data model draft

### Garment

- `id`
- `source_type`
- `source_ref`
- `original_asset_path`
- `clean_asset_path`
- `category`
- `subtype`
- `dominant_colors`
- `pattern`
- `sleeve_type`
- `length_type`
- `occasion_tags`
- `created_at`

### Session

- `id`
- `selected_garment_id`
- `camera_mode`
- `body_profile_ref`
- `calibration_state`
- `created_at`
- `updated_at`

### Render

- `id`
- `session_id`
- `garment_id`
- `render_mode`
- `source_frame_path`
- `output_asset_path`
- `status`
- `created_at`

### Wardrobe item

- `id`
- `garment_id`
- `last_used_at`
- `user_notes`

## 13. Delivery phases

### Phase 1: project foundation

- initialize frontend and backend
- establish shared types and contracts
- create landing page and try-on studio shell
- create garment upload and screenshot intake UI
- add basic API health and session routes

### Phase 2: garment intake MVP

- implement upload flow
- implement screenshot crop flow
- add garment candidate selection
- add background removal
- add basic tagging
- store cleaned assets

### Phase 3: live try-on MVP

- add webcam mirror feed
- integrate pose tracking
- integrate person segmentation
- align upper-body garments
- add manual fit controls
- add recalibration
- save preview snapshots

### Phase 4: realistic render MVP

- freeze selected camera frame
- send body and garment inputs to render service
- generate final render
- save final result
- show render progress and output

### Phase 5: wardrobe and history

- persist tried items
- persist final renders
- add wardrobe page
- add deletion flows

### Phase 6: shopping-page and widget expansion

- add browser-page capture path
- add multi-garment auto-detection
- add compact widget flow
- begin extension-oriented APIs

## 14. Risks and mitigations

### Risk: all-garment support is too broad for early quality

Mitigation:

- create category adapters from day one
- prioritize implementation quality in a few categories first
- keep shared interfaces general

### Risk: live mode and render mode diverge too much

Mitigation:

- define a shared garment representation
- define shared body calibration state
- keep render inputs compatible with live session outputs

### Risk: shopping screenshots are noisy

Mitigation:

- use user confirmation when detection is uncertain
- always support manual crop correction

### Risk: realism expectations exceed live-preview capabilities

Mitigation:

- explicitly separate preview and final render quality
- invest in saved render fidelity without blocking live usability

## 15. Immediate implementation milestone

The first build milestone should prove the end-to-end backbone:

1. User uploads or crops a garment from a screenshot.
2. System cleans the garment background.
3. User opens webcam live preview.
4. System fits the garment onto the user in mirror view.
5. User adjusts fit manually if needed.
6. User saves a higher-quality render.

If that milestone works, the project has validated the core product loop and can expand safely.

## 16. Next implementation tasks

1. Scaffold `frontend/` and `backend/`.
2. Build the landing page and studio shell.
3. Implement garment upload plus screenshot crop intake.
4. Add webcam live preview.
5. Add first-pass body landmark and garment overlay logic.
6. Add render job flow and saved outputs.
