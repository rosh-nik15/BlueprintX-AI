import React, { useState, useRef, useEffect } from 'react';
import { Upload, FileText, Loader2, AlertTriangle, ChevronRight, CheckCircle2, DollarSign, PenTool, Zap, GripVertical, Home, Volume2, Square, Palette, ArrowLeft, Box } from 'lucide-react';
import LandingPage from './components/LandingPage';
import Viewer3D from './components/Viewer3D';
import Viewer2D from './components/Viewer2D';
import { analyzeBlueprint, generateSpeech } from './services/geminiService';
import { BlueprintAnalysis } from './types';
import * as pdfjsLib from 'pdfjs-dist';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@4.8.69/build/pdf.worker.min.mjs`;

// --- Sample Data Constants ---
const SAMPLE_DATA: BlueprintAnalysis = {
  walls: [
    { id: 'w1', start: { x: 10, y: 10 }, end: { x: 90, y: 10 }, thickness: 2, type: 'brick' },
    { id: 'w2', start: { x: 90, y: 10 }, end: { x: 90, y: 70 }, thickness: 2, type: 'brick' },
    { id: 'w3', start: { x: 90, y: 70 }, end: { x: 10, y: 70 }, thickness: 2, type: 'brick' },
    { id: 'w4', start: { x: 10, y: 70 }, end: { x: 10, y: 10 }, thickness: 2, type: 'brick' },
    { id: 'w5', start: { x: 50, y: 10 }, end: { x: 50, y: 70 }, thickness: 1, type: 'drywall' },
    { id: 'w6', start: { x: 50, y: 40 }, end: { x: 90, y: 40 }, thickness: 1, type: 'drywall' }
  ],
  doors: [
    { id: 'd1', position: { x: 50, y: 60 }, width: 8, rotation: 0 },
    { id: 'd2', position: { x: 70, y: 40 }, width: 6, rotation: 90 },
    { id: 'd3', position: { x: 25, y: 70 }, width: 10, rotation: 0 }
  ],
  rooms: [
    {
      id: 'r1', name: 'Open Office', areaSqFt: 400, center: { x: 30, y: 40 },
      polygon: [{x:10,y:10}, {x:50,y:10}, {x:50,y:70}, {x:10,y:70}],
      suggestedColor: '#e0f2fe', colorDescription: 'Productivity Blue'
    },
    {
      id: 'r2', name: 'Meeting Room', areaSqFt: 250, center: { x: 70, y: 25 },
      polygon: [{x:50,y:10}, {x:90,y:10}, {x:90,y:40}, {x:50,y:40}],
      suggestedColor: '#fce7f3', colorDescription: 'Calm Rose'
    },
    {
      id: 'r3', name: 'Lounge', areaSqFt: 250, center: { x: 70, y: 55 },
      polygon: [{x:50,y:40}, {x:90,y:40}, {x:90,y:70}, {x:50,y:70}],
      suggestedColor: '#dcfce7', colorDescription: 'Relaxed Green'
    }
  ],
  material_cost_estimation: {
    materials: [
      { item: "Standard Brick", quantity: "3200", unit: "pcs", estimated_cost: "$1,800", basis_of_calculation: "External Perimeter" },
      { item: "Glass Partitions", quantity: "15", unit: "ft", estimated_cost: "$2,200", basis_of_calculation: "Meeting Room Front" },
      { item: "Commercial Carpet", quantity: "1200", unit: "sqft", estimated_cost: "$3,600", basis_of_calculation: "Office Area" }
    ],
    total_estimated_cost: "$7,600"
  },
  renovation_recommendations: [
    { detected_issue: "Flow constraint", recommended_action: "Widen lounge entrance", benefit: "Better accessibility" },
    { detected_issue: "Acoustic bleed", recommended_action: "Add soundproofing to meeting room", benefit: "Privacy" }
  ],
  electrical_plumbing_safety: {
    electrical: {
        wiring_length: "450 ft",
        switchboard_positions: ["Main Entrance", "Meeting Room Internal"],
        socket_positions: ["Floor boxes in Open Office", "Wall mounts in Lounge"],
        load_distribution: "Heavy load in server corner"
    },
    plumbing: {
        pipe_routes: ["West Wall Vertical Chute"],
        pipe_sizes: "Standard PVC",
        wet_area_notes: "None present"
    },
    safety_warnings: []
  },
  summary: "A modern office layout with a large open workspace, a private meeting room, and a breakout lounge area."
};

// --- Types ---
type AppStep = 'LANDING' | 'UPLOAD' | 'PROCESSING' | 'DASHBOARD';

// --- Audio Helper Functions (PCM Decoding) ---
function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

// --- PDF Conversion Helper ---
async function convertPdfToImage(file: File): Promise<string> {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    
    // Get the first page
    const page = await pdf.getPage(1);
    
    // Determine scale for reasonable quality (e.g., width ~1500px)
    const viewport = page.getViewport({ scale: 2.0 });
    
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    if (!context) throw new Error("Could not create canvas context");

    await page.render({
        canvasContext: context,
        viewport: viewport
    } as any).promise;

    return canvas.toDataURL('image/jpeg', 0.8);
}

// --- Narrative Generator ---
const generateNarrative = (data: BlueprintAnalysis) => {
    let text = `Here is the analysis for your blueprint. `;
    
    // Rooms
    text += `I identified ${data.rooms?.length || 0} rooms. `;
    
    // Color suggestion sample
    if (data.rooms?.length > 0 && data.rooms[0].suggestedColor) {
         text += `For the ${data.rooms[0].name}, I suggest a ${data.rooms[0].colorDescription}. `;
    }

    // Cost
    if (data.material_cost_estimation) {
        text += `The total estimated material cost is ${data.material_cost_estimation.total_estimated_cost}. `;
    } else {
        text += `Cost estimation is not available. `;
    }
    
    // Safety
    if (data.electrical_plumbing_safety?.safety_warnings) {
        const critical = data.electrical_plumbing_safety.safety_warnings.filter(w => w.severity === 'Critical' || w.severity === 'High');
        if (critical.length > 0) {
            text += `Attention needed: I found ${critical.length} critical safety warnings. For example, ${critical[0].type} in the ${critical[0].location}. `;
        } else {
            text += `The safety checks look mostly good. `;
        }
    }

    // Renovation
    if (data.renovation_recommendations?.length > 0) {
        text += `For renovation, I recommend: ${data.renovation_recommendations[0].recommended_action}. `;
    }
    
    text += "Please review the detailed report for more information.";
    return text;
};

// --- Dashboard Component (Analysis Panel) ---
const AnalysisPanel = ({ 
    data, 
    highlightedRoomId, 
    onHome, 
    onUpload 
}: { 
    data: BlueprintAnalysis, 
    highlightedRoomId: string | null,
    onHome: () => void,
    onUpload: () => void
}) => {
    const [activeTab, setActiveTab] = useState<'cost' | 'renovation' | 'safety'>('cost');
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [isGeneratingVoice, setIsGeneratingVoice] = useState(false);
    const audioContextRef = useRef<AudioContext | null>(null);
    const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);

    const handleSpeak = async () => {
        if (isSpeaking) {
            // Stop logic
            if (audioSourceRef.current) {
                audioSourceRef.current.stop();
                audioSourceRef.current = null;
            }
            setIsSpeaking(false);
            return;
        }

        setIsGeneratingVoice(true);
        try {
            // 1. Generate text script
            const script = generateNarrative(data);
            
            // 2. Call Gemini TTS
            const base64Audio = await generateSpeech(script);
            
            // 3. Setup Audio Context
            if (!audioContextRef.current) {
                audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
            }
            const ctx = audioContextRef.current;
            if (ctx.state === 'suspended') await ctx.resume();

            // 4. Decode raw PCM
            const pcmBytes = decode(base64Audio);
            const audioBuffer = await decodeAudioData(pcmBytes, ctx, 24000, 1);

            // 5. Play
            const source = ctx.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(ctx.destination);
            source.onended = () => setIsSpeaking(false);
            
            audioSourceRef.current = source;
            source.start(0);
            setIsSpeaking(true);

        } catch (err) {
            console.error("Failed to speak report:", err);
            alert("Could not generate voice report.");
        } finally {
            setIsGeneratingVoice(false);
        }
    };

    return (
        <div className="h-full flex flex-col bg-slate-900 overflow-hidden">
            {/* Navigation Header */}
            <div className="p-3 border-b border-slate-800 flex gap-2 shrink-0">
                <button 
                    onClick={onHome}
                    className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs font-medium transition-colors"
                    title="Back to Home"
                >
                    <Home size={14} />
                    Home
                </button>
                <button 
                    onClick={onUpload}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-cyan-950/50 hover:bg-cyan-900/50 text-cyan-400 border border-cyan-900/50 hover:border-cyan-500/50 rounded text-xs font-medium transition-all"
                    title="Upload New Blueprint"
                >
                    <Upload size={14} />
                    New Upload
                </button>
            </div>

            <div className="p-4 border-b border-slate-700">
                <div className="flex justify-between items-start">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        <FileText className="text-cyan-400" /> Project Analysis
                    </h2>
                    
                    {/* Voice Assistant Button */}
                    <button 
                        onClick={handleSpeak}
                        disabled={isGeneratingVoice}
                        className={`p-2 rounded-full transition-all flex items-center justify-center ${
                            isSpeaking 
                            ? 'bg-red-500/20 text-red-400 border border-red-500/50 hover:bg-red-500/30' 
                            : 'bg-slate-800 text-slate-300 border border-slate-600 hover:bg-slate-700 hover:text-white'
                        }`}
                        title={isSpeaking ? "Stop Voice" : "Describe Report (Voice Assistant)"}
                    >
                        {isGeneratingVoice ? (
                            <Loader2 size={16} className="animate-spin text-cyan-400" />
                        ) : isSpeaking ? (
                            <Square size={16} fill="currentColor" />
                        ) : (
                            <Volume2 size={16} />
                        )}
                    </button>
                </div>
                
                {highlightedRoomId && (
                    <div className="mt-2 text-sm text-cyan-300 bg-cyan-950/30 px-3 py-1 rounded border border-cyan-800">
                        Selected: {data.rooms?.find(r => r.id === highlightedRoomId)?.name || 'Unknown Room'}
                    </div>
                )}
            </div>

            <div className="flex border-b border-slate-700">
                <button 
                    onClick={() => setActiveTab('cost')}
                    className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${activeTab === 'cost' ? 'text-cyan-400 border-b-2 border-cyan-400 bg-slate-800/50' : 'text-slate-400 hover:text-slate-200'}`}
                >
                    <DollarSign size={16} /> Cost
                </button>
                <button 
                    onClick={() => setActiveTab('renovation')}
                    className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${activeTab === 'renovation' ? 'text-purple-400 border-b-2 border-purple-400 bg-slate-800/50' : 'text-slate-400 hover:text-slate-200'}`}
                >
                    <PenTool size={16} /> Reno
                </button>
                <button 
                    onClick={() => setActiveTab('safety')}
                    className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${activeTab === 'safety' ? 'text-red-400 border-b-2 border-red-400 bg-slate-800/50' : 'text-slate-400 hover:text-slate-200'}`}
                >
                    <Zap size={16} /> Safety
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                {activeTab === 'cost' && (
                    data.material_cost_estimation ? (
                        <div className="space-y-4">
                            <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700">
                                <h3 className="text-sm uppercase tracking-wide text-slate-400 mb-2">Total Estimated Cost</h3>
                                <div className="text-3xl font-bold text-green-400">{data.material_cost_estimation.total_estimated_cost}</div>
                            </div>
                            <div className="space-y-2">
                                {data.material_cost_estimation.materials?.map((item, idx) => (
                                    <div key={idx} className="bg-slate-800 p-3 rounded border border-slate-700 text-sm">
                                        <div className="flex justify-between font-semibold text-white">
                                            <span>{item.item}</span>
                                            <span>{item.estimated_cost}</span>
                                        </div>
                                        <div className="text-slate-400 text-xs mt-1">
                                            Qty: {item.quantity} {item.unit} • {item.basis_of_calculation}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="text-slate-500 text-center p-4">Cost estimation data is unavailable.</div>
                    )
                )}

                {activeTab === 'renovation' && (
                    <div className="space-y-3">
                         {/* Color Suggestions Section */}
                         <div className="mb-6">
                            <h3 className="text-xs font-bold uppercase text-slate-500 mb-3 flex items-center gap-2">
                                <Palette size={12} /> Color Suggestions
                            </h3>
                            {data.rooms && data.rooms.length > 0 ? (
                                <div className="grid gap-2">
                                    {data.rooms.map((room, idx) => room.suggestedColor && (
                                        <div key={idx} className="bg-slate-800 p-3 rounded flex items-start gap-3 border border-slate-700">
                                            <div 
                                                className="w-8 h-8 rounded-full shadow-lg shrink-0 border border-slate-600" 
                                                style={{ backgroundColor: room.suggestedColor }}
                                                title={room.suggestedColor}
                                            ></div>
                                            <div>
                                                <div className="font-semibold text-sm text-white">{room.name}</div>
                                                <p className="text-xs text-slate-400 mt-1">{room.colorDescription}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-slate-500 text-xs">No rooms detected for color suggestions.</div>
                            )}
                         </div>

                         {/* Existing Recommendations */}
                         {data.renovation_recommendations?.map((rec, idx) => (
                            <div key={idx} className="bg-slate-800 p-3 rounded-l border-l-4 border-purple-500">
                                <h4 className="font-semibold text-purple-200 text-sm mb-1">{rec.detected_issue}</h4>
                                <p className="text-slate-300 text-sm mb-2">{rec.recommended_action}</p>
                                <div className="flex items-center gap-1 text-xs text-green-400">
                                    <CheckCircle2 size={12} /> Benefit: {rec.benefit}
                                </div>
                            </div>
                         ))}
                    </div>
                )}

                {activeTab === 'safety' && (
                    data.electrical_plumbing_safety ? (
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <h3 className="text-xs font-bold uppercase text-slate-500">Critical Warnings</h3>
                                {data.electrical_plumbing_safety.safety_warnings?.length > 0 ? (
                                    data.electrical_plumbing_safety.safety_warnings.map((warn, idx) => (
                                        <div key={idx} className={`p-3 rounded border ${warn.severity === 'Critical' ? 'bg-red-950/30 border-red-500/50' : 'bg-orange-950/30 border-orange-500/50'}`}>
                                            <div className="flex items-center gap-2 mb-1">
                                                <AlertTriangle size={16} className={warn.severity === 'Critical' ? 'text-red-500' : 'text-orange-500'} />
                                                <span className={`text-sm font-bold ${warn.severity === 'Critical' ? 'text-red-400' : 'text-orange-400'}`}>{warn.type}</span>
                                            </div>
                                            <p className="text-xs text-slate-300">{warn.recommended_fix}</p>
                                            <div className="text-[10px] text-slate-500 mt-1 uppercase">{warn.location}</div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="text-slate-500 text-xs">No critical safety warnings found.</div>
                                )}
                            </div>

                            <div className="space-y-2">
                                 <h3 className="text-xs font-bold uppercase text-slate-500">Specs</h3>
                                 <div className="bg-slate-800 p-3 rounded text-xs space-y-2 text-slate-300">
                                    <p><strong className="text-slate-400">Wiring:</strong> {data.electrical_plumbing_safety.electrical?.wiring_length || 'N/A'}</p>
                                    <p><strong className="text-slate-400">Load:</strong> {data.electrical_plumbing_safety.electrical?.load_distribution || 'N/A'}</p>
                                    <p><strong className="text-slate-400">Pipes:</strong> {data.electrical_plumbing_safety.plumbing?.pipe_sizes || 'N/A'}</p>
                                 </div>
                            </div>
                        </div>
                    ) : (
                        <div className="text-slate-500 text-center p-4">Safety analysis unavailable.</div>
                    )
                )}
            </div>
        </div>
    );
};

// --- Main App Component ---

const App: React.FC = () => {
  const [step, setStep] = useState<AppStep>('LANDING');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [analysisData, setAnalysisData] = useState<BlueprintAnalysis | null>(null);
  const [highlightedRoomId, setHighlightedRoomId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  // Resizable logic for Report Panel
  const [reportWidth, setReportWidth] = useState(350);
  const isResizingReport = useRef(false);

  // Resizable logic for 2D/3D Split (percentage 0 to 1)
  const [viewSplitRatio, setViewSplitRatio] = useState(0.5); 
  const isResizingView = useRef(false);
  const viewContainerRef = useRef<HTMLDivElement>(null);

  // -- Event Handlers for Resizing Report --
  const startResizingReport = () => { isResizingReport.current = true; };
  const stopResizing = () => { 
      isResizingReport.current = false; 
      isResizingView.current = false;
      document.body.style.cursor = 'default';
  };

  // -- Event Handlers for Resizing View Split --
  const startResizingView = () => { isResizingView.current = true; };

  const handleMouseMove = React.useCallback((e: MouseEvent) => {
    // 1. Report Panel Resize
    if (isResizingReport.current) {
        document.body.style.cursor = 'col-resize';
        const newWidth = Math.max(250, Math.min(500, e.clientX));
        setReportWidth(newWidth);
    }
    
    // 2. View Split Resize
    if (isResizingView.current && viewContainerRef.current) {
        document.body.style.cursor = 'col-resize';
        const rect = viewContainerRef.current.getBoundingClientRect();
        const relativeX = e.clientX - rect.left;
        const newRatio = Math.max(0.2, Math.min(0.8, relativeX / rect.width));
        setViewSplitRatio(newRatio);
    }
  }, []);

  useEffect(() => {
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", stopResizing);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", stopResizing);
    };
  }, [handleMouseMove]);


  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      setStep('PROCESSING');
      setErrorMsg(null);

      try {
        let base64 = '';

        if (file.type === 'application/pdf') {
             // Handle PDF
             try {
                 base64 = await convertPdfToImage(file);
             } catch (pdfErr) {
                 console.error(pdfErr);
                 throw new Error("Failed to convert PDF. Ensure it is a valid document.");
             }
        } else {
             // Handle Image
             base64 = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result as string);
                reader.onerror = reject;
                reader.readAsDataURL(file);
             });
        }
        
        setImageUrl(base64); 

        try {
            const data = await analyzeBlueprint(base64);
            setAnalysisData(data);
            setStep('DASHBOARD');
        } catch (err) {
            console.error(err);
            setErrorMsg("Failed to analyze blueprint. Please try a clearer file.");
            setStep('UPLOAD');
        }
      } catch (err: any) {
        console.error(err);
        setErrorMsg(err.message || "Error reading file.");
        setStep('UPLOAD');
      }
    }
  };
  
  const handleSampleLoad = () => {
      setStep('PROCESSING');
      setErrorMsg(null);
      // Simulate loading delay for better UX
      setTimeout(() => {
          setImageUrl(null);
          setAnalysisData(SAMPLE_DATA);
          setStep('DASHBOARD');
      }, 1000);
  };

  if (step === 'LANDING') {
    return <LandingPage onStart={() => setStep('UPLOAD')} />;
  }

  if (step === 'UPLOAD') {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-white relative">
        {/* Home Button added to Upload Screen */}
        <button 
            onClick={() => setStep('LANDING')}
            className="absolute top-6 left-6 p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg flex items-center gap-2 transition-colors border border-slate-700"
        >
            <ArrowLeft size={20} />
            <span className="text-sm font-medium">Back to Home</span>
        </button>

        <div className="max-w-md w-full text-center space-y-6">
            <h2 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-blue-500">Upload Blueprint</h2>
            <p className="text-slate-400">Upload a PNG, JPG, WEBP, or PDF of your floor plan.</p>
            
            <div className="flex flex-col gap-4">
                <label className="flex flex-col items-center justify-center w-full h-48 border-2 border-slate-700 border-dashed rounded-2xl cursor-pointer bg-slate-900/50 hover:bg-slate-800/50 hover:border-cyan-500 transition-all group">
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        <Upload className="w-12 h-12 mb-4 text-slate-500 group-hover:text-cyan-400 transition-colors" />
                        <p className="mb-2 text-sm text-slate-400"><span className="font-semibold text-white">Click to upload</span> or drag and drop</p>
                        <p className="text-xs text-slate-500">Images or PDF up to 10MB</p>
                    </div>
                    <input type="file" className="hidden" accept="image/*,application/pdf" onChange={handleFileUpload} />
                </label>
                
                <div className="flex items-center justify-center gap-2 text-slate-600 text-xs uppercase font-bold tracking-widest">
                    <div className="h-px bg-slate-800 flex-1"></div>
                    OR
                    <div className="h-px bg-slate-800 flex-1"></div>
                </div>

                <button 
                    onClick={handleSampleLoad}
                    className="w-full py-3 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-xl flex items-center justify-center gap-2 text-sm font-medium transition-all hover:text-cyan-400 group"
                >
                    <Box size={16} className="text-cyan-500 group-hover:scale-110 transition-transform" />
                    Try with Sample Blueprint
                </button>
            </div>

            {errorMsg && (
                <div className="p-4 bg-red-950/50 border border-red-500/30 rounded text-red-200 text-sm flex items-center gap-2">
                    <AlertTriangle size={16} /> {errorMsg}
                </div>
            )}
        </div>
      </div>
    );
  }

  if (step === 'PROCESSING') {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white space-y-6">
         <Loader2 className="w-16 h-16 text-cyan-500 animate-spin" />
         <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold">Analyzing Geometry...</h2>
            <p className="text-slate-400">Processing file, identifying walls, and calculating costs.</p>
         </div>
      </div>
    );
  }

  // --- DASHBOARD LAYOUT ---
  return (
    <div className="h-screen w-screen flex bg-slate-950 text-white overflow-hidden">
      
      {/* 1. REPORT PANEL */}
      <div style={{ width: reportWidth }} className="flex-shrink-0 h-full relative z-20">
        <AnalysisPanel 
            data={analysisData!} 
            highlightedRoomId={highlightedRoomId}
            onHome={() => {
                setAnalysisData(null);
                setHighlightedRoomId(null);
                setImageUrl(null);
                setStep('LANDING');
            }}
            onUpload={() => {
                setAnalysisData(null);
                setHighlightedRoomId(null);
                setImageUrl(null);
                setStep('UPLOAD');
            }}
        />
        {/* Resize Handle 1 (Report vs Views) */}
        <div
            className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-cyan-500 transition-colors z-50 flex flex-col justify-center items-center group"
            onMouseDown={startResizingReport}
        >
            <div className="h-8 w-1 bg-slate-700 group-hover:bg-cyan-400 rounded-full transition-colors"></div>
        </div>
      </div>

      {/* 2. VIEWS CONTAINER */}
      <div ref={viewContainerRef} className="flex-1 h-full flex relative z-10 overflow-hidden">
        
        {/* 2D VIEW */}
        <div style={{ width: `${viewSplitRatio * 100}%` }} className="h-full relative flex-shrink-0">
             <Viewer2D 
                data={analysisData!} 
                imageUrl={imageUrl}
                highlightedRoomId={highlightedRoomId}
                setHighlightedRoomId={setHighlightedRoomId}
             />
             
             {/* Resize Handle 2 (2D vs 3D) */}
             <div
                className="absolute top-0 right-0 w-1 h-full cursor-col-resize bg-slate-800 hover:bg-cyan-500 transition-colors z-50 flex flex-col justify-center items-center group border-l border-slate-700 translate-x-[2px]"
                onMouseDown={startResizingView}
            >
                <div className="h-8 w-6 bg-slate-800 border border-slate-600 rounded flex items-center justify-center shadow-lg group-hover:border-cyan-400">
                    <GripVertical size={12} className="text-slate-400 group-hover:text-cyan-400" />
                </div>
            </div>
        </div>

        {/* 3D VIEW */}
        <div className="flex-1 h-full relative min-w-0">
            <Viewer3D 
                data={analysisData!} 
                highlightedRoomId={highlightedRoomId} 
                setHighlightedRoomId={setHighlightedRoomId}
            />
        </div>

      </div>
    </div>
  );
};

export default App;