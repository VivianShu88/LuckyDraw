import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { GoogleGenAI } from "@google/genai";
import { Settings, Play, Square, Trophy, Users, Image as ImageIcon, Trash2, PartyPopper, Volume2, VolumeX, Upload, Wand2, Hash, X } from "lucide-react";

// --- Types ---
interface Participant {
  id: string;
  name: string;
}

interface WinnerRecord {
  id: string;
  roundId: number;
  prizeName: string;
  winners: Participant[];
  timestamp: number;
  aiComment?: string;
}

// --- Constants ---
const STORAGE_KEY = "lottery_app_v3"; 
// Default list is now numbers 1-100
const DEFAULT_PARTICIPANTS = Array.from({ length: 100 }, (_, i) => String(i + 1));
const generateId = () => Math.random().toString(36).substr(2, 9);

// Sound URLs
const SOUND_DRUM_ROLL = "https://www.soundjay.com/misc/sounds/drum-roll-01.mp3";
const SOUND_APPLAUSE = "https://www.soundjay.com/human/sounds/applause-01.mp3";

// --- Components ---

// 1. Confetti Effect
const ConfettiExplosion = ({ isActive }: { isActive: boolean }) => {
  if (!isActive) return null;
  const particles = Array.from({ length: 100 }).map((_, i) => {
    const left = Math.random() * 100;
    const delay = Math.random() * 0.5;
    const duration = 2 + Math.random() * 3;
    const color = ['#ff0', '#f00', '#0f0', '#00f', '#f0f', '#0ff'][Math.floor(Math.random() * 6)];
    return (
      <div 
        key={i} 
        className="confetti" 
        style={{ 
          left: `${left}%`, 
          backgroundColor: color,
          animationDelay: `${delay}s`,
          animationDuration: `${duration}s`
        }} 
      />
    );
  });
  return <div className="confetti-container">{particles}</div>;
};

// 2. Speed Lines Effect
const SpeedLines = ({ isActive }: { isActive: boolean }) => {
  if (!isActive) return null;
  const lines = Array.from({ length: 20 }).map((_, i) => (
    <div key={i} className="line" style={{ '--r': `${i * 18}deg` } as React.CSSProperties} />
  ));
  return <div className="speed-lines">{lines}</div>;
};

// --- Main Application ---
const App = () => {
  // -- State --
  const [allParticipants, setAllParticipants] = useState<Participant[]>([]);
  const [history, setHistory] = useState<WinnerRecord[]>([]);
  const [bgImage, setBgImage] = useState<string>("https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?q=80&w=2670&auto=format&fit=crop");
  
  // Round Config
  const [roundNumber, setRoundNumber] = useState(1);
  const [prizeName, setPrizeName] = useState("幸运大奖");
  const [drawCount, setDrawCount] = useState(1);
  
  // Settings State for Range Generation
  const [rangeStart, setRangeStart] = useState<number>(1);
  const [rangeEnd, setRangeEnd] = useState<number>(100);

  // Runtime State
  const [isRolling, setIsRolling] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [currentRollingName, setCurrentRollingName] = useState("准备就绪");
  const [lastRoundResult, setLastRoundResult] = useState<WinnerRecord | null>(null);
  
  // UI State
  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  // Refs
  const rollIntervalRef = useRef<number | null>(null);
  const drumRollAudioRef = useRef<HTMLAudioElement | null>(null);
  const applauseAudioRef = useRef<HTMLAudioElement | null>(null);
  const applauseTimeoutRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // -- Initialization --
  useEffect(() => {
    // Audio Init
    drumRollAudioRef.current = new Audio(SOUND_DRUM_ROLL);
    drumRollAudioRef.current.loop = true;
    applauseAudioRef.current = new Audio(SOUND_APPLAUSE);

    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const data = JSON.parse(saved);
        setAllParticipants(data.allParticipants || []);
        setHistory(data.history || []);
        if (data.bgImage) setBgImage(data.bgImage);
        if (data.isMuted !== undefined) setIsMuted(data.isMuted);
        if (data.roundNumber) setRoundNumber(data.roundNumber);
        if (data.allParticipants) setTextInput(data.allParticipants.map((p: Participant) => p.name).join('\n'));
      } catch (e) {
        console.error("Failed to parse local storage", e);
      }
    } else {
      const defaults = DEFAULT_PARTICIPANTS.map(name => ({ id: generateId(), name }));
      setAllParticipants(defaults);
      setTextInput(defaults.map(p => p.name).join('\n'));
    }

    return () => {
      stopAudio();
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        allParticipants,
        history,
        bgImage,
        isMuted,
        roundNumber
      }));
    } catch (e) {
      console.warn("Storage quota exceeded, settings (background) may not be saved.", e);
    }
  }, [allParticipants, history, bgImage, isMuted, roundNumber]);

  // -- Computed --
  const winnerIds = new Set(history.flatMap(h => h.winners.map(w => w.id)));
  const availableParticipants = allParticipants.filter(p => !winnerIds.has(p.id));

  // -- Audio Controller --
  const stopAudio = () => {
    if (drumRollAudioRef.current) {
      drumRollAudioRef.current.pause();
      drumRollAudioRef.current.currentTime = 0;
    }
    if (applauseAudioRef.current) {
      applauseAudioRef.current.pause();
      applauseAudioRef.current.currentTime = 0;
    }
    if (applauseTimeoutRef.current) {
      clearTimeout(applauseTimeoutRef.current);
    }
  };

  const playDrumRoll = () => {
    if (isMuted || !drumRollAudioRef.current) return;
    stopAudio(); // Ensure clean state
    drumRollAudioRef.current.currentTime = 0;
    drumRollAudioRef.current.volume = 1.0;
    drumRollAudioRef.current.play().catch(e => console.warn("Audio blocked:", e));
  };

  const playShortApplause = () => {
    if (isMuted || !applauseAudioRef.current) return;
    stopAudio(); // Stop drums
    
    const audio = applauseAudioRef.current;
    audio.currentTime = 0;
    audio.volume = 1.0;
    audio.play().catch(e => console.warn("Audio blocked:", e));

    // Fade out logic: Play for 4s, then fade out over 2s
    const fadeDuration = 2000;
    const playDuration = 4000;
    
    applauseTimeoutRef.current = window.setTimeout(() => {
      // Start fade out
      const fadeInterval = setInterval(() => {
        if (audio.volume > 0.1) {
          audio.volume -= 0.1;
        } else {
          audio.pause();
          audio.currentTime = 0;
          audio.volume = 1.0;
          clearInterval(fadeInterval);
        }
      }, fadeDuration / 10);
    }, playDuration);
  };

  // -- AI Service --
  const generateAiComment = async (prize: string, winners: string[]) => {
    if (!process.env.API_KEY) return;
    setAiLoading(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const prompt = `
        背景: 公司年会抽奖。奖项: "${prize}"。中奖者: ${winners.join(', ')}。
        任务: 生成一句非常简短的恭喜语，必须控制在12个汉字以内。
        要求: 只有一行，不使用引号，语气喜庆幽默。
        例如: "恭喜发财，明年暴富！" 或 "运气太好了，欧皇附体！"
      `;
      const result = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt
      });
      const text = result.text?.trim()?.replace(/["'“”]/g, '');
      if (text) {
        setLastRoundResult(prev => prev ? { ...prev, aiComment: text } : null);
        setHistory(prev => {
            const newHist = [...prev];
            if (newHist.length > 0) newHist[0].aiComment = text;
            return newHist;
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setAiLoading(false);
    }
  };

  // -- Logic --
  const startRolling = () => {
    if (availableParticipants.length === 0) {
      alert("奖池已空！");
      return;
    }
    
    // Reset States
    setLastRoundResult(null);
    setShowConfetti(false);
    setIsRolling(true);
    
    // Start Audio
    playDrumRoll();

    // Start Visual Loop (Fast)
    rollIntervalRef.current = window.setInterval(() => {
      const randomIndex = Math.floor(Math.random() * availableParticipants.length);
      setCurrentRollingName(availableParticipants[randomIndex].name);
    }, 40);
  };

  const stopRolling = () => {
    if (!rollIntervalRef.current) return;
    clearInterval(rollIntervalRef.current);
    rollIntervalRef.current = null;
    setIsRolling(false);
    
    // Play Applause (Short version)
    playShortApplause();

    // Select Winners
    const pool = [...availableParticipants];
    // Modern Fisher-Yates shuffle
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const actualCount = Math.min(drawCount, pool.length);
    const winners = pool.slice(0, actualCount);

    const record: WinnerRecord = {
      id: generateId(),
      roundId: roundNumber,
      prizeName,
      winners,
      timestamp: Date.now(),
    };

    setLastRoundResult(record);
    setHistory(prev => [record, ...prev]);
    setShowConfetti(true); // Trigger Confetti

    // Auto increment round number
    setRoundNumber(prev => prev + 1);

    // Clean up confetti after 5s
    setTimeout(() => setShowConfetti(false), 5000);

    // AI
    generateAiComment(prizeName, winners.map(w => w.name));
  };

  const handleClearHistory = () => {
    if (confirm("确定清空所有中奖记录并重置轮数吗？")) {
      setHistory([]);
      setLastRoundResult(null);
      setRoundNumber(1);
      setShowConfetti(false);
      setShowHistory(false);
    }
  };
  
  const handleCloseResultModal = () => {
    setLastRoundResult(null);
  };

  const updateParticipants = () => {
    const names = textInput.split('\n').map(n => n.trim()).filter(n => n.length > 0);
    setAllParticipants(names.map(name => ({ id: generateId(), name })));
    setShowSettings(false);
  };

  const generateRangeParticipants = () => {
    if (isNaN(rangeStart) || isNaN(rangeEnd) || rangeStart > rangeEnd) {
      alert("请输入有效的数字范围");
      return;
    }
    const names: string[] = [];
    for (let i = rangeStart; i <= rangeEnd; i++) {
      names.push(String(i));
    }
    setAllParticipants(names.map(name => ({ id: generateId(), name })));
    setTextInput(names.join('\n'));
    setShowSettings(false);
  };

  const handleBgUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Increased to 10MB
      if (file.size > 10 * 1024 * 1024) { 
         alert("图片较大（>10MB），可能无法保存到下次访问，但本次可以使用。");
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          setBgImage(reader.result);
        }
      };
      reader.readAsDataURL(file);
    }
    // IMPORTANT: Reset value so same file can be selected again
    e.target.value = '';
  };

  return (
    <div 
      className="min-h-screen text-white relative overflow-hidden flex flex-col font-sans"
      style={{
        backgroundImage: `url(${bgImage})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center'
      }}
    >
      {/* Visual Effects Layer */}
      <div className="absolute inset-0 bg-black/40 z-0"></div>
      <SpeedLines isActive={isRolling} />
      <ConfettiExplosion isActive={showConfetti} />

      {/* Header */}
      <header className="relative z-30 p-6 flex justify-between items-center bg-gradient-to-b from-black/90 to-transparent">
        <h1 className="text-3xl md:text-4xl font-black tracking-tight text-white drop-shadow-md italic">
          <span className="text-yellow-500">C³</span> 杭州家宴
        </h1>
        <div className="flex gap-3">
           <div className="hidden md:flex flex-col items-end mr-4 text-sm font-medium text-gray-200">
             <span>奖池: <strong className="text-yellow-400 text-lg">{availableParticipants.length}</strong> 人</span>
           </div>
           
           <button onClick={() => setIsMuted(!isMuted)} className="p-3 hover:bg-white/20 rounded-full transition text-white/90">
              {isMuted ? <VolumeX /> : <Volume2 />}
           </button>
           <button onClick={() => setShowHistory(true)} className="p-3 hover:bg-white/20 rounded-full transition text-white/90"><Users /></button>
           <button onClick={() => setShowSettings(true)} className="p-3 hover:bg-white/20 rounded-full transition text-white/90"><Settings /></button>
        </div>
      </header>

      {/* Main Stage */}
      <main className="relative z-20 flex-grow flex flex-col items-center justify-center p-4">
        
        {/* Display Area */}
        <div className="w-full flex-grow flex items-center justify-center relative mb-8 min-h-[400px]">
            {isRolling ? (
               <div className="text-center animate-shake relative z-10">
                  <div className="text-2xl text-yellow-300 mb-6 font-bold tracking-widest uppercase drop-shadow-lg">
                     第 {roundNumber} 轮：正在抽取 {prizeName}...
                  </div>
                  <div className="text-8xl md:text-[10rem] font-black text-white drop-shadow-[0_0_30px_rgba(255,215,0,0.8)] whitespace-nowrap">
                    {currentRollingName}
                  </div>
               </div>
            ) : (
              // Default "Ready" View - Always shown when not rolling, behind the modal if modal is open
              <div className="text-center opacity-80 hover:opacity-100 transition duration-500">
                 <div className="w-32 h-32 bg-yellow-500/20 rounded-full flex items-center justify-center mx-auto mb-6 border-2 border-yellow-500/50 shadow-[0_0_30px_rgba(253,224,71,0.3)]">
                   <Trophy size={64} className="text-yellow-400" />
                 </div>
                 <h2 className="text-5xl font-black tracking-tight mb-2">准备就绪</h2>
                 <p className="text-2xl text-gray-300 font-light">
                   第 <span className="text-yellow-500 font-bold">{roundNumber}</span> 轮 <span className="mx-2">·</span> {prizeName} <span className="mx-2">·</span> {drawCount} 人
                 </p>
              </div>
            )}
        </div>

        {/* Controls Bar */}
        <div className="bg-black/60 backdrop-blur-xl rounded-2xl p-6 w-full max-w-5xl flex flex-col md:flex-row gap-6 items-end border border-white/10 shadow-2xl z-30 transform transition-all hover:scale-[1.01]">
           <div className="flex-grow grid grid-cols-1 md:grid-cols-12 gap-4 w-full">
              {/* Round Number Input */}
              <div className="md:col-span-2 space-y-2">
                <label className="text-xs uppercase tracking-wider text-yellow-500/80 font-bold ml-1">轮数</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">第</span>
                  <input 
                    type="number"
                    min="1"
                    value={roundNumber}
                    onChange={(e) => setRoundNumber(parseInt(e.target.value) || 1)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-4 pl-8 pr-8 text-lg text-white focus:outline-none focus:ring-2 focus:ring-yellow-500 transition-all font-mono font-bold text-center"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">轮</span>
                </div>
              </div>

              {/* Prize Name */}
              <div className="md:col-span-6 space-y-2">
                <label className="text-xs uppercase tracking-wider text-yellow-500/80 font-bold ml-1">奖项名称</label>
                <input 
                  value={prizeName}
                  onChange={(e) => setPrizeName(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-yellow-500 transition-all font-bold"
                  placeholder="例如：特等奖"
                />
              </div>

              {/* Draw Count */}
              <div className="md:col-span-4 space-y-2">
                <label className="text-xs uppercase tracking-wider text-yellow-500/80 font-bold ml-1">抽取人数</label>
                <input 
                  type="number"
                  min="1"
                  max={availableParticipants.length || 1}
                  value={drawCount}
                  onChange={(e) => setDrawCount(parseInt(e.target.value) || 1)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-lg text-white focus:outline-none focus:ring-2 focus:ring-yellow-500 transition-all font-mono font-bold"
                />
              </div>
           </div>
           
           <button
             onClick={isRolling ? stopRolling : startRolling}
             disabled={availableParticipants.length === 0 && !isRolling}
             className={`
                h-[88px] min-w-[180px] rounded-xl font-black text-2xl tracking-wider shadow-xl transition-all transform active:scale-95
                flex items-center justify-center gap-3 shrink-0
                ${isRolling 
                  ? 'bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white shadow-red-900/50' 
                  : 'bg-gradient-to-r from-yellow-400 to-yellow-600 hover:from-yellow-300 hover:to-yellow-500 text-black shadow-yellow-900/50'
                }
                ${availableParticipants.length === 0 && !isRolling ? 'opacity-50 cursor-not-allowed grayscale' : ''}
             `}
           >
             {isRolling ? (
               <>停止 <Square size={24} fill="currentColor" /></>
             ) : (
               <>开始 <Play size={28} fill="currentColor" /></>
             )}
           </button>
        </div>

      </main>

      {/* WINNER MODAL */}
      {lastRoundResult && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
          onClick={handleCloseResultModal}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm cursor-pointer"></div>

          {/* Modal Content */}
          <div 
            className="relative z-10 bg-black/50 backdrop-blur-2xl p-8 md:p-12 rounded-3xl border border-yellow-500/20 shadow-[0_0_60px_rgba(255,215,0,0.2)] flex flex-col items-center max-w-6xl w-full mx-4 animate-pop-in"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button 
              onClick={handleCloseResultModal}
              className="absolute top-4 right-4 p-2 text-white/50 hover:text-white hover:bg-white/10 rounded-full transition"
            >
              <X size={24} />
            </button>

            <h2 className="text-4xl text-yellow-300 font-black mb-8 drop-shadow-[0_4px_4px_rgba(0,0,0,0.8)]">
              🎉 第 {lastRoundResult.roundId} 轮中奖名单 🎉
            </h2>

            <div className="flex flex-wrap gap-6 justify-center w-full">
              {lastRoundResult.winners.map((w, idx) => (
                <div 
                  key={w.id} 
                  className="bg-gradient-to-t from-red-600 to-red-500 border-4 border-yellow-400 text-white px-10 py-6 rounded-2xl text-4xl font-extrabold shadow-[0_10px_30px_rgba(0,0,0,0.5)] transform hover:scale-110 transition-transform duration-200"
                  style={{ animationDelay: `${idx * 0.1}s` }}
                >
                  {w.name}
                </div>
              ))}
            </div>
            
            {/* AI Comment */}
            <div className="mt-10 min-h-[60px] max-w-3xl text-center w-full">
              {aiLoading ? (
                 <div className="text-yellow-200/60 animate-pulse">AI 正在生成神评...</div>
              ) : lastRoundResult.aiComment && (
                 <div className="text-2xl text-yellow-100 font-medium italic bg-black/60 px-8 py-4 rounded-xl border border-yellow-500/30 backdrop-blur-md shadow-2xl inline-block">
                   "{lastRoundResult.aiComment}"
                 </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade-in">
          <div className="bg-gray-900 border border-white/10 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
            <div className="p-6 border-b border-white/10 flex justify-between items-center">
              <h2 className="text-2xl font-bold flex items-center gap-2 text-white"><Settings className="text-yellow-500"/> 设置</h2>
              <button onClick={() => setShowSettings(false)} className="text-gray-400 hover:text-white">✕</button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-8">
              {/* Background Upload */}
              <section>
                <h3 className="text-sm uppercase tracking-wider text-gray-400 mb-3 flex items-center gap-2"><ImageIcon size={16}/> 背景图片</h3>
                <div className="flex gap-4 items-center">
                  <div 
                    className="w-32 h-20 bg-gray-800 rounded-lg bg-cover bg-center border border-gray-600"
                    style={{ backgroundImage: `url(${bgImage})` }}
                  />
                  <div className="flex-grow">
                     <label className="flex items-center gap-2 cursor-pointer bg-white/10 hover:bg-white/20 px-4 py-2 rounded-lg text-sm text-white transition w-fit">
                       <Upload size={16} /> 上传图片
                       <input 
                         ref={fileInputRef}
                         type="file" 
                         accept="image/*" 
                         className="hidden" 
                         onChange={handleBgUpload}
                       />
                     </label>
                     <p className="text-xs text-gray-500 mt-2">支持 JPG, PNG. 建议小于 10MB.</p>
                  </div>
                </div>
                <div className="mt-3">
                    <label className="text-xs text-gray-500 block mb-1">或输入图片链接:</label>
                    <input 
                      value={bgImage}
                      onChange={(e) => setBgImage(e.target.value)}
                      className="w-full bg-black/40 border border-white/20 rounded-lg p-3 text-sm text-gray-300 focus:ring-2 focus:ring-yellow-500 outline-none"
                    />
                </div>
              </section>

              {/* Participants */}
              <section>
                 <div className="flex justify-between items-center mb-3">
                   <h3 className="text-sm uppercase tracking-wider text-gray-400 flex items-center gap-2"><Users size={16}/> 名单设置</h3>
                   <span className="text-xs text-yellow-500 font-bold">当前: {allParticipants.length} 人</span>
                 </div>
                 
                 {/* Generator Tool */}
                 <div className="bg-white/5 rounded-lg p-4 mb-4 border border-white/5">
                    <div className="flex items-center gap-2 mb-2 text-gray-300 text-sm font-semibold">
                      <Hash size={14} className="text-yellow-500"/> 快速生成数字名单
                    </div>
                    <div className="flex gap-2 items-center">
                       <input 
                         type="number" 
                         value={rangeStart} 
                         onChange={e => setRangeStart(parseInt(e.target.value))}
                         className="w-24 bg-black/40 border border-white/20 rounded p-2 text-white text-center"
                       />
                       <span className="text-gray-500">至</span>
                       <input 
                         type="number" 
                         value={rangeEnd} 
                         onChange={e => setRangeEnd(parseInt(e.target.value))}
                         className="w-24 bg-black/40 border border-white/20 rounded p-2 text-white text-center"
                       />
                       <button 
                         onClick={generateRangeParticipants}
                         className="ml-auto flex items-center gap-2 bg-yellow-600 hover:bg-yellow-500 text-white px-3 py-2 rounded text-xs font-bold transition"
                       >
                         <Wand2 size={14} /> 生成
                       </button>
                    </div>
                 </div>

                 <textarea 
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    placeholder="每行一个名字"
                    className="w-full h-32 bg-black/40 border border-white/20 rounded-lg p-3 text-sm text-gray-300 focus:ring-2 focus:ring-yellow-500 outline-none font-mono"
                 />
                 <div className="mt-4 flex justify-end">
                   <button 
                     onClick={updateParticipants}
                     className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg text-sm font-bold shadow-lg transition"
                   >
                     保存自定义名单
                   </button>
                 </div>
              </section>

              <section className="pt-4 border-t border-white/10">
                 <button 
                   onClick={handleClearHistory}
                   className="flex items-center gap-2 text-red-400 hover:text-red-300 hover:bg-red-900/20 px-4 py-2 rounded-lg transition"
                 >
                   <Trash2 size={16} /> 清空所有数据
                 </button>
              </section>
            </div>
          </div>
        </div>
      )}

      {/* History Sidebar */}
      {showHistory && (
        <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-gray-900/95 backdrop-blur-xl border-l border-white/10 shadow-2xl flex flex-col transition-transform">
           <div className="p-6 border-b border-white/10 flex justify-between items-center">
              <h2 className="text-xl font-bold">中奖记录</h2>
              <div className="flex items-center gap-4">
                  <button 
                    onClick={handleClearHistory}
                    className="text-red-400 hover:text-red-300 flex items-center gap-1 text-sm font-semibold bg-red-900/10 px-3 py-1.5 rounded-lg border border-red-500/20 transition hover:bg-red-900/20"
                    title="清空记录"
                  >
                    <Trash2 size={14} /> 清空记录
                  </button>
                  <button onClick={() => setShowHistory(false)} className="text-gray-400 hover:text-white p-1 hover:bg-white/10 rounded-full transition">✕</button>
              </div>
           </div>
           <div className="flex-grow overflow-y-auto p-6 space-y-4">
              {history.length === 0 ? (
                <div className="text-gray-500 text-center py-10 flex flex-col items-center">
                   <div className="bg-white/5 p-4 rounded-full mb-3"><Trophy size={32} className="opacity-20"/></div>
                   <p>暂无中奖记录</p>
                </div>
              ) : (
                history.map((record) => (
                  <div key={record.id} className="bg-white/5 rounded-xl p-4 border border-white/5 hover:border-yellow-500/30 transition">
                     <div className="flex justify-between items-start mb-2">
                       <span className="text-white font-bold text-sm bg-blue-600/30 px-2 py-0.5 rounded">第 {record.roundId} 轮</span>
                       <span className="text-yellow-500 font-bold text-sm bg-yellow-900/20 px-2 py-0.5 rounded">{record.prizeName}</span>
                     </div>
                     <div className="flex flex-wrap gap-2 mb-3">
                       {record.winners.map(w => (
                         <span key={w.id} className="bg-white/10 px-2 py-1 rounded text-sm text-gray-200 font-medium">
                           {w.name}
                         </span>
                       ))}
                     </div>
                     <div className="text-xs text-gray-500 font-mono text-right mb-2">{new Date(record.timestamp).toLocaleTimeString('zh-CN')}</div>
                     {record.aiComment && (
                       <div className="text-xs text-gray-300 italic border-l-2 border-yellow-500/50 pl-3 py-1 bg-black/20 rounded-r">
                         {record.aiComment}
                       </div>
                     )}
                  </div>
                ))
              )}
           </div>
        </div>
      )}

    </div>
  );
};

const root = createRoot(document.getElementById("root")!);
root.render(<App />);