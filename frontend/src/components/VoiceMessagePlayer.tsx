"use client";

import { useState, useRef, useEffect } from "react";
import { Play, Pause, Download, Volume2 } from "lucide-react";
import { getBackendUrl } from "@/lib/api";

interface VoiceMessagePlayerProps {
  url: string;
  duration?: number;
  isSentByMe?: boolean;
}

export function VoiceMessagePlayer({ url, duration: initialDuration, isSentByMe }: VoiceMessagePlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(initialDuration || 0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Compute full audio URL
  const fullUrl = url.startsWith("http") ? url : `${getBackendUrl()}${url}`;

  // Fixed randomized heights for aesthetic WhatsApp-style waveform bars
  const waveBars = [
    35, 60, 45, 80, 50, 95, 70, 40, 85, 65, 30, 90, 55, 75, 45, 80, 60, 40, 70, 50, 85, 35
  ];

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onLoadedMetadata = () => {
      if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
        setDuration(Math.round(audio.duration));
      }
    };

    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("ended", onEnded);

    return () => {
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("ended", onEnded);
    };
  }, []);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play().then(() => setIsPlaying(true)).catch(console.error);
    }
  };

  const handleSeek = (percentage: number) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const newTime = (percentage / 100) * duration;
    audio.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const toggleSpeed = () => {
    const audio = audioRef.current;
    if (!audio) return;
    const nextRate = playbackRate === 1 ? 1.5 : playbackRate === 1.5 ? 2 : 1;
    audio.playbackRate = nextRate;
    setPlaybackRate(nextRate);
  };

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  const progressPercentage = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      className={`flex flex-col gap-1.5 p-2 sm:p-2.5 rounded-2xl w-full max-w-xs sm:max-w-sm ${
        isSentByMe
          ? "bg-indigo-950/40 border border-indigo-400/20"
          : "bg-slate-900/60 border border-slate-700/60"
      }`}
    >
      <audio ref={audioRef} src={fullUrl} preload="metadata" />

      <div className="flex items-center gap-2.5">
        {/* Play/Pause Button */}
        <button
          type="button"
          onClick={togglePlay}
          className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 transition-transform active:scale-95 shadow-md ${
            isSentByMe
              ? "bg-white text-indigo-700 hover:bg-indigo-100"
              : "bg-gradient-to-tr from-emerald-500 to-teal-400 text-white hover:brightness-110"
          }`}
          title={isPlaying ? "Mettre en pause" : "Écouter le vocal"}
        >
          {isPlaying ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current ml-0.5" />}
        </button>

        {/* WhatsApp-style Waveform Bars (changes color as it plays!) */}
        <div
          className="flex-1 flex items-center gap-[2.5px] h-8 cursor-pointer select-none"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const pct = Math.max(0, Math.min(100, (clickX / rect.width) * 100));
            handleSeek(pct);
          }}
        >
          {waveBars.map((height, idx) => {
            const barProgress = (idx / waveBars.length) * 100;
            const isPlayed = barProgress <= progressPercentage;

            return (
              <div
                key={idx}
                style={{ height: `${height}%` }}
                className={`flex-1 min-w-[2px] rounded-full transition-colors duration-150 ${
                  isPlayed
                    ? isSentByMe
                      ? "bg-amber-300"
                      : "bg-emerald-400"
                    : isSentByMe
                    ? "bg-indigo-300/40"
                    : "bg-slate-600/50"
                }`}
              />
            );
          })}
        </div>

        {/* Speed button (1x, 1.5x, 2x) */}
        <button
          type="button"
          onClick={toggleSpeed}
          className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-white/10 hover:bg-white/20 text-slate-200 shrink-0 transition-colors"
          title="Vitesse de lecture"
        >
          {playbackRate}x
        </button>

        {/* Download voice file */}
        <a
          href={fullUrl}
          download="vocal.webm"
          className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-white/10 transition-colors shrink-0"
          title="Télécharger le message vocal"
        >
          <Download className="h-3.5 w-3.5" />
        </a>
      </div>

      {/* Time & Duration display */}
      <div className="flex items-center justify-between px-1 text-[10px] font-mono text-slate-300/80">
        <span>{formatSeconds(isPlaying ? currentTime : duration || 0)}</span>
        <span className="text-[9px] uppercase tracking-wider text-slate-400">Message vocal</span>
      </div>
    </div>
  );
}
