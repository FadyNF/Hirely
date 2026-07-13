'use client';

// components/shared/SupportRequestModal.tsx
//
// Contact-support form any admin can open — including someone still on
// the "waiting for approval" screen, so they can appeal a rejection or
// ask why they haven't been approved. The submitter's email is required
// (prefilled + read-only when the caller already knows it, editable when
// they don't) because the route has to work without an auth cookie for
// pending users.

import { useState } from 'react';

const COLORS = {
  red: '#DC2626',
  black: '#111111',
  gray: '#6B7280',
  border: '#E5E5E5',
  pinkBg: '#FEE2E2',
};

const TYPES: { value: 'issue' | 'request' | 'other'; label: string }[] = [
  { value: 'issue', label: 'Report an issue' },
  { value: 'request', label: 'Request something' },
  { value: 'other', label: 'Other' },
];

export default function SupportRequestModal({
  submitterEmail,
  emailLocked = true,
  onClose,
}: {
  submitterEmail: string;
  // Whether the email field is editable. Locked when the caller already
  // knows who we are (pending-approval user, or a logged-in user), free
  // to type otherwise (defensive default is locked to keep it single-use).
  emailLocked?: boolean;
  onClose: () => void;
}) {
  const [type, setType] = useState<'issue' | 'request' | 'other'>('issue');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState(submitterEmail);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const canSubmit = subject.trim().length > 0 && message.trim().length > 0 && email.trim().length > 0 && !busy;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/support-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, subject: subject.trim(), message: message.trim(), email: email.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || 'Something went wrong. Please try again.');
        return;
      }
      setSubmitted(true);
    } catch {
      setError('Something went wrong reaching the server.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(17,17,17,0.5)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-white rounded-xl overflow-hidden flex flex-col animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b flex items-center justify-between shrink-0" style={{ borderColor: COLORS.border }}>
          <div>
            <h2 className="text-lg font-semibold" style={{ color: COLORS.black }}>
              {submitted ? 'Message sent' : 'Contact administrator'}
            </h2>
            <p className="text-xs" style={{ color: COLORS.gray }}>
              {submitted
                ? "We'll get back to you as soon as we can."
                : 'Report an issue or ask for something from the root administrator.'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-lg transition-colors hover:bg-gray-100"
            style={{ color: COLORS.gray }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {submitted ? (
          <div className="px-6 py-8 text-center">
            <p className="text-sm mb-6" style={{ color: COLORS.gray }}>
              Thanks — your message has been logged.
            </p>
            <button
              onClick={onClose}
              className="text-sm font-semibold px-5 py-2 rounded-lg text-white transition-all hover:opacity-90 hover:shadow-md"
              style={{ backgroundColor: COLORS.red }}
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
            {error && (
              <div className="p-3 rounded-lg text-sm" style={{ background: COLORS.pinkBg, color: COLORS.red }}>
                {error}
              </div>
            )}

            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: COLORS.gray }}>Type</label>
              <div className="flex gap-2">
                {TYPES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setType(t.value)}
                    className="flex-1 text-sm px-3 py-2 rounded-lg border transition-colors"
                    style={{
                      borderColor: type === t.value ? COLORS.red : COLORS.border,
                      backgroundColor: type === t.value ? COLORS.pinkBg : 'transparent',
                      color: type === t.value ? COLORS.red : COLORS.black,
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="sr-email" className="block text-xs font-medium mb-1.5" style={{ color: COLORS.gray }}>Your email</label>
              <input
                id="sr-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                readOnly={emailLocked}
                required
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none transition-shadow focus:ring-2 read-only:bg-gray-50 read-only:text-gray-500"
                style={{ borderColor: COLORS.border }}
              />
            </div>

            <div>
              <label htmlFor="sr-subject" className="block text-xs font-medium mb-1.5" style={{ color: COLORS.gray }}>Subject</label>
              <input
                id="sr-subject"
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Brief description"
                maxLength={200}
                required
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none transition-shadow focus:ring-2"
                style={{ borderColor: COLORS.border }}
              />
            </div>

            <div>
              <label htmlFor="sr-message" className="block text-xs font-medium mb-1.5" style={{ color: COLORS.gray }}>Message</label>
              <textarea
                id="sr-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="What's going on?"
                rows={5}
                maxLength={5000}
                required
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none transition-shadow focus:ring-2 resize-none"
                style={{ borderColor: COLORS.border }}
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="text-sm font-medium px-4 py-2 rounded-lg border transition-colors hover:bg-gray-50"
                style={{ borderColor: COLORS.border, color: COLORS.black }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!canSubmit}
                className="text-sm font-semibold px-5 py-2 rounded-lg text-white transition-all hover:opacity-90 hover:shadow-md disabled:opacity-50 disabled:hover:opacity-50 disabled:hover:shadow-none"
                style={{ backgroundColor: COLORS.red }}
              >
                {busy ? 'Sending…' : 'Send'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
