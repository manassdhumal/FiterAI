import { Fragment, useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";

import { CameraPreview } from "../components/CameraPreview";
import { DownloadIcon, GalleryIcon, MoonIcon, SunIcon, TrashIcon, UploadIcon } from "../components/icons";
import { uploadGarment } from "../lib/api/garments";
import {
  defaultFitAdjustments,
  type FitAdjustments
} from "../lib/pose/garmentFit";
import type { Theme } from "../hooks/useTheme";

const garmentSources = [
  "Upload image",
  "Paste image URL",
  "Screenshot crop",
  "Shopping page capture",
  "Wardrobe item"
];

const stepLabels = ["Upload", "Try On", "Fine-tune", "Your Looks"];

type GarmentProcessingStatus = "error" | "processing" | "ready";

type GarmentAsset = {
  name: string;
  src: string;
  status: GarmentProcessingStatus;
  statusMessage: string;
};

type SavedLook = {
  createdAt: string;
  id: string;
  src: string;
};

type FitControl = {
  key: keyof FitAdjustments;
  label: string;
  max: number;
  min: number;
  step: number;
};

const garmentStatusPill: Record<GarmentProcessingStatus, string> = {
  error: "danger",
  processing: "accent",
  ready: "success"
};

const fitControls: FitControl[] = [
  { key: "offsetX", label: "Move X", max: 0.4, min: -0.4, step: 0.01 },
  { key: "offsetY", label: "Move Y", max: 0.4, min: -0.4, step: 0.01 },
  { key: "scale", label: "Scale", max: 1.45, min: 0.7, step: 0.01 },
  { key: "rotation", label: "Rotate", max: 25, min: -25, step: 1 },
  { key: "torsoLength", label: "Torso Length", max: 0.4, min: -0.3, step: 0.01 },
  { key: "sleeveSpread", label: "Sleeve Spread", max: 0.4, min: -0.35, step: 0.01 }
];

function formatFitValue(control: FitControl, value: number) {
  if (control.key === "rotation") {
    return `${Math.round(value)}deg`;
  }

  if (control.key === "scale") {
    return `${value.toFixed(2)}x`;
  }

  return `${Math.round(value * 100)}%`;
}

type StudioPageProps = {
  theme: Theme;
  toggleTheme: () => void;
};

export function StudioPage({ theme, toggleTheme }: StudioPageProps) {
  const [garmentAsset, setGarmentAsset] = useState<GarmentAsset | null>(null);
  const [fitAdjustments, setFitAdjustments] = useState<FitAdjustments>(defaultFitAdjustments);
  const [savedLooks, setSavedLooks] = useState<SavedLook[]>([]);
  const [step, setStep] = useState(1);
  const [maxUnlockedStep, setMaxUnlockedStep] = useState(1);
  const uploadRequestIdRef = useRef(0);
  const isDark = theme === "dark";

  useEffect(() => {
    return () => {
      if (garmentAsset?.src.startsWith("blob:")) {
        URL.revokeObjectURL(garmentAsset.src);
      }

      savedLooks.forEach((savedLook) => {
        if (savedLook.src.startsWith("blob:")) {
          URL.revokeObjectURL(savedLook.src);
        }
      });
    };
  }, [garmentAsset, savedLooks]);

  const goToStep = (target: number) => {
    setStep(target);
    setMaxUnlockedStep((current) => Math.max(current, target));
  };

  const handleGarmentChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const requestId = ++uploadRequestIdRef.current;

    setGarmentAsset((current) => {
      if (current?.src.startsWith("blob:")) {
        URL.revokeObjectURL(current.src);
      }

      return {
        name: file.name,
        src: URL.createObjectURL(file),
        status: "processing",
        statusMessage: "Removing background and normalizing garment..."
      };
    });

    uploadGarment(file)
      .then((result) => {
        if (uploadRequestIdRef.current !== requestId) {
          return;
        }

        setGarmentAsset((current) => {
          if (current?.src.startsWith("blob:")) {
            URL.revokeObjectURL(current.src);
          }

          return {
            name: file.name,
            src: result.cleanUrl,
            status: "ready",
            statusMessage: result.hadTransparentSource
              ? "Background already transparent. Garment normalized for fitting."
              : result.wasWornPhoto
                ? "Detected a person in this photo - isolated just the garment from them."
                : "Background removed and garment normalized for fitting."
          };
        });
      })
      .catch((error: unknown) => {
        if (uploadRequestIdRef.current !== requestId) {
          return;
        }

        const message = error instanceof Error ? error.message : "Garment preprocessing failed.";
        setGarmentAsset((current) =>
          current
            ? {
                ...current,
                status: "error",
                statusMessage: `${message} Using the original upload without background removal.`
              }
            : current
        );
      });

    event.target.value = "";
  };

  const clearGarment = () => {
    uploadRequestIdRef.current += 1;

    setGarmentAsset((current) => {
      if (current?.src.startsWith("blob:")) {
        URL.revokeObjectURL(current.src);
      }

      return null;
    });
  };

  const updateFitAdjustment = (key: keyof FitAdjustments, value: number) => {
    setFitAdjustments((current) => ({
      ...current,
      [key]: value
    }));
  };

  const handleCapture = ({ createdAt, src }: { createdAt: string; src: string }) => {
    setSavedLooks((current) => [
      {
        createdAt,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        src
      },
      ...current
    ]);
  };

  const removeSavedLook = (id: string) => {
    setSavedLooks((current) => {
      const target = current.find((savedLook) => savedLook.id === id);
      if (target?.src.startsWith("blob:")) {
        URL.revokeObjectURL(target.src);
      }

      return current.filter((savedLook) => savedLook.id !== id);
    });
  };

  return (
    <section className="studio" id="studio">
      <header className="studio-nav">
        <button
          type="button"
          className="studio-nav__brand"
          onClick={() => document.querySelector(".site-nav")?.scrollIntoView({ behavior: "smooth" })}
        >
          <span className="brand__mark brand__mark--sm">F</span>
          Studio
        </button>

        <nav className="stepper" aria-label="Studio steps">
          {stepLabels.map((label, index) => {
            const stepNumber = index + 1;
            const isActive = stepNumber === step;
            const isDone = stepNumber < step;
            const isUnlocked = stepNumber <= maxUnlockedStep;

            return (
              <Fragment key={label}>
                <button
                  type="button"
                  className={[
                    "stepper__step",
                    isActive ? "stepper__step--active" : "",
                    isDone ? "stepper__step--done" : ""
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  disabled={!isUnlocked}
                  aria-current={isActive ? "step" : undefined}
                  onClick={() => goToStep(stepNumber)}
                >
                  <span className="stepper__index">{isDone ? "✓" : stepNumber}</span>
                  <span className="stepper__label">{label}</span>
                </button>
              </Fragment>
            );
          })}
        </nav>

        <div className="studio-nav__meta">
          <span className="step-counter">
            step {step} / {stepLabels.length}
          </span>
          <button type="button" className="icon-button" onClick={toggleTheme} title="Toggle theme">
            {isDark ? <SunIcon /> : <MoonIcon />}
          </button>
        </div>
      </header>

      <div className="studio__stage">
        {step === 1 ? (
          <article className="panel">
            <div>
              <h3>Upload a garment</h3>
              <p className="panel__subtitle">
                Drop a flat product shot. PNGs with a transparent background work best.
              </p>
            </div>

            {!garmentAsset ? (
              <label className="upload-dropzone">
                <span className="upload-dropzone__icon">
                  <UploadIcon />
                </span>
                <span>
                  <strong>Drop garment here</strong>
                  <small>or click to browse · PNG, JPG</small>
                </span>
                <input type="file" accept="image/*" onChange={handleGarmentChange} />
              </label>
            ) : (
              <div className="garment-preview">
                <div className="garment-preview__frame">
                  <img src={garmentAsset.src} alt={garmentAsset.name} />
                </div>
                <div className="garment-preview__meta-row">
                  <span className={`pill pill--${garmentStatusPill[garmentAsset.status]}${garmentAsset.status === "processing" ? " pill--pulse" : ""}`}>
                    <span className="pill__dot" />
                    {garmentAsset.status === "ready"
                      ? "Ready"
                      : garmentAsset.status === "processing"
                        ? "Processing…"
                        : "Error"}
                  </span>
                  <button type="button" className="link-button" onClick={clearGarment}>
                    Replace
                  </button>
                </div>
                <p className="panel__subtitle">{garmentAsset.statusMessage}</p>
              </div>
            )}

            <ul className="source-tags">
              {garmentSources.map((source, index) => (
                <li key={source} className={index === 0 ? "source-tag source-tag--active" : "source-tag"}>
                  {source}
                </li>
              ))}
            </ul>

            <div className="step-actions">
              <button type="button" disabled={!garmentAsset} onClick={() => goToStep(2)}>
                Continue to Try On <span aria-hidden="true">→</span>
              </button>
            </div>
          </article>
        ) : null}

        {step === 2 ? (
          <article className="panel">
            <div>
              <h3>Try it on</h3>
              <p className="panel__subtitle">
                Start your camera, line yourself up, then capture the looks you love.
              </p>
            </div>

            {garmentAsset ? (
              <div className="garment-summary">
                <img src={garmentAsset.src} alt={garmentAsset.name} />
                <div className="garment-summary__body">
                  <strong>{garmentAsset.name}</strong>
                  <p>{garmentAsset.statusMessage}</p>
                </div>
              </div>
            ) : null}

            <div className="step-actions">
              <button type="button" className="button--ghost" onClick={() => goToStep(1)}>
                Back
              </button>
              <button type="button" onClick={() => goToStep(3)}>
                Fine-tune the fit <span aria-hidden="true">→</span>
              </button>
            </div>
          </article>
        ) : null}

        {step === 3 ? (
          <article className="panel">
            <div className="fit-controls__header">
              <div>
                <h3>Fine-tune the fit</h3>
                <p className="panel__subtitle">Nudge the garment until it sits right.</p>
              </div>
              <button
                type="button"
                className="button--ghost"
                onClick={() => setFitAdjustments(defaultFitAdjustments)}
              >
                Reset
              </button>
            </div>

            <div className="fit-controls">
              {fitControls.map((control) => (
                <label key={control.key} className="fit-control">
                  <div className="fit-control__row">
                    <span>{control.label}</span>
                    <strong>{formatFitValue(control, fitAdjustments[control.key])}</strong>
                  </div>
                  <input
                    type="range"
                    min={control.min}
                    max={control.max}
                    step={control.step}
                    value={fitAdjustments[control.key]}
                    onChange={(event) =>
                      updateFitAdjustment(control.key, Number(event.target.value))
                    }
                  />
                </label>
              ))}
            </div>

            <div className="step-actions">
              <button type="button" className="button--ghost" onClick={() => goToStep(2)}>
                Back
              </button>
              <button type="button" onClick={() => goToStep(4)}>
                Save to Your Looks <span aria-hidden="true">→</span>
              </button>
            </div>
          </article>
        ) : null}

        {step === 4 ? (
          <article className="panel">
            <div className="saved-looks__header">
              <div>
                <h3>Your looks</h3>
                <p className="panel__subtitle">
                  Every capture, saved to this session. Download the ones you want to keep.
                </p>
              </div>
            </div>

            <div className="saved-looks__count">
              <strong>{savedLooks.length}</strong>
              <span>
                looks
                <br />
                captured
              </span>
            </div>

            {savedLooks.length === 0 ? (
              <div className="saved-looks__empty">
                <span className="saved-looks__empty-icon">
                  <GalleryIcon />
                </span>
                <div>
                  <strong>No looks yet</strong>
                  <p>Start your camera on Try On and capture a look — it'll show up here.</p>
                </div>
                <button type="button" className="button--ghost" onClick={() => goToStep(2)}>
                  Go to Try On
                </button>
              </div>
            ) : (
              <div className="saved-looks__grid">
                {savedLooks.map((savedLook, index) => (
                  <article key={savedLook.id} className="saved-look-card">
                    <img
                      src={savedLook.src}
                      alt={`Saved look ${index + 1}`}
                      className="saved-look-card__image"
                    />
                    <div className="saved-look-card__meta">
                      <div>
                        <strong>Look {String(index + 1).padStart(2, "0")}</strong>
                        <span>{savedLook.createdAt}</span>
                      </div>
                      <div className="saved-look-card__actions">
                        <a
                          href={savedLook.src}
                          download={`fitcheck-look-${index + 1}.png`}
                          className="icon-button snapshot-download"
                          title="Download"
                        >
                          <DownloadIcon />
                        </a>
                        <button
                          type="button"
                          className="icon-button"
                          title="Remove"
                          onClick={() => removeSavedLook(savedLook.id)}
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}

            <div className="step-actions">
              <button type="button" className="button--ghost" onClick={() => goToStep(3)}>
                Back
              </button>
            </div>

            <p className="saved-looks__tip">
              <span>TIP</span> — Looks live in this session only. Download before you close the tab.
            </p>
          </article>
        ) : null}

        <article className="panel panel--camera">
          <CameraPreview
            fitAdjustments={fitAdjustments}
            garmentName={garmentAsset?.name ?? null}
            garmentSrc={garmentAsset?.src ?? null}
            onCapture={handleCapture}
            useNaturalGarmentShape={garmentAsset?.status === "ready"}
          />
        </article>
      </div>
    </section>
  );
}
