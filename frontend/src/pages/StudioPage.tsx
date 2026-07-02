import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";

import { CameraPreview } from "../components/CameraPreview";
import { uploadGarment } from "../lib/api/garments";
import {
  defaultFitAdjustments,
  type FitAdjustments
} from "../lib/pose/garmentFit";

const garmentSources = [
  "Upload image",
  "Paste image URL",
  "Screenshot crop",
  "Shopping page capture",
  "Wardrobe item"
];

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

const garmentStatusBadge: Record<GarmentProcessingStatus, string> = {
  error: "error",
  processing: "requesting",
  ready: "live"
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

export function StudioPage() {
  const [garmentAsset, setGarmentAsset] = useState<GarmentAsset | null>(null);
  const [fitAdjustments, setFitAdjustments] = useState<FitAdjustments>(defaultFitAdjustments);
  const [savedLooks, setSavedLooks] = useState<SavedLook[]>([]);
  const uploadRequestIdRef = useRef(0);

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
    <section className="studio">
      <div className="studio__header">
        <p className="eyebrow">Studio shell</p>
        <h2>Build the capture, fit, and render loop here.</h2>
      </div>

      <div className="studio__grid">
        <article className="panel">
          <h3>Garment Intake</h3>
          <p className="panel__subtitle">
            Start with a local garment image so we can place a real asset onto the live torso region.
          </p>

          <label className="upload-dropzone">
            <span>Choose garment image</span>
            <small>PNG works best right now, but any image file can be tested.</small>
            <input type="file" accept="image/*" onChange={handleGarmentChange} />
          </label>

          {garmentAsset ? (
            <div className="garment-preview">
              <img src={garmentAsset.src} alt={garmentAsset.name} />
              <div className="garment-preview__meta">
                <strong>{garmentAsset.name}</strong>
                <span className={`camera-badge camera-badge--${garmentStatusBadge[garmentAsset.status]}`}>
                  {garmentAsset.status}
                </span>
                <p>{garmentAsset.statusMessage}</p>
                <button type="button" className="button--ghost" onClick={clearGarment}>
                  Remove garment
                </button>
              </div>
            </div>
          ) : null}

          <ul>
            {garmentSources.map((source) => (
              <li key={source}>{source}</li>
            ))}
          </ul>
        </article>

        <article className="panel panel--camera">
          <h3>Camera Preview</h3>
          <CameraPreview
            fitAdjustments={fitAdjustments}
            garmentName={garmentAsset?.name ?? null}
            garmentSrc={garmentAsset?.src ?? null}
            onCapture={handleCapture}
            useNaturalGarmentShape={garmentAsset?.status === "ready"}
          />
        </article>

        <article className="panel">
          <div className="fit-controls__header">
            <div>
              <h3>Fit Controls</h3>
              <p className="panel__subtitle">
                These controls now change the garment placement live in the preview.
              </p>
            </div>
            <button
              type="button"
              className="button--ghost"
              onClick={() => setFitAdjustments(defaultFitAdjustments)}
            >
              Reset fit
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
        </article>
      </div>

      <section className="saved-looks panel">
        <div className="saved-looks__header">
          <div>
            <h3>Saved Looks</h3>
            <p className="panel__subtitle">
              Captured try-on looks stay here locally during this session so you can compare and download them.
            </p>
          </div>
        </div>

        {savedLooks.length === 0 ? (
          <p className="saved-looks__empty">
            No captured looks yet. Start the camera, try a garment, and click `Capture Look`.
          </p>
        ) : (
          <div className="saved-looks__grid">
            {savedLooks.map((savedLook, index) => (
              <article key={savedLook.id} className="saved-look-card">
                <img src={savedLook.src} alt={`Saved look ${index + 1}`} className="saved-look-card__image" />
                <div className="saved-look-card__meta">
                  <strong>Look {index + 1}</strong>
                  <p>{savedLook.createdAt}</p>
                </div>
                <div className="saved-look-card__actions">
                  <a href={savedLook.src} download={`fitcheck-look-${index + 1}.png`} className="snapshot-download">
                    Download
                  </a>
                  <button type="button" className="button--ghost" onClick={() => removeSavedLook(savedLook.id)}>
                    Remove
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}