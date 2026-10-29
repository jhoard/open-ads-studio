"use client";

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";

interface ComparisonSliderProps {
  kind: "image" | "video";
  beforeUrl: string;
  afterUrl: string;
  title: string;
}

const clock = (seconds: number): string => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

/** Two aligned versions, revealed by a native keyboard- and touch-accessible range. */
export function ComparisonSlider({ kind, beforeUrl, afterUrl, title }: ComparisonSliderProps) {
  const id = useId();
  const [position, setPosition] = useState(50);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [duration, setDuration] = useState(0);
  const [time, setTime] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const before = useRef<HTMLVideoElement>(null);
  const after = useRef<HTMLVideoElement>(null);
  const style = { "--comparison-position": `${position}%` } as CSSProperties;

  const pause = (): void => {
    before.current?.pause();
    after.current?.pause();
    setPlaying(false);
  };
  // Cached metadata can arrive before React hydrates, so read it on mount as well.
  useEffect(() => {
    if (kind !== "video") return;
    const videos = [before.current, after.current];
    const metadata = (): void => {
      const length = Math.min(...videos.map((video) => video?.duration ?? 0));
      if (Number.isFinite(length)) setDuration(length);
    };
    videos.forEach((video) => {
      video?.addEventListener("loadedmetadata", metadata);
      video?.addEventListener("durationchange", metadata);
    });
    metadata();
    return () => videos.forEach((video) => {
      video?.removeEventListener("loadedmetadata", metadata);
      video?.removeEventListener("durationchange", metadata);
    });
  }, [kind, beforeUrl, afterUrl]);

  const seek = (next: number): void => {
    if (before.current) before.current.currentTime = next;
    if (after.current) after.current.currentTime = next;
    setTime(next);
  };
  const toggle = async (): Promise<void> => {
    if (playing) return pause();
    if (!before.current || !after.current) return;
    if (before.current.ended || after.current.ended || time >= duration) seek(0);
    try {
      await Promise.all([before.current.play(), after.current.play()]);
      setPlaying(true);
      setError(null);
    } catch {
      pause();
      setError("Could not play both versions. Try playing again.");
    }
  };
  const sync = (): void => {
    if (!before.current) return;
    const next = before.current.currentTime;
    setTime(next);
    if (after.current && Math.abs(after.current.currentTime - next) > 0.08) after.current.currentTime = next;
    if (duration > 0 && next >= duration) pause();
  };
  const failed = (): void => {
    pause();
    setError("Could not load both versions. Refresh the page to try again.");
  };

  return (
    <figure className="comparison" aria-label={`Before and after: ${title}`}>
      <div className="comparison-frame" style={style}>
        {kind === "image" ? (
          <img className="comparison-base" src={afterUrl} alt={`${title}, restored label`} onError={failed} />
        ) : (
          <video className="comparison-base" ref={after} src={afterUrl} muted={muted} playsInline preload="metadata" aria-label={`${title}, restored label`} onEnded={pause} onError={failed} />
        )}
        <div className="comparison-before">
          {kind === "image" ? (
            <img src={beforeUrl} alt={`${title}, model output`} onError={failed} />
          ) : (
            <video ref={before} src={beforeUrl} muted playsInline preload="metadata" aria-label={`${title}, model output`} onTimeUpdate={sync} onEnded={pause} onError={failed} />
          )}
        </div>
        <span className="comparison-label comparison-label-before" aria-hidden="true">Model output</span>
        <span className="comparison-label comparison-label-after" aria-hidden="true">Restored label</span>
        <span className="comparison-divider" aria-hidden="true">
          <span>
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" aria-hidden="true">
              <path d="m9 8-4 4 4 4m6-8 4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </span>
        <input
          className="comparison-range"
          id={`${id}-split`}
          type="range"
          min={0}
          max={100}
          value={position}
          onChange={(event) => setPosition(Number(event.target.value))}
          aria-label="Compare model output and restored label"
          aria-valuetext={`${position}% model output, ${100 - position}% restored label`}
          aria-describedby={`${id}-help`}
        />
      </div>
      <figcaption id={`${id}-help`} className="comparison-help">Drag the divider to compare. Use arrow keys for fine adjustments.</figcaption>
      {kind === "video" && (
        <div className="comparison-playback">
          <button className="button button-secondary" type="button" onClick={() => void toggle()} disabled={!duration} aria-label={playing ? "Pause comparison" : "Play comparison"}>{playing ? "Pause" : "Play"}</button>
          <input type="range" min={0} max={duration || 1} step={0.01} value={Math.min(time, duration)} disabled={!duration} onChange={(event) => seek(Number(event.target.value))} aria-label="Comparison video position" aria-valuetext={`${clock(time)} of ${clock(duration)}`} />
          <span className="comparison-time">{clock(time)} / {clock(duration)}</span>
          <button className="button button-secondary" type="button" onClick={() => setMuted(!muted)} aria-pressed={!muted}>{muted ? "Unmute" : "Mute"}</button>
        </div>
      )}
      {error && <p className="notice notice-error" role="alert">{error}</p>}
    </figure>
  );
}
