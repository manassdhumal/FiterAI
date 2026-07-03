import type { Theme } from "../hooks/useTheme";
import { MoonIcon, PersonIcon, SparkleIcon, SunIcon } from "../components/icons";

type LandingPageProps = {
  theme: Theme;
  toggleTheme: () => void;
};

function scrollToStudio() {
  document.getElementById("studio")?.scrollIntoView({ behavior: "smooth" });
}

const skeletonJoints = [
  { cx: 100, cy: 80, delay: "0s" },
  { cx: 58, cy: 130, delay: "0.2s" },
  { cx: 142, cy: 130, delay: "0.4s" },
  { cx: 100, cy: 150, delay: "0.1s" },
  { cx: 74, cy: 160, delay: "0s" },
  { cx: 126, cy: 160, delay: "0s" },
  { cx: 70, cy: 248, delay: "0.3s" },
  { cx: 130, cy: 248, delay: "0.5s" }
];

export function LandingPage({ theme, toggleTheme }: LandingPageProps) {
  const isDark = theme === "dark";

  return (
    <>
      <header className="site-nav">
        <div className="brand">
          <span className="brand__mark">F</span>
          Fiter<span className="brand__accent">AI</span>
        </div>
        <div className="site-nav__actions">
          <span className="pill pill--success pill--pulse">
            <span className="pill__dot" />
            Live beta
          </span>
          <button type="button" className="icon-button" onClick={toggleTheme} title="Toggle theme">
            {isDark ? <SunIcon /> : <MoonIcon />}
          </button>
          <button type="button" onClick={scrollToStudio}>
            Open Studio
          </button>
        </div>
      </header>

      <section className="hero">
        <div className="hero__inner">
          <div className="hero__copy">
            <span className="pill pill--success pill--pulse" style={{ marginBottom: "1.35rem" }}>
              <span className="pill__dot" />
              Real-time pose tracking
            </span>
            <h1>
              Your camera is
              <br />
              the fitting room.
            </h1>
            <p className="hero__text">
              Upload any garment. FiterAI tracks your pose and fits it to you in real time — right in
              the browser, no app, no waiting.
            </p>
            <div className="hero__actions">
              <button type="button" onClick={scrollToStudio}>
                Open Studio <span aria-hidden="true">→</span>
              </button>
              <span className="hero__note">Free while in beta</span>
            </div>
          </div>

          <div className="hero__device">
            <div className="hero__device-frame">
              <div className="hero__device-noise" />
              <div className="hero__device-vignette" />
              <svg className="hero__device-skeleton" viewBox="0 0 200 320">
                <g fill="none" stroke="oklch(0.86 0.2 128)" strokeWidth="3" strokeLinecap="round" opacity="0.9">
                  <line x1="100" y1="55" x2="100" y2="150" />
                  <line x1="100" y1="80" x2="58" y2="130" />
                  <line x1="100" y1="80" x2="142" y2="130" />
                  <line x1="58" y1="130" x2="46" y2="182" />
                  <line x1="142" y1="130" x2="154" y2="182" />
                  <line x1="100" y1="150" x2="74" y2="160" />
                  <line x1="100" y1="150" x2="126" y2="160" />
                  <line x1="74" y1="160" x2="70" y2="248" />
                  <line x1="126" y1="160" x2="130" y2="248" />
                  <line x1="70" y1="248" x2="66" y2="300" />
                  <line x1="130" y1="248" x2="134" y2="300" />
                </g>
                <circle cx="100" cy="42" r="15" fill="none" stroke="oklch(0.86 0.2 128)" strokeWidth="3" />
                <g fill="oklch(0.86 0.2 128)">
                  {skeletonJoints.map((joint) => (
                    <circle
                      key={`${joint.cx}-${joint.cy}`}
                      cx={joint.cx}
                      cy={joint.cy}
                      r={5}
                      style={{ animation: `fai-joint 1.6s ${joint.delay} infinite` }}
                    />
                  ))}
                </g>
              </svg>
              <div className="hero__device-scan" />
              <span className="pill pill--success pill--pulse hero__device-badge">
                <span className="pill__dot" />
                TRACKING
              </span>
              <div className="hero__device-footer">
                <span className="hero__device-garment">
                  <span className="hero__device-swatch" />
                  Silk bomber
                </span>
                <span className="hero__device-fit">98% fit</span>
              </div>
            </div>
          </div>
        </div>

        <div className="feature-grid">
          <article className="feature-card feature-card--live">
            <div className="feature-card__top">
              <span className="feature-card__icon">
                <PersonIcon />
              </span>
              <span className="pill pill--success pill--pulse">
                <span className="pill__dot" />
                LIVE
              </span>
            </div>
            <h3>Pose tracking + live fit</h3>
            <p>
              Skeletal tracking pins the garment to your body as you move. Turn, step back, strike a
              pose — the fit follows.
            </p>
          </article>

          <article className="feature-card feature-card--planned">
            <div className="feature-card__top">
              <span className="feature-card__icon feature-card__icon--muted">
                <SparkleIcon />
              </span>
              <span className="pill pill--outline">COMING SOON</span>
            </div>
            <h3>HQ render mode</h3>
            <p>Cloth-simulated, studio-lit renders of your look — folds, shadows and drape. In the workshop.</p>
          </article>
        </div>
      </section>
    </>
  );
}
