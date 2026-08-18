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
--------------------------------------------------------- */

let aliceHistory = [];
let aliceAwaitingNickname = false;

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
      <div>
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
    renderAliceBubble(messagesEl, 'assistant', `¡Hola de nuevo, ${nickname}! ¿En qué investigación te ayudo hoy?`);
    aliceAwaitingNickname = false;
  }
  messagesEl.scrollTop = messagesEl.scrollHeight;

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
      renderAliceBubble(messagesEl, 'assistant', `Genial, ${nick}. ¿En qué investigación te ayudo hoy?`);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      return;
    }

    aliceHistory.push({ role: 'user', content: text });
    const bubble = renderAliceBubble(messagesEl, 'assistant', '');
    const textEl = bubble.querySelector('.msg-text');
    btn.disabled = true;

    try {
      const nick = localStorage.getItem('abyssal_user_nickname') || 'investigador';
      const res = await fetch('/api/alice/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: nick, message: text }),
      });
      if (!res.ok || !res.body) {
        let detail = `El backend respondió con estado ${res.status}.`;
        try { detail = (await res.json()).detail || detail; } catch (e) { /* not JSON, keep default */ }
        throw new Error(detail);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '', full = '';
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
        }
      }
      if (!full) throw new Error('Alice no devolvió texto. Probá de nuevo en un momento.');
      aliceHistory.push({ role: 'assistant', content: full });
      saveAliceHistory();
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
