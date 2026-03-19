/** @jsxImportSource hono/jsx */
import { raw } from 'hono/html';
import { homedir } from 'node:os';
import type { AskMessage } from '../agent/messages.js';

type BuildHtmlOptions = {
  messages: AskMessage[];
  model: string;
  provider: string;
  variant: string | null;
};

function shortDir(): string {
  const cwd = process.cwd();
  const home = homedir();
  return cwd.startsWith(home) ? '~' + cwd.slice(home.length) : cwd;
}

export function buildHtml(options: BuildHtmlOptions) {
  const initialState = JSON.stringify({ messages: options.messages });

  const headerParts = ['Ask', options.provider, options.model];
  if (options.variant !== null) headerParts.push(options.variant);
  headerParts.push(shortDir());
  const headerText = headerParts.join(' \u00b7 ');

  return (
    <>
      {raw('<!DOCTYPE html>')}
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta
            name="viewport"
            content="width=device-width, initial-scale=1.0"
          />
          <title>Ask</title>
          <meta name="theme-color" content="#111" />
          <link rel="manifest" href="/manifest.json" />
          <link rel="icon" type="image/svg+xml" href="/icon.svg" />
          <script src="https://cdn.tailwindcss.com"></script>
          <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
          <style>{raw(CSS_STYLES)}</style>
        </head>
        <body
          class="bg-[#111] text-[#e0e0e0] h-screen flex flex-col overflow-hidden"
          style="font-family: system-ui, -apple-system, sans-serif"
        >
          <header class="shrink-0 px-6 py-3 border-b border-[#282828] text-sm text-[#666]">
            {headerText}
          </header>

          <main id="messages" class="flex-1 overflow-y-auto px-6 py-4"></main>

          <footer class="shrink-0 border-t border-[#282828] px-6 py-3">
            <form id="input-form" class="flex gap-3 items-end">
              <textarea
                id="input"
                rows={1}
                class="flex-1 bg-[#1a1a1a] text-[#e0e0e0] border border-[#333] rounded-lg px-4 py-2.5 outline-none resize-none leading-6"
                style="font-family: system-ui, -apple-system, sans-serif"
                placeholder="Send a message..."
              ></textarea>
              <button
                id="send-btn"
                type="submit"
                class="px-4 py-2.5 bg-[#333] text-[#e0e0e0] rounded-lg hover:bg-[#444] transition-colors text-sm"
              >
                Send
              </button>
              <button
                id="abort-btn"
                type="button"
                class="px-4 py-2.5 bg-[#a33] text-white rounded-lg hover:bg-[#c44] transition-colors text-sm"
                style="display:none"
              >
                Stop
              </button>
            </form>
          </footer>

          <script>{raw(`window.__INITIAL_STATE__ = ${initialState};`)}</script>
          <script>{raw(CLIENT_SCRIPT)}</script>
        </body>
      </html>
    </>
  );
}

const CSS_STYLES = `
    body { margin: 0; }

    ::-webkit-scrollbar { width: 8px; }
    ::-webkit-scrollbar-track { background: #111; }
    ::-webkit-scrollbar-thumb { background: #333; border-radius: 4px; }
    ::-webkit-scrollbar-thumb:hover { background: #444; }

    details summary { cursor: pointer; user-select: none; list-style: none; }
    details summary::-webkit-details-marker { display: none; }
    details summary::before {
      content: '\\25B8';
      display: inline-block;
      margin-right: 0.5rem;
      font-size: 0.7em;
      transition: transform 0.15s;
      color: #555;
    }
    details[open] summary::before { transform: rotate(90deg); }

    .msg { margin-bottom: 0.25rem; border-radius: 6px; }
    .msg summary { padding: 0.4rem 0.75rem; font-size: 0.85rem; color: #666; }
    .msg-body { padding: 0 0.75rem 0.5rem 1.75rem; }

    .user-msg, .assistant-msg { display: flex; gap: 0.75rem; padding: 0.5rem 0.75rem; }
    .msg-icon { flex-shrink: 0; width: 1rem; height: 1rem; margin-top: 0.35rem; }
    .msg-icon-user { color: #666; }
    .msg-icon-assistant { color: #68a; }

    .tool-msg { background: #161616; }
    .tool-msg summary { font-family: ui-monospace, 'Cascadia Code', monospace; font-size: 0.8rem; color: #6a8; }
    .tool-msg .msg-body { font-family: ui-monospace, 'Cascadia Code', monospace; font-size: 0.8rem; line-height: 1.5; }

    .tool-input { color: #bbb; white-space: pre-wrap; word-break: break-all; }
    .tool-stdout { color: #888; white-space: pre-wrap; word-break: break-all; margin: 0.25rem 0; }
    .tool-stderr { color: #e55; white-space: pre-wrap; word-break: break-all; margin: 0.25rem 0; }
    .tool-error { color: #e55; }
    .tool-exit { color: #666; font-size: 0.75rem; margin-top: 0.25rem; }
    .tool-signal { color: #e55; font-size: 0.75rem; }
    .tool-pending { color: #555; font-style: italic; }
    pre.tool-stdout, pre.tool-stderr { margin: 0.25rem 0; padding: 0; background: none; }

    .markdown-body { line-height: 1.7; }
    .markdown-body p { margin: 0.4rem 0; }
    .markdown-body p:first-child { margin-top: 0; }
    .markdown-body p:last-child { margin-bottom: 0; }
    .markdown-body code {
      background: #1a1a1a;
      padding: 0.15em 0.35em;
      border-radius: 4px;
      font-family: ui-monospace, 'Cascadia Code', monospace;
      font-size: 0.9em;
    }
    .markdown-body pre {
      background: #1a1a1a;
      padding: 0.75rem 1rem;
      border-radius: 6px;
      overflow-x: auto;
      margin: 0.75rem 0;
      border: 1px solid #222;
    }
    .markdown-body pre code { background: none; padding: 0; font-size: 0.85em; }
    .markdown-body h1, .markdown-body h2, .markdown-body h3 {
      margin: 1rem 0 0.5rem;
      font-weight: 600;
    }
    .markdown-body h1 { font-size: 1.4em; }
    .markdown-body h2 { font-size: 1.2em; }
    .markdown-body h3 { font-size: 1.05em; }
    .markdown-body ul, .markdown-body ol { padding-left: 1.5rem; margin: 0.5rem 0; }
    .markdown-body li { margin: 0.2rem 0; }
    .markdown-body blockquote {
      border-left: 3px solid #333;
      padding-left: 1rem;
      color: #888;
      margin: 0.5rem 0;
    }
    .markdown-body a { color: #68b; text-decoration: none; }
    .markdown-body a:hover { text-decoration: underline; }
    .markdown-body hr { border: none; border-top: 1px solid #333; margin: 1rem 0; }
    .markdown-body table { border-collapse: collapse; margin: 0.75rem 0; }
    .markdown-body th, .markdown-body td {
      border: 1px solid #333;
      padding: 0.4rem 0.75rem;
      text-align: left;
    }
    .markdown-body th { background: #1a1a1a; font-weight: 600; }

    .spinner-msg { padding: 0.5rem 0.75rem; }
    .spinner {
      display: inline-block;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #888;
      animation: pulse 1.2s ease-in-out infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 0.15; }
      50% { opacity: 1; }
    }

    textarea:focus { border-color: #555 !important; }
    textarea { max-height: 200px; overflow-y: auto; }
`;

const CLIENT_SCRIPT = `(function() {
  'use strict';

  var state = {
    messages: window.__INITIAL_STATE__.messages || [],
    pending: false
  };

  marked.setOptions({ breaks: true, gfm: true });

  function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function getContentParts(content) {
    if (typeof content === 'string') return [{ type: 'text', text: content }];
    if (!Array.isArray(content)) return [];
    var parts = [];
    for (var i = 0; i < content.length; i++) {
      var p = content[i];
      if (!p || typeof p !== 'object') continue;
      if (p.type === 'text' && typeof p.text === 'string') {
        parts.push({ type: 'text', text: p.text });
      } else if (p.type === 'tool-call' && typeof p.toolCallId === 'string') {
        parts.push({
          type: 'tool-call',
          toolCallId: p.toolCallId,
          toolName: typeof p.toolName === 'string' ? p.toolName : null,
          input: p.input !== undefined ? p.input : p.args
        });
      }
    }
    return parts;
  }

  function buildToolResultsMap(messages) {
    var map = new Map();
    for (var i = 0; i < messages.length; i++) {
      var msg = messages[i];
      if (msg.role !== 'tool' || !Array.isArray(msg.content)) continue;
      for (var j = 0; j < msg.content.length; j++) {
        var part = msg.content[j];
        if (part && part.type === 'tool-result' && 'output' in part) {
          map.set(part.toolCallId, {
            toolName: typeof part.toolName === 'string' ? part.toolName : null,
            output: part.output
          });
        }
      }
    }
    return map;
  }

  function getToolSummary(toolName, input) {
    if (toolName === 'execute') {
      var cmd = typeof input === 'string' ? input :
        (input && typeof input === 'object' && typeof input.command === 'string')
          ? input.command : '';
      var firstLine = cmd.split('\\n')[0];
      return '$ ' + (firstLine.length > 80 ? firstLine.slice(0, 77) + '...' : firstLine);
    }
    return toolName || 'tool';
  }

  function parseExecuteOutput(output) {
    if (!output || typeof output !== 'object') return null;
    if (output.type !== 'json' || !output.value || typeof output.value !== 'object') return null;
    var v = output.value;
    return {
      stdout: typeof v.stdout === 'string' && v.stdout.trim() ? v.stdout.trimEnd() : '',
      stderr: typeof v.stderr === 'string' && v.stderr.trim() ? v.stderr.trimEnd() : '',
      error: typeof v.error === 'string' && v.error.trim() ? v.error.trim() : '',
      exit: v.exit !== undefined ? 'exit ' + v.exit : (v.exitCode !== undefined ? 'exit ' + v.exitCode : ''),
      signal: v.signal ? String(v.signal) : ''
    };
  }

  function formatGenericOutput(output) {
    if (!output || typeof output !== 'object') return String(output || '');
    if ('type' in output && 'value' in output) {
      var v = output.value;
      if (typeof v === 'string') return v;
      if (v && typeof v === 'object') return JSON.stringify(v, null, 2);
      return String(v);
    }
    return JSON.stringify(output, null, 2);
  }

  function renderToolBody(toolName, input, output) {
    var html = '';
    if (toolName === 'execute') {
      var cmd = typeof input === 'string' ? input :
        (input && typeof input === 'object' && input.command) ? input.command : '';
      html += '<div class="tool-input"><span style="color:#555">$ </span>' + escapeHtml(cmd) + '</div>';
      var parsed = parseExecuteOutput(output);
      if (parsed) {
        if (parsed.stdout) html += '<pre class="tool-stdout">' + escapeHtml(parsed.stdout) + '</pre>';
        if (parsed.stderr) html += '<pre class="tool-stderr">' + escapeHtml(parsed.stderr) + '</pre>';
        if (parsed.error) html += '<div class="tool-error">error: ' + escapeHtml(parsed.error) + '</div>';
        if (parsed.exit && parsed.exit !== 'exit 0') html += '<div class="tool-exit">' + escapeHtml(parsed.exit) + '</div>';
        if (parsed.signal) html += '<div class="tool-signal">' + escapeHtml(parsed.signal) + '</div>';
      } else if (output == null) {
        html += '<div class="tool-pending">Running...</div>';
      }
    } else {
      if (input != null) {
        var inputStr = typeof input === 'string' ? input : JSON.stringify(input, null, 2);
        html += '<pre class="tool-input">' + escapeHtml(inputStr) + '</pre>';
      }
      if (output != null) {
        html += '<pre class="tool-stdout">' + escapeHtml(formatGenericOutput(output)) + '</pre>';
      } else {
        html += '<div class="tool-pending">Running...</div>';
      }
    }
    return html;
  }

  function renderMessages() {
    var container = document.getElementById('messages');
    var visible = state.messages.filter(function(m) { return !m._meta || !m._meta.uiHidden; });
    var toolResults = buildToolResultsMap(visible);

    var parts = [];
    for (var i = 0; i < visible.length; i++) {
      var msg = visible[i];
      var contentParts = getContentParts(msg.content);
      for (var j = 0; j < contentParts.length; j++) {
        var cp = contentParts[j];
        parts.push({
          role: msg.role, type: cp.type, text: cp.text,
          toolCallId: cp.toolCallId, toolName: cp.toolName, input: cp.input
        });
      }
    }

    var html = '';
    for (var k = 0; k < parts.length; k++) {
      var part = parts[k];

      if (part.role === 'user' && part.type === 'text') {
        html += '<div class="msg user-msg">' +
          '<svg class="msg-icon msg-icon-user" viewBox="0 0 16 16" fill="currentColor"><polygon points="4,3 13,8 4,13"/></svg>' +
          '<div class="markdown-body">' + marked.parse(part.text) + '</div>' +
          '</div>';

      } else if (part.role === 'assistant' && part.type === 'text') {
        var isError = part.text.indexOf('[Aborted]') === 0 || part.text.indexOf('[Error]') === 0;
        var content = isError
          ? '<span style="color:#e55">' + escapeHtml(part.text) + '</span>'
          : marked.parse(part.text);
        html += '<div class="msg assistant-msg">' +
          '<svg class="msg-icon msg-icon-assistant" viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="8" r="4"/></svg>' +
          '<div class="markdown-body">' + content + '</div>' +
          '</div>';

      } else if (part.type === 'tool-call') {
        var result = toolResults.get(part.toolCallId);
        var tn = part.toolName || (result && result.toolName);
        var summary = getToolSummary(tn, part.input);
        var body = renderToolBody(tn, part.input, result ? result.output : null);
        html += '<details class="msg tool-msg">' +
          '<summary>' + escapeHtml(summary) + '</summary>' +
          '<div class="msg-body">' + body + '</div>' +
          '</details>';
      }
    }

    if (state.pending) {
      html += '<div class="spinner-msg"><div class="spinner"></div></div>';
    }

    container.innerHTML = html;
  }

  function scrollToBottom() {
    var container = document.getElementById('messages');
    container.scrollTop = container.scrollHeight;
  }

  function updateUI() {
    var input = document.getElementById('input');
    var sendBtn = document.getElementById('send-btn');
    var abortBtn = document.getElementById('abort-btn');

    input.disabled = state.pending;
    sendBtn.style.display = state.pending ? 'none' : '';
    abortBtn.style.display = state.pending ? '' : 'none';

    renderMessages();
    scrollToBottom();

    if (!state.pending) input.focus();
  }

  async function submitMessage(text) {
    if (!text.trim() || state.pending) return;
    state.pending = true;
    updateUI();

    try {
      var response = await fetch('/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text })
      });

      var reader = response.body.getReader();
      var decoder = new TextDecoder();
      var buffer = '';

      while (true) {
        var chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        var lines = buffer.split('\\n');
        buffer = lines.pop();

        for (var i = 0; i < lines.length; i++) {
          var line = lines[i].trim();
          if (!line) continue;
          try {
            var data = JSON.parse(line);
            if (data.type === 'messages') {
              state.messages = data.messages;
              renderMessages();
              scrollToBottom();
            }
          } catch (e) {
            console.error('Parse error:', e);
          }
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') console.error('Request error:', err);
    } finally {
      state.pending = false;
      updateUI();
    }
  }

  document.getElementById('abort-btn').addEventListener('click', function() {
    fetch('/abort', { method: 'POST' }).catch(function() {});
  });

  var form = document.getElementById('input-form');
  var input = document.getElementById('input');

  function sendInput() {
    var text = input.value;
    input.value = '';
    input.style.height = 'auto';
    submitMessage(text);
  }

  form.addEventListener('submit', function(e) {
    e.preventDefault();
    sendInput();
  });

  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendInput();
    }
  });

  input.addEventListener('input', function() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 200) + 'px';
  });

  renderMessages();
  scrollToBottom();
  input.focus();
})();
`;
