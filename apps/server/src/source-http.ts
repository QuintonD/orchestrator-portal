export async function boundedText(response: Response, maximum = 1024 * 1024): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > maximum) { await reader.cancel(); throw new Error("Source response exceeds the 1 MiB limit"); }
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString("utf8");
  } finally { reader.releaseLock(); }
}
