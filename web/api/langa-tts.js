"use strict";

// VoiceBridge AI Pay: staging-only Langa speech provider.
// NOT connected to a public route. No automatic retries.

const URL = "https://langa.julimer.com/v1/audio/speech";

const VOICES = Object.freeze({
  "yo-NG": "yo",
  "ha-NG": "ha",
  "ig-NG": "ig"
});

export async function generateLangaAudio(answer, language) {
  if (
    process.env.VERCEL !== "1" ||
    process.env.VERCEL_ENV !== "production" ||
    process.env.ENABLE_LANGA_TTS !== "1"
  ) {
    throw new Error("tts_disabled");
  }

  const voice = Object.prototype.hasOwnProperty.call(VOICES, language)
    ? VOICES[language] : null;

  if (
    !voice ||
    typeof answer !== "string" ||
    answer.trim().length < 2 ||
    answer.length > 1300
  ) {
    throw new Error("tts_invalid_input");
  }

  const key = process.env.LANGA_TTS_API_KEY || "";

  if (key.length < 30 || /\s/.test(key)) {
    throw new Error("tts_not_configured");
  }

  const response = await fetch(URL, {
    method: "POST",
    redirect: "error",
    cache: "no-store",
    headers: {
      Authorization: "Bearer " + key,
      "Content-Type": "application/json; charset=utf-8",
      Accept: "audio/mpeg"
    },
    body: JSON.stringify({
      input: answer,
      voice
    }),
    signal: AbortSignal.timeout(90000)
  });

  if (!response.ok) {
    throw new Error("tts_provider_unavailable");
  }

  const declaredSize = Number(response.headers.get("content-length"));
  if (declaredSize > 2000000) {
    throw new Error("tts_audio_invalid");
  }

  const audio = Buffer.from(await response.arrayBuffer());

  if (audio.length < 500 || audio.length > 2000000) {
    throw new Error("tts_audio_invalid");
  }

  return audio;
}
