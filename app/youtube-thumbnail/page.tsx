'use client';

import { useState } from 'react';

function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

export default function YoutubeThumbnailPage() {
  const [url, setUrl] = useState('');
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleFetch() {
    setError(null);
    setThumbnailUrl(null);
    const videoId = extractVideoId(url.trim());
    if (!videoId) {
      setError('Invalid YouTube URL');
      return;
    }
    setThumbnailUrl(`https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') handleFetch();
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-neutral-900 p-6">
      <div className="w-full max-w-xl flex flex-col gap-4">
        <h1 className="text-white text-2xl font-bold text-center">YouTube Thumbnail Fetcher</h1>

        <div className="flex gap-2">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Paste YouTube URL..."
            className="flex-1 rounded-lg bg-neutral-800 text-white placeholder-neutral-500 px-4 py-2 outline-none focus:ring-2 focus:ring-red-500"
          />
          <button
            onClick={handleFetch}
            className="bg-red-600 hover:bg-red-700 text-white font-semibold px-5 py-2 rounded-lg transition-colors"
          >
            Get Thumbnail
          </button>
        </div>

        {error && (
          <p className="text-red-400 text-sm text-center">{error}</p>
        )}

        {thumbnailUrl && (
          <div className="flex flex-col items-center gap-3 mt-2">
            <img
              src={thumbnailUrl}
              alt="YouTube thumbnail"
              className="w-full rounded-xl shadow-lg"
              onError={(e) => {
                const img = e.currentTarget;
                if (!img.src.includes('hqdefault')) {
                  img.src = img.src.replace('maxresdefault', 'hqdefault');
                }
              }}
            />
            <a
              href={thumbnailUrl}
              download="thumbnail.jpg"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-neutral-700 hover:bg-neutral-600 text-white text-sm px-4 py-2 rounded-lg transition-colors"
            >
              Download Thumbnail
            </a>
          </div>
        )}
      </div>
    </main>
  );
}
