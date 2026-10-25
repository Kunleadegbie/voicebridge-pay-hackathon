// Offline integration coverage for the two REAL frontend scripts.
// No production credentials, RunPod, OpenAI, PayPal, browser network, or deployment.
// Install in web/tests/; reads unmodified ../natlas-voice.js and ../financial-assistant.js.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';

const voiceCode = readFileSync(new URL('../natlas-voice.js', import.meta.url), 'utf8');
const assistantCode = readFileSync(new URL('../financial-assistant.js', import.meta.url), 'utf8');

class Element {
  constructor() {
    this.listeners = {};
    this.value = '';
    this.checked = false;
    this.disabled = false;
    this.dataset = {};
    this.className = '';
    this.textContent = '';
    this.children = [];
    this.parent = null;
    this.attributes = {};
    this.scrollTop = this.scrollHeight = 0;
  }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  async emit(type) {
    // Simulate disabled controls being non-clickable by real users.
    if (type === 'click' && this.disabled) return;
    for (const fn of this.listeners[type] || []) {
      await fn({ preventDefault() {} });
    }
  }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  appendChild(child) { this.children.push(child); child.parent = this; }
  append(...children) { for (const child of children) this.appendChild(child); }
  replaceChildren(...children) { this.children = []; this.append(...children); }
  querySelector(selector) {
    if (selector !== '.assistant-empty') return null;
    return this.children.find(x => x.className === 'assistant-empty') || null;
  }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(x => x !== this); }
  focus() { this.focused = true; }
  scrollIntoView() { this.scrolled = true; }
}

function success(data) {
  return { ok: true, status: 200, json: async () => ({ ok: true, ...data }) };
}

function environment({ transcription, answer = 'A digital payment transfers value electronically.' } = {}) {
  const ids = [
    'natlas-record','natlas-stop','natlas-submit','natlas-check',
    'natlas-capacity','natlas-capacity-status','natlas-result',
    'natlas-send-to-assistant','natlas-handoff-status','natlas-status',
    'natlas-language','natlas-passcode','natlas-privacy',
    'assistant-passcode','assistant-start','assistant-end','assistant-new',
    'assistant-capacity','assistant-capacity-status','assistant-access-status',
    'assistant-status','assistant-messages','assistant-question',
    'assistant-review','assistant-source-status','assistant-privacy',
    'assistant-form','assistant-ask'
  ];
  const els = Object.fromEntries(ids.map(id => [id, new Element()]));
  els['natlas-language'].value = 'en-NG';
  const examples = [new Element()];
  examples[0].dataset.question = 'What is a digital payment?';
  const listeners = {};
  const document = {
    getElementById(id) { return els[id] || null; },
    querySelectorAll(selector) { return selector === '.assistant-example' ? examples : []; },
    createElement() { return new Element(); },
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    dispatchEvent(event) {
      for (const fn of listeners[event.type] || []) fn(event);
      return true;
    }
  };
  class CustomEvent {
    constructor(type, options = {}) { this.type = type; this.detail = options.detail; }
  }
  class FakeAudioContext {} // Satisfies feature detection; microphone isn't opened.
  class FakeUtterance {
    constructor(text) { this.text = text; }
  }
  const spoken = [];
  let cancelled = 0;
  const synthesis = {
    speak(utterance) { spoken.push(utterance); },
    cancel() { cancelled++; },
    getVoices() { return [{ lang: 'en-NG', name: 'Test English Voice' }]; }
  };
  const calls = [];
  const completed = transcription || {
    status: 'completed', provider: 'natlas', language: 'en-NG',
    model_id: 'NCAIR1/NigerianAccentedEnglish',
    transcript: 'What is a digital payment?'
  };
  const fetchMock = async (path, options) => {
    assert.ok(['/api/voice', '/api/assistant'].includes(path),
      `Unexpected external or payment endpoint: ${path}`);
    assert.equal(options.method, 'POST');
    const body = JSON.parse(options.body);
    calls.push({ path, body });
    if (path === '/api/voice') {
      assert.equal(body.action, 'status');
      return success(completed);
    }
    if (body.action === 'start') return success({ status: 'ready' });
    if (body.action === 'ask') return success({
      status: 'answered', answer, language: 'en-NG',
      payment_action_allowed: false,
      history: [
        { role: 'user', content: body.question },
        { role: 'assistant', content: answer }
      ],
      context_proof: 'signed-context-test-fixture'
    });
    throw new Error('No other assistant operation is authorised in this test');
  };
  const globalThis = {
    crypto: { randomUUID: () => '12345678-1234-4123-8123-123456789abc' },
    speechSynthesis: synthesis,
    SpeechSynthesisUtterance: FakeUtterance,
    addEventListener() {}
  };
  const sandbox = {
    document, CustomEvent,
    navigator: { mediaDevices: { getUserMedia() { throw Error('Microphone not permitted in simulation'); } } },
    window: { AudioContext: FakeAudioContext },
    fetch: fetchMock, globalThis,
    setTimeout() { throw Error('Unexpected timer: no remote polling permitted in this test'); },
    clearTimeout() {},
    btoa() { throw Error('No audio encoding permitted in offline test'); }
  };
  // Load the same files the real webpage loads, sharing one document/event bus.
  runInNewContext(voiceCode, sandbox, { timeout: 1000 });
  runInNewContext(assistantCode, sandbox, { timeout: 1000 });
  return {
    els, calls, spoken, synthesis,
    get cancellations() { return cancelled; },
    async unlock() {
      els['assistant-passcode'].value = 'local-fake-passcode';
      await els['assistant-passcode'].emit('input');
      await els['assistant-start'].emit('click');
    },
    async completeJob() {
      // Seed only the existence of a previously submitted voice job;
      // actual microphone and /api/voice submit are NOT simulated here.
      els['natlas-check'].dataset.pending = '1';
      els['natlas-check'].disabled = false;
      await els['natlas-check'].emit('click');
      // The real click listener intentionally starts its async status check
      // with `void checkStatus()`, so allow the promise chain to settle.
      await new Promise(resolve => setImmediate(resolve));
    },
    async transfer() { await els['natlas-send-to-assistant'].emit('click'); },
    async approveAndAsk() {
      els['assistant-privacy'].checked = true;
      await els['assistant-privacy'].emit('change');
      els['assistant-review'].checked = true;
      await els['assistant-review'].emit('change');
      await els['assistant-form'].emit('submit');
    },
    operations() { return calls.map(x => `${x.path}:${x.body.action}`); }
  };
}

test('verified N-ATLAS status -> explicit transfer -> review/consent -> one AI Ask -> audible answer', async () => {
  const s = environment();
  await s.unlock();
  await s.completeJob();
  const { els } = s;
  assert.equal(els['natlas-result'].textContent, 'What is a digital payment?');
  assert.equal(els['natlas-send-to-assistant'].disabled, false);
  assert.deepEqual(s.operations(), ['/api/assistant:start', '/api/voice:status']);
  await s.transfer();
  assert.equal(els['assistant-question'].value, 'What is a digital payment?');
  assert.equal(els['assistant-ask'].disabled, true);
  assert.deepEqual(s.operations(), ['/api/assistant:start', '/api/voice:status']);
  // Imported words aren't a payment instruction and don't spend an AI query.
  els['assistant-privacy'].checked = true;
  await els['assistant-privacy'].emit('change');
  assert.equal(els['assistant-ask'].disabled, true);
  els['assistant-review'].checked = true;
  await els['assistant-review'].emit('change');
  assert.equal(els['assistant-ask'].disabled, false);
  await els['assistant-form'].emit('submit');
  assert.deepEqual(s.operations(), [
    '/api/assistant:start', '/api/voice:status', '/api/assistant:ask'
  ]);
  const askBody = s.calls.at(-1).body;
  assert.equal(askBody.source_type, 'reviewed_transcript');
  assert.equal(askBody.confirm_privacy, true);
  assert.equal(askBody.question, 'What is a digital payment?');
  const reply = els['assistant-messages'].children[1];
  assert.equal(reply.dataset.role, 'assistant');
  const listen = reply.children.find(x => x.className === 'assistant-listen');
  assert.ok(listen);
  assert.equal(s.spoken.length, 0, 'Answer must not autoplay');
  await listen.emit('click');
  assert.equal(s.spoken.length, 1);
  assert.equal(s.spoken[0].lang, 'en-NG');
  assert.equal(s.spoken[0].text, 'A digital payment transfers value electronically.');
  assert.equal(listen.textContent, 'Stop speaking');
  assert.equal(s.calls.length, 3, 'Speech cannot spend another model, voice or payment request');
  await listen.emit('click');
  assert.equal(listen.textContent, 'Listen to answer');
});

test('completed but wrong model/provider/language never becomes transferable', async () => {
  const badCases = [
    { provider: 'other' },
    { model_id: 'unexpected-model' },
    { language: 'ha-NG' },
    { transcript: 'a' }
  ];
  for (const variant of badCases) {
    const s = environment({ transcription: {
      status: 'completed', provider: 'natlas', language: 'en-NG',
      model_id: 'NCAIR1/NigerianAccentedEnglish',
      transcript: 'What is a digital payment?', ...variant
    } });
    await s.unlock();
    await s.completeJob();
    assert.equal(s.els['natlas-send-to-assistant'].disabled, true);
    await s.transfer();
    assert.equal(s.els['assistant-question'].value, '');
    assert.deepEqual(s.operations(), ['/api/assistant:start', '/api/voice:status']);
  }
});

test('no unlocked assistant: handoff is not imported or automatically submitted', async () => {
  const s = environment();
  await s.completeJob();
  await s.transfer();
  assert.equal(s.els['assistant-question'].value, '');
  assert.match(s.els['assistant-access-status'].textContent, /Unlock/);
  assert.deepEqual(s.operations(), ['/api/voice:status']);
  await s.unlock();
  assert.equal(s.els['assistant-question'].value, '');
  // Even after login a SECOND deliberate transfer is mandatory.
  await s.transfer();
  assert.equal(s.els['assistant-question'].value, 'What is a digital payment?');
  assert.deepEqual(s.operations(), ['/api/voice:status', '/api/assistant:start']);
});

test('changing language invalidates previously eligible English handoff', async () => {
  const s = environment();
  await s.unlock();
  await s.completeJob();
  assert.equal(s.els['natlas-send-to-assistant'].disabled, false);
  s.els['natlas-language'].value = 'yo-NG';
  await s.els['natlas-language'].emit('change');
  assert.equal(s.els['natlas-send-to-assistant'].disabled, true);
  await s.transfer();
  assert.equal(s.els['assistant-question'].value, '');
  assert.equal(s.calls.filter(c => c.body.action === 'ask').length, 0);
});

test('editing a transferred transcript revokes review and stops accidental Ask', async () => {
  const s = environment();
  await s.unlock();
  await s.completeJob();
  await s.transfer();
  s.els['assistant-privacy'].checked = true;
  await s.els['assistant-privacy'].emit('change');
  s.els['assistant-review'].checked = true;
  await s.els['assistant-review'].emit('change');
  assert.equal(s.els['assistant-ask'].disabled, false);
  s.els['assistant-question'].value = 'What does a digital payment receipt show?';
  await s.els['assistant-question'].emit('input');
  assert.equal(s.els['assistant-review'].checked, false);
  assert.equal(s.els['assistant-ask'].disabled, true);
  await s.els['assistant-form'].emit('submit');
  assert.equal(s.calls.filter(c => c.body.action === 'ask').length, 0);
});

test('an invalid or failed job cannot be used to trigger AI or speech', async () => {
  const s = environment({ transcription: { status: 'failed' } });
  await s.unlock();
  await s.completeJob();
  assert.equal(s.els['natlas-send-to-assistant'].disabled, true);
  await s.transfer();
  assert.equal(s.els['assistant-question'].value, '');
  assert.equal(s.spoken.length, 0);
  assert.deepEqual(s.operations(), ['/api/assistant:start', '/api/voice:status']);
});
