'use client';

// components/employee/ScopedAssistant.tsx
//
// The self-service "Assistant" tab — visually similar to
// components/chatbot/ChatbotView.tsx (bubble layout, confirm cards) but a
// fraction of the size, because almost everything that makes the admin
// chatbot big structurally can't happen here: this caller is always
// resolved to exactly one record server-side (see the employee branch in
// app/api/chatbot/extract/route.ts), so there's no disambiguation, no
// create flow, no Excel import, no one-by-one field collection. The only
// actions this can ever get back are 'update', 'info', or 'unsupported'.

import { useState, useRef, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faRobot, faPaperPlane, faCheck, faXmark, faUserPen, faIdCard, faSpinner } from '@fortawesome/free-solid-svg-icons';
import { BASIC_INFO_FIELDS, BASIC_INFO_LABELS } from '@/lib/tabConfig';
import { useAuth } from '@/context/AuthContext';

const COLORS = {
  red: '#DC2626',
  redDark: '#B91C1C',
  black: '#111111',
  gray: '#6B7280',
  pinkBg: '#FEE2E2',
  border: '#E5E5E5',
};

interface OwnEmployee {
  id: number;
  fullName: string;
  email: string | null;
  nationalId: string | null;
}

interface ExtractResponse {
  action: 'update' | 'info' | 'unsupported';
  matches?: OwnEmployee[];
  data?: Record<string, unknown>;
  warnings?: string[];
  message?: string;
  found?: boolean;
  employee?: Record<string, unknown>;
}

interface Message {
  id: string;
  role: 'user' | 'bot';
  text?: string;
  pending?: ExtractResponse;
  timestamp: string;
}

function genId() {
  return Math.random().toString(36).slice(2);
}

function summarizeData(data: Record<string, unknown>) {
  const lines: string[] = [];
  for (const [key, label] of Object.entries(BASIC_INFO_LABELS)) {
    if (data[key]) lines.push(`${label}: ${data[key]}`);
  }
  for (const key of ['experience', 'education', 'certificates', 'skills'] as const) {
    const arr = data[key];
    if (Array.isArray(arr) && arr.length) {
      lines.push(`${key[0].toUpperCase()}${key.slice(1)}: +${arr.length} entr${arr.length > 1 ? 'ies' : 'y'}`);
    }
  }
  return lines;
}

function PendingCard({ pending, onConfirm, onCancel }: { pending: ExtractResponse; onConfirm: () => void; onCancel: () => void }) {
  if (pending.action === 'unsupported') {
    return (
      <div className="rounded-lg border p-4 text-sm" style={{ borderColor: COLORS.border, color: COLORS.gray }}>
        {pending.message}
      </div>
    );
  }

  if (pending.action === 'info') {
    if (!pending.found || !pending.employee) {
      return (
        <div className="rounded-lg border p-4 text-sm" style={{ borderColor: COLORS.border, color: COLORS.gray }}>
          Couldn&apos;t find your profile — try again in a moment.
        </div>
      );
    }
    const e = pending.employee;
    return (
      <div className="rounded-xl border bg-white overflow-hidden shadow-sm" style={{ borderColor: COLORS.border }}>
        <div className="px-4 py-3 flex items-center gap-3" style={{ background: `linear-gradient(135deg, ${COLORS.redDark}, ${COLORS.red})` }}>
          <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}>
            <FontAwesomeIcon icon={faIdCard} className="text-white text-sm" />
          </div>
          <p className="text-white font-semibold text-sm truncate">{String(e.fullName || 'Your profile')}</p>
        </div>
        <div className="p-4 grid grid-cols-2 gap-x-4 gap-y-3">
          {BASIC_INFO_FIELDS.map((key) => {
            const raw = e[key];
            const value = raw === null || raw === undefined || raw === '' ? null : String(raw);
            return (
              <div key={key} className="min-w-0">
                <p className="text-[10.5px] font-semibold uppercase tracking-wide mb-0.5" style={{ color: '#9CA3AF' }}>
                  {BASIC_INFO_LABELS[key]}
                </p>
                <p className="text-sm truncate" style={value ? { color: COLORS.black } : { color: '#B0B4BB', fontStyle: 'italic' }}>
                  {value ?? 'missing'}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // action === 'update'
  const summary = summarizeData(pending.data || {});
  return (
    <div className="rounded-xl border bg-white p-4" style={{ borderColor: COLORS.border }}>
      <div className="flex items-center gap-2 mb-3">
        <FontAwesomeIcon icon={faUserPen} style={{ color: COLORS.red }} />
        <p className="text-sm font-medium" style={{ color: COLORS.black }}>Update your profile?</p>
      </div>
      {pending.warnings && pending.warnings.length > 0 && (
        <div className="rounded-lg p-2.5 mb-2 space-y-1" style={{ backgroundColor: COLORS.pinkBg }}>
          {pending.warnings.map((w, i) => (
            <p key={i} className="text-xs" style={{ color: COLORS.red }}>{w}</p>
          ))}
        </div>
      )}
      <div className="rounded-lg p-3 mb-3 space-y-1" style={{ backgroundColor: '#F9FAFB' }}>
        {summary.length === 0 ? (
          <p className="text-xs" style={{ color: COLORS.gray }}>No recognizable fields were extracted.</p>
        ) : (
          summary.map((line, i) => <p key={i} className="text-xs" style={{ color: COLORS.gray }}>{line}</p>)
        )}
      </div>
      <div className="flex gap-2">
        <button
          onClick={onConfirm}
          className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: COLORS.red }}
        >
          <FontAwesomeIcon icon={faCheck} className="text-xs" />
          Confirm update
        </button>
        <button
          onClick={onCancel}
          className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg border transition-colors hover:bg-gray-50"
          style={{ borderColor: COLORS.border, color: COLORS.gray }}
        >
          <FontAwesomeIcon icon={faXmark} className="text-xs" />
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function ScopedAssistant({ ownEmployee, onUpdated }: { ownEmployee: OwnEmployee; onUpdated: () => void }) {
  const { authFetch } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const addMessage = (m: Omit<Message, 'id' | 'timestamp'>) => {
    setMessages((prev) => [...prev, { ...m, id: genId(), timestamp: new Date().toISOString() }]);
  };

  const send = async () => {
    const text = input.trim();
    if (!text || isSending) return;
    setInput('');
    addMessage({ role: 'user', text });
    setIsSending(true);
    try {
      const res = await authFetch('/api/chatbot/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history: [], lastEmployee: ownEmployee }),
      });
      const result = await res.json();
      if (!res.ok) {
        addMessage({ role: 'bot', text: result.error || 'Something went wrong — please try again.' });
        return;
      }
      addMessage({ role: 'bot', pending: result as ExtractResponse });
    } catch {
      addMessage({ role: 'bot', text: 'Something went wrong reaching the server — please try again.' });
    } finally {
      setIsSending(false);
    }
  };

  const confirmUpdate = async (messageId: string, data: Record<string, unknown>) => {
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, pending: undefined, text: 'Applying update…' } : m)));
    try {
      const res = await authFetch('/api/chatbot/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update', data }),
      });
      const result = await res.json();
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? { ...m, text: res.ok ? 'Your profile has been updated.' : result.error || "That didn't go through — please try again." }
            : m
        )
      );
      if (res.ok) onUpdated();
    } catch {
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, text: 'Something went wrong saving that.' } : m)));
    }
  };

  const cancelUpdate = (messageId: string) => {
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, pending: undefined, text: 'No changes made.' } : m)));
  };

  return (
    <div className="flex flex-col h-[70vh] rounded-xl border bg-white" style={{ borderColor: COLORS.border }}>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-10">
            <FontAwesomeIcon icon={faRobot} className="text-2xl mb-2" style={{ color: COLORS.red }} />
            <p className="text-sm" style={{ color: COLORS.gray }}>
              Ask about your own profile, or tell me what to update — e.g. &quot;update my phone to 01012345678&quot;.
            </p>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] ${m.role === 'user' ? '' : 'w-full'}`}>
              {m.text && (
                <div
                  className="rounded-xl px-3.5 py-2 text-sm"
                  style={m.role === 'user' ? { backgroundColor: COLORS.red, color: 'white' } : { backgroundColor: '#F3F4F6', color: COLORS.black }}
                >
                  {m.text}
                </div>
              )}
              {m.pending && (
                <div className="mt-1">
                  <PendingCard
                    pending={m.pending}
                    onConfirm={() => confirmUpdate(m.id, m.pending!.data || {})}
                    onCancel={() => cancelUpdate(m.id)}
                  />
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="p-3 border-t flex items-center gap-2" style={{ borderColor: COLORS.border }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Message the assistant…"
          className="flex-1 rounded-lg border px-3.5 py-2.5 text-sm outline-none transition-shadow focus:ring-2"
          style={{ borderColor: COLORS.border }}
          disabled={isSending}
        />
        <button
          onClick={send}
          disabled={isSending || !input.trim()}
          className="w-10 h-10 rounded-lg flex items-center justify-center text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ backgroundColor: COLORS.red }}
          aria-label="Send"
        >
          <FontAwesomeIcon icon={isSending ? faSpinner : faPaperPlane} className={isSending ? 'animate-spin' : ''} />
        </button>
      </div>
    </div>
  );
}
