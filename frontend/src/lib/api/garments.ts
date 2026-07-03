export type GarmentIntakeResult = {
  garmentId: string;
  cleanUrl: string;
  hadTransparentSource: boolean;
  maskCoverageRatio: number;
  originalFilename: string;
  originalUrl: string;
  wasWornPhoto: boolean;
};

type GarmentIntakeResponse = {
  clean_url: string;
  garment_id: string;
  had_transparent_source: boolean;
  mask_coverage_ratio: number;
  original_filename: string;
  original_url: string;
  source_type: string;
  status: string;
  was_worn_photo: boolean;
};

export async function uploadGarment(file: File): Promise<GarmentIntakeResult> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch("/api/garments/intake", {
    body: formData,
    method: "POST"
  });

  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new Error(detail?.detail ?? `Garment intake failed (${response.status}).`);
  }

  const data = (await response.json()) as GarmentIntakeResponse;

  return {
    cleanUrl: data.clean_url,
    garmentId: data.garment_id,
    hadTransparentSource: data.had_transparent_source,
    maskCoverageRatio: data.mask_coverage_ratio,
    originalFilename: data.original_filename,
    originalUrl: data.original_url,
    wasWornPhoto: data.was_worn_photo
  };
}
