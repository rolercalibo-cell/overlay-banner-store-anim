import Head from 'next/head';
import { useRef, useState, useCallback } from 'react';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_HEADLINE_LENGTH = 120;
const MAX_SECONDARY_LENGTH = 60;

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read the selected photo'));
    reader.readAsDataURL(file);
  });
}

export default function MobileGenerator() {
  const fileInputRef = useRef(null);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [headline, setHeadline] = useState('');
  const [secondaryText, setSecondaryText] = useState('Otaku Buddies');
  const [useCustomAccount, setUseCustomAccount] = useState(false);
  const [templateId, setTemplateId] = useState('');
  const [authCode, setAuthCode] = useState('');
  const [status, setStatus] = useState('idle'); // idle | uploading | generating | done
  const [error, setError] = useState(null);
  const [generatedImage, setGeneratedImage] = useState(null);

  const isBusy = status === 'uploading' || status === 'generating';

  const handlePhotoChange = useCallback(async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file later
    if (!file) return;

    setError(null);

    if (!ALLOWED_TYPES.includes(file.type)) {
      setError('Unsupported format. Please choose a JPEG, PNG, or WebP photo.');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError('That photo is too large. Maximum size is 10MB.');
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      setPhotoFile(file);
      setPhotoPreview(dataUrl);
    } catch {
      setError('Could not preview the selected photo. Please try another one.');
    }
  }, []);

  const handleGenerate = useCallback(async () => {
    if (isBusy) return;
    setError(null);

    if (!photoFile || !photoPreview) {
      setError('Please choose a photo first.');
      return;
    }
    const trimmedHeadline = headline.trim();
    if (!trimmedHeadline) {
      setError('Please enter a headline.');
      return;
    }
    if (trimmedHeadline.length > MAX_HEADLINE_LENGTH) {
      setError(`Headline must be ${MAX_HEADLINE_LENGTH} characters or fewer.`);
      return;
    }
    const trimmedSecondary = secondaryText.trim();
    if (!trimmedSecondary) {
      setError('Please enter a secondary text.');
      return;
    }
    if (trimmedSecondary.length > MAX_SECONDARY_LENGTH) {
      setError(`Secondary text must be ${MAX_SECONDARY_LENGTH} characters or fewer.`);
      return;
    }

    try {
      setStatus('uploading');
      const uploadRes = await fetch('/api/mobile/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageData: photoPreview }),
      });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(uploadData.error || 'Upload failed');

      setStatus('generating');
      const generateRes = await fetch('/api/mobile/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl: uploadData.imageUrl,
          headline: trimmedHeadline,
          secondaryText: trimmedSecondary,
          ...(useCustomAccount && templateId.trim() && authCode.trim()
            ? { templateId: templateId.trim(), authCode: authCode.trim() }
            : {}),
        }),
      });
      const generateData = await generateRes.json();
      if (!generateRes.ok) throw new Error(generateData.error || 'Image generation failed');

      setGeneratedImage(generateData.imageUrl);
      setStatus('done');
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
      setStatus('idle');
    }
  }, [isBusy, photoFile, photoPreview, headline, secondaryText, useCustomAccount, templateId, authCode]);

  const handleGenerateAnother = useCallback(() => {
    setGeneratedImage(null);
    setStatus('idle');
    setError(null);
  }, []);

  const handleDownload = useCallback(async () => {
    if (!generatedImage) return;
    try {
      const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
      const downloadUrl = `/api/mobile/download?url=${encodeURIComponent(generatedImage)}`;
      const res = await fetch(downloadUrl);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Download failed');
      }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `apps-gadget-${timestamp}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      setError(err.message || 'Download failed. Please try again.');
    }
  }, [generatedImage]);

  const statusMessage = {
    uploading: 'Uploading your photo…',
    generating: 'Generating your image…',
  }[status];

  return (
    <div className="page">
      <Head>
        <title>Mobile Image Generator</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </Head>

      <header className="header">
        <h1>Mobile Image Generator</h1>
        <span className="badge">⚡ APITemplate.io</span>
      </header>

      <main className="content">
        {status === 'done' && generatedImage ? (
          <section className="card" aria-label="Generated image preview">
            <img className="result-image" src={generatedImage} alt="Generated result" />
            <div className="button-row">
              <button className="btn btn-secondary" onClick={handleGenerateAnother}>Generate Another</button>
              <button className="btn btn-primary" onClick={handleDownload}>Download Image</button>
            </div>
          </section>
        ) : (
          <>
            <section className="card">
              <h2>1. Choose Photo</h2>
              <div className="upload-area" onClick={() => fileInputRef.current?.click()}>
                {photoPreview ? (
                  <img className="photo-preview" src={photoPreview} alt="Selected" />
                ) : (
                  <div className="upload-placeholder">
                    <span className="upload-icon">📷</span>
                    <span>Tap to choose a photo</span>
                  </div>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handlePhotoChange}
                hidden
              />
              <button type="button" className="btn btn-outline" onClick={() => fileInputRef.current?.click()}>
                {photoPreview ? 'Replace Photo' : 'Choose Photo'}
              </button>
            </section>

            <section className="card">
              <h2>2. Main Headline</h2>
              <label className="field-label" htmlFor="headline">Main Headline</label>
              <textarea
                id="headline"
                className="text-input"
                placeholder="Enter your headline..."
                value={headline}
                maxLength={MAX_HEADLINE_LENGTH}
                onChange={(e) => setHeadline(e.target.value)}
                rows={2}
              />
              <div className="char-counter">{headline.length} / {MAX_HEADLINE_LENGTH}</div>
            </section>

            <section className="card">
              <h2>3. Secondary Text</h2>
              <label className="field-label" htmlFor="secondaryText">Secondary Text</label>
              <input
                id="secondaryText"
                className="text-input"
                type="text"
                placeholder="Enter secondary text..."
                value={secondaryText}
                maxLength={MAX_SECONDARY_LENGTH}
                onChange={(e) => setSecondaryText(e.target.value)}
              />
              <div className="char-counter">{secondaryText.length} / {MAX_SECONDARY_LENGTH}</div>
            </section>

            <section className="card">
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={useCustomAccount}
                  onChange={(e) => setUseCustomAccount(e.target.checked)}
                />
                <span>Use a different APITemplate.io account</span>
              </label>
              {useCustomAccount && (
                <div className="custom-account-fields">
                  <label className="field-label" htmlFor="templateId">Template ID</label>
                  <input
                    id="templateId"
                    className="text-input"
                    type="text"
                    placeholder="e.g. 8e977b297e3ab2ba"
                    value={templateId}
                    onChange={(e) => setTemplateId(e.target.value)}
                    autoComplete="off"
                  />
                  <label className="field-label" htmlFor="authCode">Auth Code</label>
                  <input
                    id="authCode"
                    className="text-input"
                    type="password"
                    placeholder="e.g. pKWh1q9L"
                    value={authCode}
                    onChange={(e) => setAuthCode(e.target.value)}
                    autoComplete="off"
                  />
                  <p className="hint-text">
                    Both the Template ID and Auth Code are on your template&apos;s Direct URL tab in APITemplate.io.
                    Leave blank to use the app&apos;s default template.
                  </p>
                </div>
              )}
            </section>

            {error && (
              <div className="error-banner" role="alert">{error}</div>
            )}

            <button className="btn btn-primary btn-generate" onClick={handleGenerate} disabled={isBusy}>
              {isBusy ? (statusMessage || 'Working…') : 'Generate Image'}
            </button>

            {isBusy && <div className="status-text">{statusMessage}</div>}
          </>
        )}
      </main>

      <style jsx>{`
        .page {
          min-height: 100vh;
          background: #0a0a0a;
          color: #fff;
          padding: 16px;
          padding-bottom: calc(24px + env(safe-area-inset-bottom));
          display: flex;
          flex-direction: column;
          gap: 16px;
          max-width: 480px;
          margin: 0 auto;
          box-sizing: border-box;
        }
        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-top: env(safe-area-inset-top);
        }
        .header h1 {
          font-size: 1.25rem;
          margin: 0;
        }
        .badge {
          font-size: 0.75rem;
          background: rgba(255, 215, 0, 0.15);
          color: #FFD700;
          padding: 6px 10px;
          border-radius: 999px;
          white-space: nowrap;
        }
        .content {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .card {
          background: #161616;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 16px;
          padding: 16px;
        }
        .card h2 {
          font-size: 0.95rem;
          margin: 0 0 12px;
          color: rgba(255, 255, 255, 0.85);
        }
        .upload-area {
          aspect-ratio: 4 / 5;
          border-radius: 12px;
          border: 2px dashed rgba(255, 255, 255, 0.25);
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          cursor: pointer;
          margin-bottom: 12px;
          background: #0f0f0f;
        }
        .upload-placeholder {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          color: rgba(255, 255, 255, 0.5);
          font-size: 0.9rem;
        }
        .upload-icon {
          font-size: 2.5rem;
        }
        .photo-preview {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .field-label {
          display: none;
        }
        .text-input {
          width: 100%;
          background: #0f0f0f;
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 10px;
          color: #fff;
          padding: 12px 14px;
          font-size: 1rem;
          box-sizing: border-box;
          resize: none;
          font-family: inherit;
        }
        .char-counter {
          text-align: right;
          font-size: 0.75rem;
          color: rgba(255, 255, 255, 0.4);
          margin-top: 6px;
        }
        .toggle-row {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 0.9rem;
          cursor: pointer;
        }
        .custom-account-fields {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-top: 14px;
        }
        .hint-text {
          font-size: 0.75rem;
          color: rgba(255, 255, 255, 0.45);
          margin: 0;
        }
        .btn {
          border: none;
          border-radius: 12px;
          font-size: 1rem;
          font-weight: 600;
          padding: 14px 18px;
          cursor: pointer;
          min-height: 48px;
          width: 100%;
          box-sizing: border-box;
        }
        .btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .btn-primary {
          background: #FFD700;
          color: #111;
        }
        .btn-outline {
          background: transparent;
          border: 1px solid rgba(255, 255, 255, 0.25);
          color: #fff;
        }
        .btn-secondary {
          background: rgba(255, 255, 255, 0.1);
          color: #fff;
        }
        .btn-generate {
          position: sticky;
          bottom: 8px;
        }
        .button-row {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-top: 14px;
        }
        .result-image {
          width: 100%;
          aspect-ratio: 4 / 5;
          object-fit: contain;
          background: #000;
          border-radius: 12px;
        }
        .error-banner {
          background: rgba(220, 38, 38, 0.15);
          border: 1px solid rgba(220, 38, 38, 0.4);
          color: #fca5a5;
          padding: 12px 14px;
          border-radius: 10px;
          font-size: 0.9rem;
        }
        .status-text {
          text-align: center;
          font-size: 0.85rem;
          color: rgba(255, 255, 255, 0.6);
        }
      `}</style>
    </div>
  );
}
