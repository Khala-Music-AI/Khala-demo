// App.jsx
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { samples } from "./samples.js";
import "./index.css";

const WAVEFORM_BAR_COUNT = 72;
const MIN_COLLAPSED_LYRICS_HEIGHT = 190;

function getPublicAssetUrl(path) {
  return `${import.meta.env.BASE_URL}${path.replace(/^\/+/, "")}`;
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) {
    return "0:00";
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");

  return `${minutes}:${remainingSeconds}`;
}

function buildWaveformPeaks(audioBuffer, barCount) {
  const channelData = audioBuffer.getChannelData(0);
  const samplesPerBar = Math.floor(channelData.length / barCount);

  return Array.from({ length: barCount }, (_, barIndex) => {
    const start = barIndex * samplesPerBar;
    const end =
      barIndex === barCount - 1
        ? channelData.length
        : start + samplesPerBar;
    let peak = 0;

    for (let i = start; i < end; i += 1) {
      peak = Math.max(peak, Math.abs(channelData[i]));
    }

    return peak;
  });
}

function AudioPlayer({ id, src, activeSampleId, onActivate }) {
  const audioRef = useRef(null);
  const waveformRef = useRef(null);
  const audioSrc = getPublicAssetUrl(src);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [waveformPeaks, setWaveformPeaks] = useState(
    Array.from({ length: WAVEFORM_BAR_COUNT }, () => 0.25),
  );

  useEffect(() => {
    let cancelled = false;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;

    if (!AudioContextClass) {
      return undefined;
    }

    const audioContext = new AudioContextClass();

    fetch(audioSrc)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Unable to load audio: ${audioSrc}`);
        }

        return response.arrayBuffer();
      })
      .then((arrayBuffer) => audioContext.decodeAudioData(arrayBuffer))
      .then((audioBuffer) => {
        if (cancelled) return;

        const peaks = buildWaveformPeaks(audioBuffer, WAVEFORM_BAR_COUNT);
        const loudestPeak = Math.max(...peaks, 0.01);

        setWaveformPeaks(peaks.map((peak) => peak / loudestPeak));
      })
      .catch(() => {
        if (!cancelled) {
          setWaveformPeaks(Array.from({ length: WAVEFORM_BAR_COUNT }, () => 0.25));
        }
      })
      .finally(() => {
        audioContext.close();
      });

    return () => {
      cancelled = true;
    };
  }, [audioSrc]);

  useEffect(() => {
    const audio = audioRef.current;

    if (!audio || activeSampleId === id || audio.paused) {
      return;
    }

    audio.pause();
  }, [activeSampleId, id]);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (audio.paused) {
      onActivate(id);
      audio.play();
    } else {
      audio.pause();
    }
  };

  const seekToPointerPosition = (event) => {
    const audio = audioRef.current;
    const waveform = waveformRef.current;

    if (!audio || !waveform || !duration) return;

    const bounds = waveform.getBoundingClientRect();
    const seekRatio = Math.min(
      Math.max((event.clientX - bounds.left) / bounds.width, 0),
      1,
    );
    const nextTime = seekRatio * duration;

    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  };

  const progress = duration ? currentTime / duration : 0;

  return (
    <div className="audio-player">
      <button className="play-button" type="button" onClick={toggle}>
        {playing ? "Ⅱ" : "▶"}
      </button>

      <button
        ref={waveformRef}
        className="waveform"
        type="button"
        aria-label="Seek audio"
        onClick={seekToPointerPosition}
      >
        {waveformPeaks.map((peak, i) => (
          <span
            key={i}
            className={i / waveformPeaks.length <= progress ? "active" : ""}
            style={{
              height: `${10 + peak * 38}px`,
            }}
          />
        ))}
      </button>

      <span className="time">
        {formatTime(currentTime)} / {formatTime(duration)}
      </span>

      <audio
        ref={audioRef}
        src={audioSrc}
        preload="metadata"
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onPlay={() => {
          onActivate(id);
          setPlaying(true);
        }}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />
    </div>
  );
}

function SampleItem({ sample, activeSampleId, onActivateAudio }) {
  const [lyricsExpanded, setLyricsExpanded] = useState(false);
  const sampleRef = useRef(null);
  const sampleMetaRef = useRef(null);
  const lyricsPanelRef = useRef(null);
  const lyricsRef = useRef(null);
  const lyricsToggleTouchedRef = useRef(false);
  const [lyricsHeight, setLyricsHeight] = useState(0);
  const [lyricsCollapsedHeight, setLyricsCollapsedHeight] = useState(
    MIN_COLLAPSED_LYRICS_HEIGHT,
  );

  useLayoutEffect(() => {
    const updateLyricsLayout = () => {
      const metaHeight = sampleMetaRef.current?.clientHeight ?? 0;

      setLyricsCollapsedHeight(
        Math.max(metaHeight, MIN_COLLAPSED_LYRICS_HEIGHT),
      );

      setLyricsHeight(lyricsRef.current?.scrollHeight ?? 0);
    };

    updateLyricsLayout();
    window.addEventListener("resize", updateLyricsLayout);

    return () => window.removeEventListener("resize", updateLyricsLayout);
  }, [sample.lyrics]);

  const scrollSampleIntoView = (position) => {
    const sampleElement = sampleRef.current;

    if (!sampleElement) return;

    const sampleBounds = sampleElement.getBoundingClientRect();
    const sampleTop = sampleBounds.top + window.scrollY;
    const targetTop =
      position === "center"
        ? sampleTop - (window.innerHeight - sampleBounds.height) / 2
        : sampleTop;

    window.scrollTo({
      top: Math.max(targetTop, 0),
      behavior: "smooth",
    });
  };

  useEffect(() => {
    if (!lyricsToggleTouchedRef.current) {
      return undefined;
    }

    const timeoutIds = lyricsExpanded
      ? [
          window.setTimeout(() => scrollSampleIntoView("start"), 40),
          window.setTimeout(() => scrollSampleIntoView("start"), 320),
        ]
      : [window.setTimeout(() => scrollSampleIntoView("center"), 300)];

    return () => timeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId));
  }, [lyricsExpanded]);

  const toggleLyrics = () => {
    lyricsToggleTouchedRef.current = true;
    setLyricsExpanded((expanded) => !expanded);
  };

  return (
    <section
      ref={sampleRef}
      className={`sample-item ${lyricsExpanded ? "sample-item-expanded" : ""}`}
    >
      <div ref={sampleMetaRef} className="sample-meta">
        <div className="sample-id">{sample.id}</div>
        <h3>{sample.title}</h3>
        <p>{sample.prompt}</p>
      </div>

      <div
        ref={lyricsPanelRef}
        className={`sample-lyrics ${
          lyricsExpanded ? "sample-lyrics-expanded" : ""
        }`}
        style={{
          "--lyrics-collapsed-height": `${lyricsCollapsedHeight}px`,
          "--lyrics-expanded-height": `${lyricsHeight}px`,
        }}
      >
        <p ref={lyricsRef} className="lyrics-text">
          {sample.lyrics}
        </p>
        <button
          className="text-button"
          type="button"
          aria-expanded={lyricsExpanded}
          onClick={toggleLyrics}
        >
          {lyricsExpanded ? "Hide full lyrics⌃" : "Show full lyrics⌄"}
        </button>
      </div>

      <AudioPlayer
        id={sample.id}
        src={sample.audio}
        activeSampleId={activeSampleId}
        onActivate={onActivateAudio}
      />
    </section>
  );
}

export default function App() {
  const [activeSampleId, setActiveSampleId] = useState(null);

  return (
    <main className="page">
      <header className="topbar">
        <div className="brand">
          <div className="logo">Shao</div>
          <span>Research Demo</span>
        </div>

        <nav>
          <a href="https://arxiv.org/abs/2605.01790">Paper</a>
          <a href="https://github.com/Shao-Music-AI/Shao">GitHub</a>
          <a href="https://huggingface.co/liujiafeng/Shao-MusicGeneration-v1.0">
            Model
          </a>
        </nav>
      </header>

      <section className="hero">
        <h2>
          Scaling Acoustic Token Language Models
          <br />
          Toward High-Fidelity Music Generation
        </h2>
        <p>All prompts and lyrics below are AI-generated.</p>
      </section>

      <div className="samples">
        {samples.map((sample) => (
          <SampleItem
            key={sample.id}
            sample={sample}
            activeSampleId={activeSampleId}
            onActivateAudio={setActiveSampleId}
          />
        ))}
      </div>

      <footer>© 2026 Shao Team</footer>
    </main>
  );
}
