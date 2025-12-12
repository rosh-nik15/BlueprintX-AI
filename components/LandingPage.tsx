import React from 'react';
import { ArrowRight, Boxes, ShieldCheck, Zap } from 'lucide-react';

interface LandingPageProps {
  onStart: () => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ onStart }) => {
  return (
    <div className="min-h-screen bg-[#020617] text-white flex flex-col relative overflow-hidden">
      
      {/* Background Hero Image */}
      <div className="absolute inset-0 z-0 opacity-40">
        <div className="absolute inset-0 bg-gradient-to-t from-[#020617] via-[#020617]/80 to-transparent"></div>
      </div>

      <nav className="relative z-10 p-6 flex justify-between items-center">
        <div className="flex items-center gap-2 text-cyan-400">
            <Boxes className="w-8 h-8" />
            <span className="text-xl font-bold tracking-tighter">BlueprintX-AI</span>
        </div>
      </nav>

      <main className="relative z-10 flex-1 flex flex-col items-center justify-center text-center px-4">
        <div className="max-w-4xl space-y-8">
            <h1 className="text-5xl md:text-7xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600">
                2D Blueprints to <br/> Intelligent 3D Spaces
            </h1>
            <p className="text-lg md:text-xl text-slate-300 max-w-2xl mx-auto">
                Instantly convert images or PDFs into interactive 3D models. Get real-time cost estimation, renovation insights, and safety compliance checks powered by Gemini 3 Pro.
            </p>
            
            <div className="flex justify-center gap-4 pt-4">
                <button 
                    onClick={onStart}
                    className="group relative px-8 py-4 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold rounded-lg transition-all shadow-[0_0_20px_rgba(6,182,212,0.5)] hover:shadow-[0_0_40px_rgba(6,182,212,0.6)] flex items-center gap-2"
                >
                    Launch Planner
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </button>
            </div>
        </div>

        {/* Feature Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-20 max-w-5xl w-full">
            {[
                { icon: Boxes, title: "3D Reconstruction", desc: "Automated wall, door, and room detection from static images and PDFs." },
                { icon: ShieldCheck, title: "Safety Analysis", desc: "AI-driven electrical and plumbing safety audits." },
                { icon: Zap, title: "Cost & Material", desc: "Instant takeoff generation and labor cost estimation." }
            ].map((feature, idx) => (
                <div key={idx} className="glass-panel p-6 rounded-xl border border-slate-700/50 hover:border-cyan-500/50 transition-colors text-left">
                    <feature.icon className="w-8 h-8 text-cyan-400 mb-4" />
                    <h3 className="text-lg font-semibold text-white mb-2">{feature.title}</h3>
                    <p className="text-sm text-slate-400">{feature.desc}</p>
                </div>
            ))}
        </div>
      </main>

      <footer className="relative z-10 py-6 text-center text-slate-600 text-sm">
        Powered by Google Gemini 3 Pro
      </footer>
    </div>
  );
};

export default LandingPage;