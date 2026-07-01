import { CameraPreview } from "../components/CameraPreview";

const garmentSources = [
  "Upload image",
  "Paste image URL",
  "Screenshot crop",
  "Shopping page capture",
  "Wardrobe item"
];

const manualControls = [
  "Move X/Y",
  "Scale",
  "Rotate",
  "Torso length",
  "Sleeve adjust",
  "Recalibrate"
];

export function StudioPage() {
  return (
    <section className="studio">
      <div className="studio__header">
        <p className="eyebrow">Studio shell</p>
        <h2>Build the capture, fit, and render loop here.</h2>
      </div>

      <div className="studio__grid">
        <article className="panel">
          <h3>Garment Intake</h3>
          <ul>
            {garmentSources.map((source) => (
              <li key={source}>{source}</li>
            ))}
          </ul>
        </article>

        <article className="panel panel--camera">
          <h3>Camera Preview</h3>
          <CameraPreview />
        </article>

        <article className="panel">
          <h3>Fit Controls</h3>
          <ul>
            {manualControls.map((control) => (
              <li key={control}>{control}</li>
            ))}
          </ul>
        </article>
      </div>
    </section>
  );
}
