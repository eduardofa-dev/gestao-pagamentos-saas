export async function readPdfText(source: ArrayBuffer | Uint8Array) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();

  const data = source instanceof Uint8Array ? source : new Uint8Array(source);
  const document = await pdfjs.getDocument({ data }).promise;
  const pages: string[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const lines = new Map<number, Array<{ x: number; text: string }>>();

      for (const item of content.items) {
        if (!("str" in item) || !("transform" in item)) continue;
        const y = Math.round(item.transform[5]);
        const x = item.transform[4];
        const line = lines.get(y) ?? [];
        line.push({ x, text: item.str });
        lines.set(y, line);
      }

      pages.push(
        [...lines.entries()]
          .sort(([a], [b]) => b - a)
          .map(([, items]) => items.sort((a, b) => a.x - b.x).map((item) => item.text).join(" "))
          .join("\n"),
      );
    }
  } finally {
    await document.destroy();
  }

  const text = pages.join("\n\n").trim();
  if (text.length < 20) {
    throw new Error("Não foi possível ler o texto. Se o PDF for uma imagem digitalizada, preencha os campos manualmente.");
  }
  return text;
}
