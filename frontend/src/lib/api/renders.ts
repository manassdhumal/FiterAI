export type RenderResult = {
  renderId: string;
  resultUrl: string;
  status: string;
};

type RenderCreateResponse = {
  render_id: string;
  result_url: string;
  status: string;
};

export async function createRealisticRender(personImage: Blob, garmentId: string): Promise<RenderResult> {
  const formData = new FormData();
  formData.append("file", personImage, "snapshot.png");
  formData.append("garment_id", garmentId);

  const response = await fetch("/api/renders", {
    body: formData,
    method: "POST"
  });

  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new Error(detail?.detail ?? `Render failed (${response.status}).`);
  }

  const data = (await response.json()) as RenderCreateResponse;

  return {
    renderId: data.render_id,
    resultUrl: data.result_url,
    status: data.status
  };
}
