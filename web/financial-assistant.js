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

  function setStatus(message) { status.textContent = message; }
  function controls() {
    unlock.disabled = inFlight || unlocked || passcode.value.trim().length < 1;
    end.disabled = inFlight || !unlocked;
    newConversation.disabled = inFlight || !unlocked;
    capacity.disabled = inFlight || !unlocked;
    question.disabled = inFlight || !unlocked || uncertainSubmission;
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
  function show(role, content, context) {
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
        assistant_session_expired: "Your 15-minute demo session has expired. Unlock again.",
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
  privacy.addEventListener("change", controls);
  if (review) review.addEventListener("change", () => {
    reviewed = Boolean(imported && review.checked);
    if (sourceStatus && imported) sourceStatus.textContent = reviewed ?
      "Imported Nigerian English text reviewed. AI consent and a separate Ask click are still required." :
      "Review and correct this question, then confirm the exact text.";
    controls();
  });
  document.addEventListener("voicebridge:natlas-transcript-handoff", event => {
    const candidate = event.detail;
    // User-facing convenience transfer only; never authoritative provenance
    // or a source of new AI or payment execution privileges.
    if (candidate?.language !== "en-NG" ||
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
        "This transcript exceeds the 500-character AI question limit. Please type a shorter English question. No text was sent.";
      return;
    }
    imported = true;
    reviewed = false;
    question.value = candidate.text.trim();
    if (review) review.checked = false;
    if (sourceStatus) sourceStatus.textContent =
      "N-ATLAS Nigerian English transcript copied locally. Inspect, edit and confirm the text; separately consent to AI processing, then explicitly click Ask. No AI job has been submitted.";
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
        "Assistant session unlocked for up to 15 minutes. No AI or speech quota used.";
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
    inFlight = true;
    controls();
    try {
      await request("end");
      accessStatus.textContent = "Demonstration session ended.";
    } catch {
      accessStatus.textContent =
        "Local conversation closed; the server session may remain valid until expiry.";
    } finally {
      unlocked = false;
      privacy.checked = false;
      history = [];
      contextProof = "";
      uncertainSubmission = false;
      imported = false;
      reviewed = false;
      if (review) review.checked = false;
      if (sourceStatus) sourceStatus.textContent = "Session ended. Imported question cleared.";
      question.value = "";
      passcode.value = "";
      messages.replaceChildren();
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
    inFlight = true;
    controls();
    setStatus("Sending this educational question to the AI provider. Do not submit again.");
    try {
      const result = await request("ask", {
        question: text, request_id: requestId,
        history, context_proof: contextProof, confirm_privacy: true,
        source_type: imported ? "reviewed_transcript" : "typed"
      });
      if (!result || !Array.isArray(result.history) ||
          typeof result.context_proof !== "string" || !result.context_proof ||
          result.payment_action_allowed !== false ||
          result.language !== "en-NG" || typeof result.answer !== "string") {
        throw Error("The assistant response could not be verified.");
      }
      history = result.history;
      contextProof = result.context_proof;
      show("user", text);
      show("assistant", result.answer,
        "AI-generated financial education — not a verified transaction record.");
      question.value = "";
      imported = false;
      reviewed = false;
      if (review) review.checked = false;
      if (sourceStatus) sourceStatus.textContent =
        "Previous question answered. Type a follow-up or import another completed Nigerian English transcript.";
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

  // Never persist transcripts, questions, answers, session tokens, or passcodes
  // into browser storage, URL parameters, payment endpoints, or analytics.
  controls();
})();
