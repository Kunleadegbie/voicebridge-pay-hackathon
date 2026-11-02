"use strict";

// Stage 3E-B3: typed financial education ONLY.
// No payments, N-ATLAS jobs, localStorage, sessionStorage or AI credentials.
// History is kept in this page's memory and returned by the protected proxy.
(() => {
  const $ = id => document.getElementById(id);
  const passcode = $("assistant-passcode");
  const unlock = $("assistant-start");
  const end = $("assistant-end");
  const newConversation = $("assistant-new");
  const capacity = $("assistant-capacity");
  const capacityStatus = $("assistant-capacity-status");
  const accessStatus = $("assistant-access-status");
  const status = $("assistant-status");
  const messages = $("assistant-messages");
  const question = $("assistant-question");
  const language = $("assistant-language");
  const sourceStatus = $("assistant-source-status");
  const review = $("assistant-review");
  const privacy = $("assistant-privacy");
  const form = $("assistant-form");
  const ask = $("assistant-ask");
  const suggestions = document.querySelectorAll(".assistant-example");
  if (!passcode || !form || !messages) return;

  let unlocked = false;
  let inFlight = false;
  let uncertainSubmission = false;
  let history = [];
  let contextProof = "";
  let imported = false;
  let reviewed = false;

  // Optional, user-initiated English playback of an already verified AI answer.
  // Browser/device speech synthesis does not use the payment, N-ATLAS, or AI APIs.
  // Device speech engines and voice quality vary; no automatic playback.
  let activeSpeech = null;
  let activeSpeechButton = null;
  let activeLangaAudio = null;
  let activeLangaRequest = null;
  let activeLangaUrl = null;

  function playbackSupported() {
    return Boolean(globalThis.speechSynthesis &&
      typeof globalThis.speechSynthesis.speak === "function" &&
      typeof globalThis.speechSynthesis.cancel === "function" &&
      typeof globalThis.SpeechSynthesisUtterance === "function");
  }

  function stopAnswerSpeech() {
    // Clear the active item before cancel: cancelled utterances may emit
    // asynchronous end/error events which must not affect a newer answer.
    if (activeSpeechButton) {
      if (activeSpeechButton.dataset.speechProvider === "langa") {
        activeSpeechButton.textContent = "Audio closed";
        activeSpeechButton.disabled = true;
      } else {
        activeSpeechButton.textContent = "Listen to answer";
      }
      activeSpeechButton.setAttribute("aria-pressed", "false");
    }
    activeSpeech = null;
    activeSpeechButton = null;
    if (activeLangaRequest) activeLangaRequest.abort();
    activeLangaRequest = null;

    if (activeLangaAudio) {
      activeLangaAudio.pause();
      activeLangaAudio.removeAttribute("src");
      activeLangaAudio.load();
    }
    activeLangaAudio = null;

    if (activeLangaUrl) {
      globalThis.URL.revokeObjectURL(activeLangaUrl);
    }
    activeLangaUrl = null;

    if (playbackSupported()) globalThis.speechSynthesis.cancel();
  }

  function playAnswerSpeech(answer, button) {
    // Never allow playback as a substitute for an authenticated/verified answer.
    if (!unlocked || inFlight || uncertainSubmission || !playbackSupported()) return;
    if (activeSpeechButton === button) {
      stopAnswerSpeech();
      return;
    }
    stopAnswerSpeech();
    const utterance = new globalThis.SpeechSynthesisUtterance(answer);
    utterance.lang = "en-NG";
    utterance.rate = 0.95;
    // Prefer Nigerian English when available, otherwise another English voice.
    // No claims are made about accent or locally installed voices.
    const voices = typeof globalThis.speechSynthesis.getVoices === "function"
      ? globalThis.speechSynthesis.getVoices() : [];
    if (Array.isArray(voices)) {
      const selected = voices.find(voice =>
        typeof voice.lang === "string" && voice.lang.toLowerCase() === "en-ng") ||
        voices.find(voice =>
          typeof voice.lang === "string" && voice.lang.toLowerCase().startsWith("en"));
      if (selected) utterance.voice = selected;
    }
    utterance.onstart = () => {
      if (activeSpeech === utterance) {
        console.info("[speech] Browser speech started");
      }
    };
    utterance.onend = () => {
      if (activeSpeech === utterance) stopAnswerSpeech();
    };
    utterance.onerror = (event) => {
      if (activeSpeech === utterance) {
        stopAnswerSpeech();
        setStatus("Browser speech error: " + String(event?.error || "unknown") + ". You can still read the answer.");
      }
    };
    activeSpeech = utterance;
    activeSpeechButton = button;
    button.textContent = "Stop speaking";
    button.setAttribute("aria-pressed", "true");
    try {
      if (globalThis.speechSynthesis.paused) globalThis.speechSynthesis.resume();
      globalThis.speechSynthesis.speak(utterance);
    } catch {
      stopAnswerSpeech();
      setStatus("Audio playback is unavailable on this device. The written answer remains available.");
    }
  }

  // Request audio only after a separate, explicit user consent action.
  // This function does not automatically play audio or retry requests.
  async function requestLangaAudio(answer, answerLanguage, speechProof, signal) {
    if (!["yo-NG", "ha-NG", "ig-NG"].includes(answerLanguage) ||
        typeof answer !== "string" ||
        answer.trim().length < 2 ||
        answer.length > 1300 ||
        typeof speechProof !== "string" ||
        !speechProof ||
        !signal) {
      throw new Error("This speech request is not valid.");
    }

    const response = await fetch("/api/tts", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "VoiceBridgeTTS"
      },
      body: JSON.stringify({
        answer,
        language: answerLanguage,
        speech_proof: speechProof,
        confirm_tts_privacy: true
      }),
      cache: "no-store",
      signal
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error("Your assistant session has expired. Unlock again.");
      }
      if (response.status === 403) {
        throw new Error("Speech authorization is invalid or expired.");
      }
      if (response.status === 409) {
        throw new Error("This audio request was already used. Do not retry it.");
      }
      if (response.status === 429) {
        throw new Error("The speech allowance has been reached.");
      }
      throw new Error(
        "Speech generation is unavailable. The written answer remains available."
      );
    }

    const type = response.headers.get("content-type") || "";
    if (!/^audio\/mpeg(?:\s*;|$)/i.test(type)) {
      throw new Error("The speech service returned an invalid audio format.");
    }

    const declaredSize = Number(
      response.headers.get("content-length") || "0"
    );

    if (declaredSize > 2000000) {
      throw new Error("The audio response exceeds the safety limit.");
    }

    const audio = await response.blob();

    if (audio.size < 500 || audio.size > 2000000) {
      throw new Error("The downloaded audio is invalid.");
    }

    return audio;
  }
  // Prepare Langa audio without autoplay.
  // A separate user click will start playback on mobile devices.
  async function prepareLangaPlayback(
    answer, answerLanguage, speechProof, button
  ) {
    if (!unlocked || inFlight || uncertainSubmission ||
        typeof globalThis.Audio !== "function" ||
        typeof globalThis.URL?.createObjectURL !== "function") {
      setStatus("Audio preparation is unavailable on this device.");
      return;
    }

    stopAnswerSpeech();

    const controller = new AbortController();
    activeLangaRequest = controller;
    activeSpeechButton = button;

    button.textContent = "Cancel audio request";
    button.setAttribute("aria-pressed", "true");

    setStatus("Preparing the selected-language audio. Please wait.");

    try {
      const blob = await requestLangaAudio(
        answer,
        answerLanguage,
        speechProof,
        controller.signal
      );

      if (activeLangaRequest !== controller || !unlocked) {
        return;
      }

      const url = globalThis.URL.createObjectURL(blob);
      activeLangaUrl = url;

      const audio = new globalThis.Audio(url);
      activeLangaAudio = audio;
      activeLangaRequest = null;

      audio.onended = () => {
        if (activeLangaAudio === audio) {
          audio.currentTime = 0;
          button.textContent = "Play prepared audio";
          button.setAttribute("aria-pressed", "false");
          setStatus("Audio finished. You may replay the prepared audio.");
        }
      };

      audio.onerror = () => {
        if (activeLangaAudio === audio) {
          stopAnswerSpeech();
          setStatus(
            "Audio playback failed. The written answer remains available."
          );
        }
      };

      button.textContent = "Play prepared audio";
      button.setAttribute("aria-pressed", "false");

      setStatus(
        "Audio is ready. Click Play prepared audio to hear the answer."
      );
    }
    catch (error) {
      if (activeLangaRequest !== controller) {
        return;
      }

      stopAnswerSpeech();

      if (error?.name !== "AbortError") {
        setStatus(
          error?.message ||
          "Audio preparation failed. The written answer remains available."
        );
      }
    }
  }

  // Called only from a deliberate user click, never automatically.
  async function playPreparedLangaAudio(button) {
    if (!unlocked || inFlight || uncertainSubmission ||
        activeSpeechButton !== button ||
        !activeLangaAudio) {
      return;
    }

    const audio = activeLangaAudio;

    try {
      await audio.play();

      if (activeLangaAudio === audio) {
        button.textContent = "Stop speaking";
        button.setAttribute("aria-pressed", "true");
      }
    }
    catch {
      if (activeLangaAudio === audio) {
        stopAnswerSpeech();
        setStatus(
          "Your device could not play the audio. The written answer remains available."
        );
      }
    }
  }
  function setStatus(message) { status.textContent = message; }
  function controls() {
    unlock.disabled = inFlight || unlocked || passcode.value.trim().length < 1;
    end.disabled = inFlight || !unlocked;
    newConversation.disabled = inFlight || !unlocked;
    capacity.disabled = inFlight || !unlocked;
    question.disabled = inFlight || !unlocked || uncertainSubmission;
    if (language) language.disabled = inFlight || !unlocked || uncertainSubmission;
    privacy.disabled = inFlight || !unlocked || uncertainSubmission;
    if (review) {
      review.disabled = inFlight || !unlocked || uncertainSubmission || !imported;
      if (!imported) review.checked = false;
    }
    ask.disabled = inFlight || !unlocked || uncertainSubmission ||
      (imported && !reviewed) || !privacy.checked || question.value.trim().length < 3 ||
      question.value.length > 500 ||
      !(globalThis.crypto && typeof globalThis.crypto.randomUUID === "function");
    for (const button of suggestions) button.disabled = inFlight || !unlocked ||
      uncertainSubmission;
  }
  function resetConversation() {
    stopAnswerSpeech();
    history = [];
    contextProof = "";
    uncertainSubmission = false;
    imported = false;
    reviewed = false;
    if (review) review.checked = false;
    if (sourceStatus) sourceStatus.textContent =
      "Type a question, or import a completed Nigerian English N-ATLAS transcript. Importing does not spend an AI request.";
    question.value = "";
    messages.replaceChildren();
    const empty = document.createElement("p");
    empty.className = "assistant-empty";
    empty.textContent = "Start a new conversation by asking a financial education question.";
    messages.appendChild(empty);
    setStatus("Conversation cleared in this browser. The AI quota is not reset.");
    controls();
  }
  function show(role, content, context, answerLanguage = "en-NG", speechProof = null) {
    const empty = messages.querySelector(".assistant-empty");
    if (empty) empty.remove();
    const article = document.createElement("article");
    article.className = "assistant-message";
    article.dataset.role = role;
    const title = document.createElement("strong");
    title.textContent = role === "user" ? "Your question" : "Financial Intelligence Assistant";
    const body = document.createElement("p");
    body.textContent = content; // NEVER innerHTML: provider output is untrusted.
    article.append(title, body);
    if (role === "assistant" && context) {
      const small = document.createElement("small");
      small.textContent = context;
      article.appendChild(small);
    }
    if (role === "assistant" && answerLanguage === "en-NG" && playbackSupported()) {
      const listen = document.createElement("button");
      listen.type = "button";
      listen.className = "assistant-listen";
      listen.textContent = "Listen to answer";
      listen.setAttribute("aria-label", "Listen to this answer in English");
      listen.setAttribute("aria-pressed", "false");
      listen.addEventListener("click", () => playAnswerSpeech(content, listen));
      article.appendChild(listen);
    }
    // Langa is offered only for validated non-English AI answers.
    if (role === "assistant" &&
        ["yo-NG", "ha-NG", "ig-NG"].includes(answerLanguage) &&
        typeof speechProof === "string" &&
        speechProof.length > 20) {

      const consentLabel = document.createElement("label");
      consentLabel.className = "assistant-tts-consent";

      const consent = document.createElement("input");
      consent.type = "checkbox";
      consent.checked = false;

      const consentText = document.createElement("span");
      consentText.textContent =
        "I agree to send this AI-generated answer text to Langa " +
        "for speech generation.";

      consentLabel.append(consent, consentText);

      const listen = document.createElement("button");
      listen.type = "button";
      listen.className = "assistant-listen";
      listen.dataset.speechProvider = "langa";
      listen.textContent = "Prepare audio";
      listen.setAttribute("aria-pressed", "false");
      listen.disabled = true;

      let requested = false;

      consent.addEventListener("change", () => {
        if (!requested) {
          listen.disabled = !consent.checked;
        }
      });

      listen.addEventListener("click", () => {
        if (!unlocked || inFlight || uncertainSubmission) return;

        // Cancel a pending request, without automatically retrying it.
        if (activeSpeechButton === listen && activeLangaRequest) {
          stopAnswerSpeech();
          listen.textContent = "Audio request cancelled";
          listen.disabled = true;
          setStatus(
            "Audio request cancelled. Its quota may already be reserved."
          );
          return;
        }

        // Reuse prepared audio without spending additional speech quota.
        if (activeSpeechButton === listen && activeLangaAudio) {
          if (!activeLangaAudio.paused) {
            activeLangaAudio.pause();
            listen.textContent = "Play prepared audio";
            listen.setAttribute("aria-pressed", "false");
          } else {
            void playPreparedLangaAudio(listen);
          }
          return;
        }

        // First click: prepare audio only after explicit consent.
        if (requested || !consent.checked) return;

        requested = true;
        consent.disabled = true;

        void prepareLangaPlayback(
          content, answerLanguage, speechProof, listen
        ).then(() => {
          if (activeSpeechButton !== listen) {
            listen.textContent = "Audio unavailable";
            listen.disabled = true;
          }
        });
      });

      article.append(consentLabel, listen);
    }
    messages.appendChild(article);
    messages.scrollTop = messages.scrollHeight;
  }
  async function request(action, other = {}) {
    const response = await fetch("/api/assistant", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "VoiceBridgeAssistant"
      },
      body: JSON.stringify({ action, ...other }),
      cache: "no-store"
    });
    let data;
    try { data = await response.json(); }
    catch { throw Error("The assistant service returned an unexpected response."); }
    if (!response.ok || data.ok !== true) {
      const reasons = {
        assistant_not_configured: "The financial assistant is not activated yet. Existing N-ATLAS and PayPal demos remain available.",
        assistant_access_denied: "The financial assistant passcode is incorrect.",
        assistant_access_limited: "Too many demonstration access attempts. Please wait about 15 minutes before trying again. No AI credits were used.",
        assistant_access_unavailable: "The assistant's access-security service is unavailable. Requests are blocked for safety. Try again later.",
        assistant_session_expired: "Your 30-minute demo session has expired. Unlock again.",
        assistant_capacity_reached: "The separate AI demo allowance has been reached. Check AI capacity for the remaining limits.",
        assistant_duplicate_request: "This question has already been submitted. No second AI request was initiated.",
        assistant_question_invalid: "The question or conversation was not accepted. Start a new conversation if needed.",
        assistant_response_invalid: "The AI response was not verified. No payment action was taken.",
        assistant_provider_unavailable: "The AI provider is unavailable. Do not resubmit the same question automatically.",
        assistant_unavailable: "The assistant is unavailable. No payment action was taken.",
        invalid_request: "The assistant request was not valid.",
        origin_rejected: "The request did not pass the website security checks."
      };
      const problem = new Error(reasons[data.reason] ||
        "The financial assistant is temporarily unavailable.");
      problem.reason = data.reason;
      problem.status = response.status;
      throw problem;
    }
    return data;
  }
  function serviceError(error) {
    return error && typeof error.message === "string" ?
      error.message : "The service could not be contacted.";
  }
  function sessionExpired(error) {
    if (error?.reason !== "assistant_session_expired") return false;
    stopAnswerSpeech();
    unlocked = false;
    uncertainSubmission = false;
    history = [];
    contextProof = "";
    imported = false;
    reviewed = false;
    if (review) review.checked = false;
    accessStatus.textContent = "Session expired. Enter your passcode to unlock again.";
    controls();
    return true;
  }

  passcode.addEventListener("input", controls);
  question.addEventListener("input", () => {
    // Every edit invalidates previous review confirmation.
    if (imported) {
      reviewed = false;
      if (review) review.checked = false;
      if (sourceStatus) sourceStatus.textContent =
        "You edited the imported question. Inspect the full text and confirm it again before Ask.";
    }
    controls();
  });
  if (language) language.addEventListener("change", () => {
    if (!unlocked || inFlight || uncertainSubmission) return;
    resetConversation();
    if (sourceStatus) sourceStatus.textContent =
      "Language changed. Start a new question. No transcript or AI request was submitted.";
    setStatus("Conversation language selected: " + language.value + ".");
    controls();
  });
  privacy.addEventListener("change", controls);
  if (review) review.addEventListener("change", () => {
    reviewed = Boolean(imported && review.checked);
    if (sourceStatus && imported) sourceStatus.textContent = reviewed ?
      "Imported transcript reviewed in the selected language. AI consent and a separate Ask click are still required." :
      "Review and correct this question, then confirm the exact text.";
    controls();
  });
  document.addEventListener("voicebridge:natlas-transcript-handoff", event => {
    const candidate = event.detail;
    // User-facing convenience transfer only; never authoritative provenance
    // or a source of new AI or payment execution privileges.
    if (!["en-NG", "yo-NG", "ha-NG", "ig-NG"].includes(candidate?.language) ||
        candidate.language !== language.value ||
        typeof candidate.text !== "string" ||
        candidate.text.trim().length < 3 || candidate.text.length > 1000) return;
    if (!unlocked) {
      accessStatus.textContent =
        "Unlock the Financial Intelligence Assistant first, then click Use reviewed transcript as AI question again in the Speech Lab.";
      passcode.focus();
      return;
    }
    if (inFlight || uncertainSubmission) {
      setStatus("Finish or clear the current AI submission before importing a transcript.");
      return;
    }
    // New context: avoid treating unrelated previous dialogue as a voice intent.
    resetConversation();
    if (candidate.text.length > 500) {
      if (sourceStatus) sourceStatus.textContent =
        "This transcript exceeds the 500-character AI question limit. Please type a shorter question in the selected language. No text was sent.";
      return;
    }
    imported = true;
    reviewed = false;
    question.value = candidate.text.trim();
    if (review) review.checked = false;
    if (sourceStatus) sourceStatus.textContent =
      "N-ATLAS transcript copied locally in the selected language. Inspect, edit and confirm the text; separately consent to AI processing, then explicitly click Ask. No AI job has been submitted.";
    setStatus("Speech transcript copied for review. No AI quota consumed.");
    controls();
    question.focus();
    question.scrollIntoView?.({ behavior: "smooth", block: "center" });
  });

  unlock.addEventListener("click", async () => {
    if (inFlight || unlocked || !passcode.value.trim()) return;
    inFlight = true;
    controls();
    accessStatus.textContent = "Checking restricted demonstration access…";
    try {
      const result = await request("start", { passcode: passcode.value });
      if (result.status !== "ready") throw Error("Unexpected assistant session response.");
      unlocked = true;
      passcode.value = "";
      resetConversation();
      accessStatus.textContent =
        "Assistant session unlocked for up to 30 minutes. No AI or speech quota used.";
      question.focus();
    } catch (error) {
      accessStatus.textContent = serviceError(error);
      passcode.value = "";
    } finally {
      inFlight = false;
      controls();
    }
  });

  end.addEventListener("click", async () => {
    if (inFlight || !unlocked) return;
    stopAnswerSpeech();
    inFlight = true;
    controls();
    let revoked = false;
    try {
      const result = await request("end");
      if (result.status !== "ended") throw Error("Logout could not be verified.");
      revoked = true;
      accessStatus.textContent =
        "Session ended and revoked on the server. A copied session cookie can no longer be used.";
    } catch {
      // Do not claim success or prevent the user from retrying logout.
      accessStatus.textContent =
        "Server-side logout could not be verified. Conversation text is cleared locally. Click End demo session again; a previous session may remain valid until expiry.";
    } finally {
      privacy.checked = false;
      history = [];
      contextProof = "";
      uncertainSubmission = !revoked;
      imported = false;
      reviewed = false;
      if (review) review.checked = false;
      if (sourceStatus) sourceStatus.textContent = revoked ?
        "Assistant session ended. Imported speech text is cleared." :
        "Conversation text cleared. Server-side logout must be retried.";
      question.value = "";
      passcode.value = "";
      messages.replaceChildren();
      if (revoked) unlocked = false;
      inFlight = false;
      controls();
    }
  });

  newConversation.addEventListener("click", () => {
    if (inFlight || !unlocked) return;
    resetConversation();
    question.focus();
  });

  capacity.addEventListener("click", async () => {
    if (inFlight || !unlocked) return;
    inFlight = true;
    controls();
    capacityStatus.textContent = "Checking shared AI capacity; no model request is sent.";
    try {
      const result = await request("capacity");
      if (!Number.isSafeInteger(result.remaining) ||
          !Number.isSafeInteger(result.daily_limit) ||
          !Number.isSafeInteger(result.daily_used) ||
          !Number.isSafeInteger(result.lifetime_remaining)) {
        throw Error("The capacity response was not valid.");
      }
      capacityStatus.textContent =
        "Shared AI capacity: " + result.remaining + " available. Daily remaining: " +
        Math.max(0, result.daily_limit - result.daily_used) +
        ". Overall remaining: " + result.lifetime_remaining +
        ". Daily reset: " + result.reset_at_utc +
        " (UTC). This does not affect the N-ATLAS quota.";
    } catch (error) {
      sessionExpired(error);
      capacityStatus.textContent = serviceError(error);
    } finally {
      inFlight = false;
      controls();
    }
  });

  for (const example of suggestions) {
    example.addEventListener("click", () => {
      if (!unlocked || inFlight || uncertainSubmission) return;
      question.value = example.dataset.question || "";
      imported = false;
      reviewed = false;
      if (review) review.checked = false;
      if (sourceStatus) sourceStatus.textContent =
        "Typed example selected. AI consent and a separate Ask click are required.";
      controls();
      question.focus();
      // Examples only populate input. They never submit a chargeable AI request.
    });
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();
    const text = question.value.trim();
    if (!unlocked || inFlight || uncertainSubmission || !privacy.checked ||
        (imported && !reviewed) ||
        text.length < 3 || text.length > 500 ||
        !globalThis.crypto || typeof globalThis.crypto.randomUUID !== "function") return;
    const requestId = globalThis.crypto.randomUUID();
    stopAnswerSpeech();
    inFlight = true;
    controls();
    setStatus("Sending this educational question to the AI provider. Do not submit again.");
    try {
      const result = await request("ask", {
        question: text, request_id: requestId,
        history, context_proof: contextProof, confirm_privacy: true, language: language.value,
        source_type: imported ? "reviewed_transcript" : "typed"
      });
      if (!result || !Array.isArray(result.history) ||
          typeof result.context_proof !== "string" || !result.context_proof ||
          result.payment_action_allowed !== false ||
          result.language !== language.value || typeof result.answer !== "string") {
        throw Error("The assistant response could not be verified.");
      }
      history = result.history;
      contextProof = result.context_proof;
      show("user", text);
      show("assistant", result.answer,
        "AI-generated financial education — not a verified transaction record.", result.language, result.speech_proof);
      question.value = "";
      imported = false;
      reviewed = false;
      if (review) review.checked = false;
      if (sourceStatus) sourceStatus.textContent =
        "Previous question answered. Type a follow-up or import another completed N-ATLAS transcript in the selected language.";
      setStatus(
        "Educational answer received. You may ask a follow-up question, or check the independent AI capacity."
      );
    } catch (error) {
      sessionExpired(error);
      // A timeout may occur AFTER the provider received the request.
      // Do not auto-retry or invite re-clicking the same chargeable call.
      uncertainSubmission = unlocked;
      setStatus(serviceError(error) +
        " The request might have counted against your AI allowance. " +
        "Use Check AI capacity; choose New conversation before any new request.");
    } finally {
      inFlight = false;
      controls();
    }
  });

  // Stop speech when leaving the page, without modifying server-side session.
  if (typeof globalThis.addEventListener === "function") {
    globalThis.addEventListener("pagehide", stopAnswerSpeech);
  }

  // Never persist transcripts, questions, answers, session tokens, or passcodes
  // into browser storage, URL parameters, payment endpoints, or analytics.
  controls();
})();
