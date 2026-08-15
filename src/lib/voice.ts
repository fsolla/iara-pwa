/** Voz: transcrição (STT) e síntese (TTS) via endpoints configuráveis.
 *  Os endpoints são opcionais — sem eles, o chat funciona só em texto.
 */

export async function transcribe(sttUrl: string, blob: Blob): Promise<string> {
  const fd = new FormData();
  fd.append("file", blob, "audio.webm");
  fd.append("language", "pt");
  const r = await fetch(sttUrl, { method: "POST", body: fd });
  if (!r.ok) throw new Error(`STT falhou (${r.status})`);
  const d = await r.json();
  const text = d.text ?? d.transcript ?? d.data?.text;
  if (typeof text !== "string" || !text.trim()) throw new Error("STT sem transcrição");
  return text.trim();
}

export async function speak(ttsUrl: string, text: string): Promise<void> {
  const r = await fetch(ttsUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voice: "pt-BR" }),
  });
  if (!r.ok) throw new Error(`TTS falhou (${r.status})`);
  const blob = await r.blob();
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  await audio.play();
  audio.onended = () => URL.revokeObjectURL(url);
}

/** Grava o microfone (MediaRecorder) e devolve o áudio. */
export function recordAudio(onDone: (blob: Blob) => void, onError: (e: unknown) => void): () => void {
  let recorder: MediaRecorder | null = null;
  let chunks: Blob[] = [];

  navigator.mediaDevices
    .getUserMedia({ audio: true })
    .then((stream) => {
      const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
      recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        onDone(new Blob(chunks, { type: mime || "audio/webm" }));
        chunks = [];
      };
      recorder.start();
    })
    .catch(onError);

  return () => {
    if (recorder && recorder.state !== "inactive") recorder.stop();
  };
}
