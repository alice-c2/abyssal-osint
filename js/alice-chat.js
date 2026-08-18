/* ---------------------------------------------------------
   Alice AI — a chat UI backed by our OWN rule engine
   (backend/alice_brain.py), not an external API. No key, no
   quota, nothing to configure. The backend streams the reply
   word by word over the same SSE shape a real model would use,
   so it still animates in as it "types".

   Behavior implemented here, not just visual:
   - First-ever conversation: Alice asks what to call the user,
     then remembers that nickname forever (localStorage) and
     sends it with every message so replies stay personalized.
   - Safety guidance: alice_brain.py always gives calm, passive
     advice (report to the police / the right authority) if —
     and only if — the user brings up investigating someone
     dangerous. Never proactive, never vigilante-style.
   - Tool/results answers come back as an ordered list, not a
     wall of text.
   - "Thinking" bubble while waiting for the first token.
   - Case flow: when the backend flags a turn as an actual
     investigation (see the `investigation` SSE event in
     backend/main.py), Alice offers to open a case for it. If
     the user says yes and names it, she creates the case and
     folds the finding in via dashboard.js's
     createCaseFromAlice()/addAliceFindingToCase() — the exact
     same hub+satellite graph the manual "graph search" bar in
     Cases produces, just triggered conversationally. Once a
     case is open, later findings in the same session get added
     to it automatically, without asking again. This is scoped
     to Alice only — the tool modules and the manual graph
     search are untouched.
--------------------------------------------------------- */

let aliceHistory = [];
let aliceAwaitingNickname = false;
let aliceAwaitingCaseConfirm = false;
let aliceAwaitingCaseName = false;
let aliceAwaitingSafetyFollowup = false;
let alicePendingQuery = null;
let aliceActiveCaseId = null;
let aliceActiveCaseName = null;

function loadAliceHistory() {
  try { return JSON.parse(sessionStorage.getItem('abyssal_alice_history') || '[]'); }
  catch (e) { return []; }
}

function saveAliceHistory() {
  sessionStorage.setItem('abyssal_alice_history', JSON.stringify(aliceHistory));
}

function renderAliceChat() {
  return `
  <div class="max-w-3xl mx-auto px-8 py-8 h-full flex flex-col">
    <div class="flex items-center gap-3 mb-5">
      <div class="w-10 h-10 rounded-lg bg-primary-500/15 flex items-center justify-center text-primary-300">${icon('sparkle')}</div>
      <div class="flex-1">
        <h1 class="font-semibold text-lg leading-tight">Alice AI</h1>
        <p class="text-sm text-gray-500">Your purpose-built OSINT assistant</p>
      </div>
    </div>

    <div id="aliceMessages" class="flex-1 rounded-2xl border border-white/10 bg-black/40 p-5 overflow-y-auto dash-scroll flex flex-col gap-3"></div>

    <div class="mt-4 flex items-center gap-2 rounded-xl border border-white/10 px-4 py-3">
      <input id="aliceInput" type="text" autocomplete="off" readonly onfocus="this.removeAttribute('readonly')" placeholder="Message Alice..." class="flex-1 bg-transparent outline-none text-sm placeholder-gray-500">
      <button id="aliceSendBtn" class="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center shrink-0 disabled:opacity-50 transition-colors">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
      </button>
    </div>
  </div>`;
}

function formatAliceMarkdown(text) {
  let html = escapeHtml(text);
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\n/g, '<br>');
  return html;
}

function renderAliceBubble(container, role, text) {
  const div = document.createElement('div');
  if (role === 'user') {
    div.className = 'self-end max-w-[80%] bg-primary-600 text-white text-sm rounded-2xl rounded-br-sm px-4 py-2.5';
  } else if (role === 'error') {
    div.className = 'self-start max-w-[85%] bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded-2xl rounded-bl-sm px-4 py-2.5';
  } else {
    div.className = 'self-start max-w-[85%] bg-white/[0.04] border border-white/10 text-gray-200 text-sm rounded-2xl rounded-bl-sm px-4 py-2.5';
  }
  const span = document.createElement('span');
  span.className = 'msg-text';
  span.innerHTML = formatAliceMarkdown(text);
  div.appendChild(span);
  container.appendChild(div);
  return div;
}

function mountAliceChat() {
  const messagesEl = document.getElementById('aliceMessages');
  const input = document.getElementById('aliceInput');
  const btn = document.getElementById('aliceSendBtn');
  aliceHistory = loadAliceHistory();
  messagesEl.innerHTML = '';

  const nickname = localStorage.getItem('abyssal_user_nickname');

  if (aliceHistory.length) {
    aliceHistory.forEach(m => renderAliceBubble(messagesEl, m.role, m.content));
    aliceAwaitingNickname = false;
  } else if (!nickname) {
    renderAliceBubble(messagesEl, 'assistant', '¡Hola! Soy Alice, tu asistente de investigación OSINT. ¿Cómo querés que te llame?');
    aliceAwaitingNickname = true;
  } else {
    renderAliceBubble(messagesEl, 'assistant', `¡Hola de nuevo, ${nickname}! ¿Qué necesitás?`);
    aliceAwaitingNickname = false;
  }
  messagesEl.scrollTop = messagesEl.scrollHeight;

  function say(text) {
    const b = renderAliceBubble(messagesEl, 'assistant', text);
    aliceHistory.push({ role: 'assistant', content: text });
    saveAliceHistory();
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return b;
  }

  async function send() {
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    renderAliceBubble(messagesEl, 'user', text);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    if (aliceAwaitingNickname) {
      const nick = text.slice(0, 40);
      localStorage.setItem('abyssal_user_nickname', nick);
      aliceAwaitingNickname = false;
      say(`Un gusto, ${nick}. Contame qué necesitás.`);
      return;
    }

    // ---- Case flow (Alice only — the tool modules and the manual graph
    // search bar in Cases are untouched by any of this) ----
    if (aliceAwaitingSafetyFollowup) {
      aliceAwaitingSafetyFollowup = false;
      if (/^\s*s(i|í)\b/i.test(text)) {
        if (aliceActiveCaseId) {
          say(`Dale — ya tenés el caso **${aliceActiveCaseName}** abierto. Seguí mandándome lo que vayas averiguando (alias, emails, dominios...) y lo voy sumando ahí.`);
        } else {
          aliceAwaitingCaseName = true;
          say('¿Cómo querés llamar al caso?');
        }
        return;
      }
      // Anything else isn't clearly a "sí" — don't force a canned reply
      // onto what might be a real new message, just fall through below.
    }

    if (aliceAwaitingCaseConfirm) {
      aliceAwaitingCaseConfirm = false;
      if (/^\s*s(i|í)\b/i.test(text)) {
        aliceAwaitingCaseName = true;
        say('¿Cómo querés llamar al caso?');
      } else {
        alicePendingQuery = null;
        say('Dale, sigo sin abrir un caso. Avisame si cambiás de idea.');
      }
      return;
    }

    if (aliceAwaitingCaseName) {
      aliceAwaitingCaseName = false;
      const caseName = text.slice(0, 60);
      const query = alicePendingQuery;
      alicePendingQuery = null;
      aliceActiveCaseId = createCaseFromAlice(caseName);
      aliceActiveCaseName = caseName;

      if (!query) {
        say(`Listo — caso **${caseName}** creado. Contame lo que vayas averiguando (alias, emails, dominios...) y lo voy organizando ahí.`);
        return;
      }

      const bubble = say(`Armando el caso "${caseName}"...`);
      const textEl = bubble.querySelector('.msg-text');
      try {
        const found = await addAliceFindingToCase(aliceActiveCaseId, query);
        const msg = found
          ? `Listo — caso **${caseName}** creado, con ${found} hallazgo${found === 1 ? '' : 's'} sobre "${query}". Podés verlo en Cases → ${caseName} → Graph. Seguí preguntando y voy sumando más al mismo caso.`
          : `Creé el caso **${caseName}**, pero no encontré nada consultable sobre "${query}" en los módulos en vivo. Igual queda abierto — lo que investiguemos de acá en más se va a ir agregando solo.`;
        textEl.innerHTML = formatAliceMarkdown(msg);
        aliceHistory[aliceHistory.length - 1].content = msg;
        saveAliceHistory();
      } catch (err) {
        textEl.innerHTML = formatAliceMarkdown(`Creé el caso pero tuve un problema buscando "${query}": ${err.message || err}.`);
      }
      messagesEl.scrollTop = messagesEl.scrollHeight;
      return;
    }

    aliceHistory.push({ role: 'user', content: text });
    const bubble = renderAliceBubble(messagesEl, 'assistant', '');
    const textEl = bubble.querySelector('.msg-text');
    textEl.innerHTML = '<span class="alice-thinking"><span></span><span></span><span></span></span>';
    btn.disabled = true;

    try {
      const nick = localStorage.getItem('abyssal_user_nickname') || 'investigador';
      // Prior turns only (aliceHistory already has this turn's user message
      // pushed above) — lets Alice recall a topic opened a message or two
      // ago instead of treating every message as a blank slate.
      const priorHistory = aliceHistory.slice(0, -1).slice(-10);
      const res = await fetch('/api/alice/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Access-Key': getAccessKey() },
        body: JSON.stringify({ nickname: nick, message: text, history: priorHistory }),
      });
      if (res.status === 401) {
        localStorage.removeItem(ACCESS_KEY_STORAGE);
        promptForAccessKey();
      }
      if (!res.ok || !res.body) {
        let detail = `El backend respondió con estado ${res.status}.`;
        try { detail = (await res.json()).detail || detail; } catch (e) { /* not JSON, keep default */ }
        throw new Error(detail);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '', full = '', investigation = null, safetyFollowup = false;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split('\n\n');
        buf = parts.pop();
        for (const part of parts) {
          const dataLine = part.split('\n').find(l => l.startsWith('data:'));
          if (!dataLine) continue;
          let evt;
          try { evt = JSON.parse(dataLine.slice(5).trim()); } catch (e) { continue; }
          if (evt.type === 'error') throw new Error(evt.error?.message || 'Alice tuvo un problema para responder.');
          if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
            full += evt.delta.text;
            textEl.innerHTML = formatAliceMarkdown(full);
            messagesEl.scrollTop = messagesEl.scrollHeight;
          }
          if (evt.type === 'investigation') investigation = evt;
          if (evt.type === 'safety_followup') safetyFollowup = true;
        }
      }
      if (!full) throw new Error('Alice no devolvió texto. Probá de nuevo en un momento.');
      aliceHistory.push({ role: 'assistant', content: full });
      saveAliceHistory();
      aliceAwaitingSafetyFollowup = safetyFollowup;

      // A real indicator was investigated this turn — offer/grow a case.
      if (investigation && investigation.query) {
        if (aliceActiveCaseId) {
          addAliceFindingToCase(aliceActiveCaseId, investigation.query).then(found => {
            if (found) say(`🔗 Sumado al caso **${aliceActiveCaseName}**: ${found} hallazgo${found === 1 ? '' : 's'} sobre "${investigation.query}".`);
          }).catch(() => { /* silent — don't interrupt the chat over a background add */ });
        } else {
          alicePendingQuery = investigation.query;
          aliceAwaitingCaseConfirm = true;
          aliceAwaitingSafetyFollowup = false; // the case question below supersedes it — avoid two pending questions at once
          say('¿Querés que arme un caso con esto?');
        }
      }
    } catch (err) {
      textEl.innerHTML = formatAliceMarkdown(err.message || String(err));
      bubble.classList.add('text-red-300');
      aliceHistory.pop(); // don't keep a broken turn in context
    } finally {
      btn.disabled = false;
    }
  }

  btn.addEventListener('click', send);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
}
