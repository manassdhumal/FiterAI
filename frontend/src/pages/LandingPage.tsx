export function LandingPage() {
  return (
    <section className="hero">
      <div className="hero__copy">
        <p className="eyebrow">Camera-based virtual try-on</p>
        <h1>See clothes on yourself before you buy them.</h1>
        <p className="hero__text">
          Capture a garment from an upload, a screenshot, or a shopping page, then preview it in a live mirror and save a more realistic render.
        </p>
        <div className="hero__actions">
          <button type="button">Capture Garment</button>
          <button type="button" className="button--ghost">Open Studio</button>
        </div>
      </div>
      <div className="hero__panel">
        <div className="hero__card">
          <span>Live Try-On</span>
          <strong>Pose tracking + live fit</strong>
        </div>
        <div className="hero__card">
          <span>Render Mode</span>
          <strong>Higher quality saved output</strong>
        </div>
      </div>
    </section>
  );
}
