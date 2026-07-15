'use client';

// components/employee/CertificateUpload.tsx
//
// Upload a picture/PDF of a certificate -> parsed via Gemini -> reviewed
// in an editable confirm card (same "AI extracts, human confirms" shape
// already used by the chatbot and Excel import) -> saved as one more
// Certificate entry on save. A small, purpose-built flow rather than a
// retrofit into EmployeeForm's generic relation editor, which submits
// everything as one JSON blob with no file-upload concept at all.

import { useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUpload, faCheck, faXmark, faSpinner, faCertificate } from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '@/context/AuthContext';

const COLORS = { red: '#DC2626', black: '#111111', gray: '#6B7280', border: '#E5E5E5', pinkBg: '#FEE2E2' };

interface ParsedFields {
  certName: string;
  issuer: string;
  issueDate: string;
  expiryDate: string;
}

export default function CertificateUpload({ onSaved }: { onSaved: () => void }) {
  const { authFetch } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [attachmentPath, setAttachmentPath] = useState<string | null>(null);
  const [fields, setFields] = useState<ParsedFields | null>(null);

  const reset = () => {
    setAttachmentPath(null);
    setFields(null);
    setError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await authFetch('/api/employee/certificates/upload', { method: 'POST', body: formData });
      const result = await res.json();
      if (!res.ok) {
        setError(result.error || 'Could not read that certificate.');
        return;
      }
      setAttachmentPath(result.attachmentPath);
      setFields({
        certName: result.parsed.certName ?? '',
        issuer: result.parsed.issuer ?? '',
        issueDate: result.parsed.issueDate ?? '',
        expiryDate: result.parsed.expiryDate ?? '',
      });
    } catch {
      setError('Something went wrong reaching the server — please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleConfirm = async () => {
    if (!fields || !attachmentPath) return;
    setIsSaving(true);
    setError('');
    try {
      const res = await authFetch('/api/chatbot/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update',
          replaceRelations: false, // additive — this adds one certificate, it doesn't resubmit the whole record
          data: { certificates: [{ ...fields, attachmentPath }] },
        }),
      });
      const result = await res.json();
      if (!res.ok) {
        setError(result.error || 'Something went wrong saving that.');
        return;
      }
      reset();
      onSaved();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="rounded-xl border bg-white p-4" style={{ borderColor: COLORS.border }}>
      <div className="flex items-center gap-2 mb-3">
        <FontAwesomeIcon icon={faCertificate} style={{ color: COLORS.red }} />
        <p className="text-sm font-medium" style={{ color: COLORS.black }}>Upload a certificate</p>
      </div>

      {!fields && (
        <>
          <p className="text-xs mb-3" style={{ color: COLORS.gray }}>
            Upload a picture or PDF of a certificate — the name, issuer, and dates get read automatically.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            onChange={handleFileChange}
            disabled={isUploading}
            className="hidden"
            id="certificate-file-input"
          />
          <label
            htmlFor="certificate-file-input"
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition-opacity hover:opacity-90 cursor-pointer"
            style={{ backgroundColor: COLORS.red, opacity: isUploading ? 0.6 : 1, pointerEvents: isUploading ? 'none' : 'auto' }}
          >
            <FontAwesomeIcon icon={isUploading ? faSpinner : faUpload} className={isUploading ? 'text-xs animate-spin' : 'text-xs'} />
            {isUploading ? 'Reading…' : 'Choose a file'}
          </label>
        </>
      )}

      {fields && (
        <div className="space-y-3">
          <p className="text-xs" style={{ color: COLORS.gray }}>
            Check the details below before saving — fix anything that was misread.
          </p>
          {(
            [
              { key: 'certName' as const, label: 'Certificate Name' },
              { key: 'issuer' as const, label: 'Issuing Organization' },
              { key: 'issueDate' as const, label: 'Issue Date' },
              { key: 'expiryDate' as const, label: 'Expiry Date (optional)' },
            ]
          ).map((f) => (
            <div key={f.key} className="space-y-1">
              <label className="block text-xs font-medium" style={{ color: COLORS.black }}>{f.label}</label>
              <input
                type="text"
                value={fields[f.key]}
                onChange={(e) => setFields({ ...fields, [f.key]: e.target.value })}
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none transition-shadow focus:ring-2"
                style={{ borderColor: COLORS.border }}
              />
            </div>
          ))}
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleConfirm}
              disabled={isSaving}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: COLORS.red }}
            >
              <FontAwesomeIcon icon={isSaving ? faSpinner : faCheck} className={isSaving ? 'text-xs animate-spin' : 'text-xs'} />
              {isSaving ? 'Saving…' : 'Save certificate'}
            </button>
            <button
              onClick={reset}
              disabled={isSaving}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors hover:bg-gray-50 disabled:opacity-50"
              style={{ borderColor: COLORS.border, color: COLORS.gray }}
            >
              <FontAwesomeIcon icon={faXmark} className="text-xs" />
              Discard
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="text-xs mt-3 rounded-lg p-2.5" style={{ color: COLORS.red, backgroundColor: COLORS.pinkBg }}>
          {error}
        </p>
      )}
    </div>
  );
}
