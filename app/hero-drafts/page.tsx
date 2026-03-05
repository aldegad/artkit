"use client";

import React from "react";
import Link from "next/link";

const BackIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
);

// ============================================================================
// DRAFT 1: THE PIXEL POLISHER
// Focus: Sprite/Pixel Art Editor feature. 
// AI lays down a messy, noisy pixel sprite. The human stylus meticulously 
// erases artifacts and adds precise highlights to create a perfect game asset.
// ============================================================================
const Draft1PixelPolisher = () => {
    return (
        <div className="relative w-full aspect-[21/9] bg-[#0A0A0A] rounded-[2rem] border border-[#222] overflow-hidden flex items-center justify-center">
            <svg viewBox="0 0 1200 500" className="w-full h-full" preserveAspectRatio="xMidYMid slice">
                <defs>
                    <pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse">
                        <rect width="30" height="30" fill="none" stroke="#222" strokeWidth="1" />
                    </pattern>
                    <linearGradient id="stylusGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#fff" />
                        <stop offset="100%" stopColor="#aaa" />
                    </linearGradient>
                    <filter id="glowD1" x="-20%" y="-20%" width="140%" height="140%">
                        <feGaussianBlur stdDeviation="4" result="blur" />
                        <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>
                </defs>

                <style>
                    {`
            /* AI Generator entering and leaving */
            @keyframes aiBotPhaseD1 {
              0% { transform: translate(-300px, -100px); opacity: 0; }
              10% { transform: translate(350px, 150px); opacity: 1; }
              30% { transform: translate(500px, 200px); opacity: 1; }
              40% { transform: translate(1300px, 100px); opacity: 0; }
              100% { transform: translate(1300px, 100px); opacity: 0; }
            }
            .d1-aibot { animation: aiBotPhaseD1 10s cubic-bezier(0.4, 0, 0.2, 1) infinite; }

            /* AI rough pixels pop in while AI is present */
            @keyframes roughPixelsIn {
              0%, 15% { opacity: 0; }
              20%, 90% { opacity: 1; }
              100% { opacity: 0; }
            }
            .d1-rough { animation: roughPixelsIn 10s step-end infinite; }

            /* AI mistake pixels that get erased */
            @keyframes errorPixels {
              0%, 15% { opacity: 0; transform: scale(0); }
              20%, 55% { opacity: 1; transform: scale(1); }
              60%, 100% { opacity: 0; transform: scale(0); }
            }
            .d1-error1 { animation: errorPixels 10s step-end infinite; }
            .d1-error2 { animation: errorPixels 10s step-end infinite; animation-delay: 0.2s; }

            /* Human Stylus entering and refining */
            @keyframes stylusPhase {
              0%, 45% { transform: translate(1300px, -200px); opacity: 0; }
              50% { transform: translate(400px, 120px); opacity: 1; } /* moves to first error */
              55% { transform: translate(400px, 120px) scale(0.95); opacity: 1; } /* tap */
              60% { transform: translate(620px, 320px); opacity: 1; } /* moves to second error */
              65% { transform: translate(620px, 320px) scale(0.95); opacity: 1; } /* tap */
              70% { transform: translate(480px, 250px); opacity: 1; } /* moves to add highlight */
              75% { transform: translate(510px, 220px); opacity: 1; } /* slide stroke highlight */
              85% { transform: translate(1300px, -200px); opacity: 0; }
              100% { transform: translate(1300px, -200px); opacity: 0; }
            }
            .d1-stylus { animation: stylusPhase 10s ease-in-out infinite; transform-origin: bottom left; }

            /* Final polished pixels replacing rough ones */
            @keyframes polishedPixels {
              0%, 75% { opacity: 0; }
              80%, 90% { opacity: 1; }
              100% { opacity: 0; }
            }
            .d1-polished { animation: polishedPixels 10s step-end infinite; }
            
            @keyframes highlightPixels {
               0%, 72% { opacity: 0; }
               75%, 90% { opacity: 1; }
               100% { opacity: 0; }
            }
            .d1-highlight { animation: highlightPixels 10s step-end infinite; }
          `}
                </style>

                {/* Background Grid */}
                <rect width="1200" height="500" fill="url(#grid)" />
                <circle cx="600" cy="250" r="300" fill="#3B82F6" opacity="0.05" filter="url(#glowD1)" />

                <g transform="translate(420, 100) scale(1.5)">
                    {/* --- LAYER 1: The Rough AI Base (Visible early) --- */}
                    <g className="d1-rough" fill="#555" stroke="#444" strokeWidth="2">
                        {/* Messy Sword Shape */}
                        <path d="M 60,180 L 60,150 L 90,120 L 150,60 L 180,30 L 210,60 L 150,120 L 120,150 L 120,180 Z" />
                        {/* Hilt */}
                        <path d="M 30,210 L 90,150 L 120,180 L 60,240 Z" fill="#432" />
                    </g>

                    {/* --- LAYER 2: The Mistakes (AI Hallucinations to be erased) --- */}
                    {/* Extraneous noise pixels floating around */}
                    <rect x="0" y="30" width="30" height="30" fill="#EF4444" className="d1-error1" />
                    <rect x="180" y="150" width="30" height="30" fill="#F59E0B" className="d1-error2" />
                    <rect x="30" y="90" width="30" height="30" fill="#8B5CF6" className="d1-error1" />

                    {/* --- LAYER 3: The Polished Human Result (Visible later) --- */}
                    <g className="d1-polished">
                        {/* Perfected Sword Base with clean colors */}
                        <path d="M 60,180 L 60,150 L 90,120 L 150,60 L 180,30 L 210,60 L 150,120 L 120,150 L 120,180 Z" fill="#06B6D4" stroke="#0891B2" strokeWidth="2" />
                        {/* Beautiful Hilt */}
                        <path d="M 30,210 L 90,150 L 120,180 L 60,240 Z" fill="#F59E0B" stroke="#D97706" strokeWidth="2" />
                        <rect x="60" y="180" width="30" height="30" fill="#EF4444" /> {/* Ruby gem in hilt */}

                        {/* Outer Glow / Stroke on the polished version */}
                        <path d="M 60,180 L 60,150 L 90,120 L 150,60 L 180,30 L 210,60 L 150,120 L 120,150 L 120,180 Z" fill="none" stroke="#fff" strokeWidth="4" filter="url(#glowD1)" opacity="0.3" />
                    </g>

                    {/* --- LAYER 4: The Added Human Highlights --- */}
                    <g className="d1-highlight">
                        <path d="M 90,120 L 150,60 L 180,30 L 180,45 L 120,105 Z" fill="#fff" opacity="0.8" />
                        <path d="M 150,120 L 180,90" stroke="#fff" strokeWidth="4" opacity="0.5" />
                    </g>
                </g>

                {/* --- ACTOR: The AI Bot (Generates the rough layout) --- */}
                <g className="d1-aibot">
                    {/* Bot Body */}
                    <rect x="-30" y="-30" width="60" height="60" rx="16" fill="#1E293B" stroke="#3B82F6" strokeWidth="3" />
                    <rect x="-15" y="-10" width="30" height="15" rx="5" fill="#0F172A" />
                    <circle cx="-5" cy="-2" r="3" fill="#3B82F6" filter="url(#glowD1)" />
                    <circle cx="5" cy="-2" r="3" fill="#3B82F6" filter="url(#glowD1)" />
                    {/* Generative Beam pointing down to canvas */}
                    <polygon points="0,30 -60,150 60,150" fill="#3B82F6" opacity="0.2" filter="url(#glowD1)" />
                    <path d="M 0,30 L -30,100 M 0,30 L 30,120" stroke="#3B82F6" strokeWidth="2" strokeDasharray="4 8" opacity="0.5" />
                </g>

                {/* --- ACTOR: The Human Stylus (Refines and corrects) --- */}
                {/* The origin of this group is exactly at the tip of the stylus so its coordinates perfectly align with the pixels it touches */}
                <g className="d1-stylus">
                    <g transform="rotate(-35) translate(0, -180)">
                        {/* Stylus Body */}
                        <rect x="-10" y="0" width="20" height="150" rx="10" fill="url(#stylusGrad)" stroke="#333" strokeWidth="2" />
                        {/* Grip */}
                        <rect x="-10" y="100" width="20" height="30" fill="#333" />
                        {/* Tip */}
                        <path d="M -8,150 L 0,180 L 8,150 Z" fill="#ddd" stroke="#333" strokeWidth="2" />
                        <circle cx="0" cy="180" r="3" fill="#06B6D4" filter="url(#glowD1)" />
                    </g>
                </g>

                {/* UI Overlay Indicators */}
                <text x="50" y="60" fill="#555" fontSize="24" fontFamily="sans-serif" fontWeight="bold" letterSpacing="2">ARTKIT // PIXEL_STUDIO</text>

                {/* Dynamic status text */}
                <style>
                    {`
            @keyframes statusText {
               0%, 15% { opacity: 0; }
               16% { opacity: 1; }
               40% { opacity: 0; }
               100% { opacity: 0; }
            }
            @keyframes statusText2 {
               0%, 45% { opacity: 0; }
               46% { opacity: 1; }
               90% { opacity: 0; }
               100% { opacity: 0; }
            }
            .st1 { animation: statusText 10s infinite; }
            .st2 { animation: statusText2 10s infinite; }
          `}
                </style>
                <g transform="translate(50, 440)">
                    <rect width="20" height="20" fill="#3B82F6" className="st1" />
                    <text x="35" y="15" fill="#3B82F6" className="st1" fontSize="16" fontFamily="monospace">AI_GENERATING_ROUGH_SPRITE...</text>

                    <rect width="20" height="20" fill="#06B6D4" className="st2" />
                    <text x="35" y="15" fill="#06B6D4" className="st2" fontSize="16" fontFamily="monospace">USER_REFINING_DETAILS_AND_HUES...</text>
                </g>
            </svg>
        </div>
    );
};


// ============================================================================
// DRAFT 2: THE HEALING LENS
// Focus: Image/Asset post-processing.
// A heavily distorted AI-generated artifact is passed over by a powerful
// "Healing Lens" controlled by the user, instantly purifying and perfecting the art.
// ============================================================================
const Draft2HealingLens = () => {
    return (
        <div className="relative w-full aspect-[21/9] bg-[#E2E8F0] dark:bg-[#0F172A] rounded-[2rem] border border-border-default overflow-hidden flex items-center justify-center">
            <svg viewBox="0 0 1200 500" className="w-full h-full" preserveAspectRatio="xMidYMid slice">
                <defs>
                    {/* Gradients for the artwork */}
                    <linearGradient id="artBg" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#818CF8" />
                        <stop offset="100%" stopColor="#C084FC" />
                    </linearGradient>
                    <linearGradient id="artBgPerfect" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#34D399" />
                        <stop offset="100%" stopColor="#3B82F6" />
                    </linearGradient>
                    <radialGradient id="lensGlass" cx="50%" cy="50%" r="50%">
                        <stop offset="70%" stopColor="rgba(255,255,255,0)" />
                        <stop offset="100%" stopColor="rgba(255,255,255,0.4)" />
                    </radialGradient>
                    <filter id="lensReflect">
                        <feDropShadow dx="0" dy="15" stdDeviation="15" floodOpacity="0.3" />
                    </filter>

                    {/* The Mask representing the Lens viewing area */}
                    <clipPath id="lensReveal">
                        {/* This circle follows the lens animation */}
                        <circle cx="200" cy="250" r="140" className="d2-lens-anim" />
                    </clipPath>
                </defs>

                <style>
                    {`
            @keyframes sweepLens {
               0%, 15% { transform: translate(0px, 0px); }
               45%, 55% { transform: translate(800px, 0px); }
               85%, 100% { transform: translate(0px, 0px); }
            }
            .d2-lens-anim { animation: sweepLens 8s ease-in-out infinite; }

            /* AI glitches trembling slightly */
            @keyframes glitchTweak {
               0%, 100% { transform: translate(0,0) scale(1); }
               25% { transform: translate(2px, -2px) scale(1.02); }
               75% { transform: translate(-2px, 2px) scale(0.98); }
            }
            .d2-glitch-path { animation: glitchTweak 0.2s linear infinite; }
          `}
                </style>

                {/* --- SCENE: The Base AI Artwork (Flawed, noisy, distorted) --- */}
                <g transform="translate(300, 50)">
                    {/* Canvas bounds */}
                    <rect width="600" height="400" rx="20" fill="url(#artBg)" />

                    {/* Distorted/Messy Geometry characterizing "Bad AI Generation" */}
                    <g className="d2-glitch-path" fill="none" stroke="#fff" strokeWidth="8" opacity="0.6">
                        <path d="M 100 200 C 150 150, 250 250, 300 200 C 350 150, 450 300, 500 200" strokeDasharray="15 10" />
                        <circle cx="200" cy="150" r="40" strokeWidth="4" />
                        <circle cx="210" cy="140" r="20" strokeWidth="2" fill="#fff" opacity="0.5" />
                        <circle cx="400" cy="250" r="50" strokeWidth="6" />
                        {/* Weird AI artifacts (extra fingers/eyes analogy) */}
                        <path d="M 380 230 L 390 270 L 420 220" strokeWidth="3" />
                        <circle cx="430" cy="280" r="10" />
                        <rect x="250" y="300" width="80" height="40" strokeWidth="4" transform="skewX(20)" />
                    </g>

                    {/* Random noise specks */}
                    <circle cx="150" cy="300" r="3" fill="#fff" className="d2-glitch-path" />
                    <circle cx="480" cy="100" r="4" fill="#fff" className="d2-glitch-path" />
                    <circle cx="220" cy="320" r="5" fill="#fff" className="d2-glitch-path" />
                    <circle cx="350" cy="120" r="2" fill="#fff" className="d2-glitch-path" />
                </g>

                {/* --- SCENE: The Perfected Artwork (Revealed ONLY inside the Lens mask) --- */}
                <g transform="translate(300, 50)" clipPath="url(#lensReveal)">
                    <rect width="600" height="400" rx="20" fill="url(#artBgPerfect)" />

                    {/* Perfectly smooth, mathematical geometry */}
                    <g fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round">
                        {/* Smooth Sine wave */}
                        <path d="M 100 200 C 200 50, 400 350, 500 200" />
                        {/* Perfect concentric circles */}
                        <circle cx="200" cy="150" r="40" />
                        <circle cx="200" cy="150" r="20" />

                        <circle cx="400" cy="250" r="50" />
                        <circle cx="400" cy="250" r="30" />
                        <circle cx="400" cy="250" r="10" />

                        <rect x="260" y="280" width="80" height="40" rx="8" />
                    </g>

                    {/* Subtle clean grid in background instead of noise */}
                    <path d="M 100 50 L 100 350 M 500 50 L 500 350 M 50 100 L 550 100 M 50 300 L 550 300" stroke="#fff" strokeWidth="1" opacity="0.2" />
                </g>

                {/* --- ACTOR: The Human's Lens/Tool Structure --- */}
                <g transform="translate(300, 50)">
                    {/* The physical magnifying glass moving across */}
                    <g className="d2-lens-anim">
                        {/* Glass specular & rim */}
                        <circle cx="200" cy="250" r="140" fill="url(#lensGlass)" stroke="#E2E8F0" strokeWidth="12" filter="url(#lensReflect)" />
                        {/* High tech aiming reticles on the lens */}
                        <path d="M 200 110 L 200 130 M 200 370 L 200 390 M 60 250 L 80 250 M 320 250 L 340 250" stroke="#E2E8F0" strokeWidth="4" strokeLinecap="round" />
                        <circle cx="200" cy="250" r="4" fill="#34D399" />

                        {/* The Stylus / Handle controlled by Human */}
                        <g transform="translate(100, 350) rotate(45)">
                            <rect x="-10" y="0" width="20" height="200" rx="10" fill="#334155" stroke="#1E293B" strokeWidth="4" />
                            <rect x="-6" y="20" width="12" height="40" rx="6" fill="#34D399" />
                            <rect x="-6" y="80" width="12" height="60" rx="6" fill="#1E293B" />
                        </g>
                    </g>
                </g>

                {/* Helper UI Tooltips */}
                <rect x="80" y="220" width="160" height="40" rx="20" fill="#EF4444" opacity="0.1" />
                <text x="160" y="245" fill="#EF4444" fontSize="14" fontWeight="bold" textAnchor="middle">AI ARTIFACTS</text>

                <rect x="960" y="220" width="160" height="40" rx="20" fill="#10B981" opacity="0.1" />
                <text x="1040" y="245" fill="#10B981" fontSize="14" fontWeight="bold" textAnchor="middle">HUMAN POLISH</text>

            </svg>
        </div>
    );
};


// ============================================================================
// DRAFT 3: THE ASSET FOUNDRY
// Focus: The entire Artkit suite's workflow (Intake -> Process -> Output).
// Isometric 3D aesthetic. AI serves the raw block on a conveyor belt. 
// A highly advanced robotic workstation (steered by the user's intent) 
// lasers and sculpts the block into a brilliant, finalized game asset.
// ============================================================================
const Draft3AssetFoundry = () => {
    return (
        <div className="relative w-full aspect-[21/9] bg-[#0f111a] rounded-[2rem] border border-[#2a2e46] overflow-hidden flex items-center justify-center">
            <svg viewBox="0 0 1200 500" className="w-full h-full" preserveAspectRatio="xMidYMid slice">
                <defs>
                    <linearGradient id="d3-gem" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#F43F5E" />
                        <stop offset="50%" stopColor="#8B5CF6" />
                        <stop offset="100%" stopColor="#3B82F6" />
                    </linearGradient>
                    <filter id="d3-laser-glow">
                        <feGaussianBlur stdDeviation="3" result="blur" />
                        <feComposite in="SourceGraphic" in2="blur" operator="over" />
                        <feDropShadow dx="0" dy="0" stdDeviation="10" floodColor="#F43F5E" floodOpacity="0.8" />
                    </filter>
                </defs>

                <style>
                    {`
            /* Conveyor belt dashed lines moving */
            @keyframes beltMove {
              0% { stroke-dashoffset: 40; }
              100% { stroke-dashoffset: 0; }
            }
            .d3-belt { animation: beltMove 1s linear infinite; }

            /* Workflow Master Timeline (8s loop) */
            
            /* AI Spawner drops raw block */
            @keyframes aiSpawn {
               0%, 80% { transform: translateY(-30px); opacity: 0; }
               5%, 15% { transform: translateY(0); opacity: 1; }
               25%, 100% { transform: translateY(0); opacity: 0; }
            }
            .d3-spawn-halo { animation: aiSpawn 8s ease-out infinite; }
            
            /* The Object traversing the conveyor */
            @keyframes traverseBelt {
               0% { transform: translate(-200px, -100px); opacity: 0; }
               5% { transform: translate(-200px, -100px); opacity: 1; }
               25% { transform: translate(0px, 0px); opacity: 1; } /* reaches center */
               60% { transform: translate(0px, 0px); opacity: 1; } /* stays in center for carving */
               80% { transform: translate(300px, 150px); opacity: 1; } /* moves to output */
               85%, 100% { transform: translate(300px, 150px); opacity: 0; } /* vanishes */
            }
            .d3-object-container { animation: traverseBelt 8s cubic-bezier(0.4, 0, 0.2, 1) infinite; }

            /* Object states */
            @keyframes hideRaw {
               0%, 40% { opacity: 1; }
               45%, 100% { opacity: 0; }
            }
            .d3-raw-obj { animation: hideRaw 8s step-end infinite; }
            
            @keyframes showPolished {
               0%, 40% { opacity: 0; }
               45%, 100% { opacity: 1; }
            }
            .d3-polish-obj { animation: showPolished 8s step-end infinite; }

            /* Workstation Laser Arms */
            @keyframes laserArmDrop {
               0%, 30% { transform: translate(0, -100px); opacity: 0; }
               35%, 55% { transform: translate(0, 0); opacity: 1; } /* laser active */
               60%, 100% { transform: translate(0, -100px); opacity: 0; }
            }
            .d3-laser-arm { animation: laserArmDrop 8s ease-in-out infinite; }
            
            @keyframes laserBeam {
               0%, 35% { opacity: 0; stroke-width: 0; }
               40%, 50% { opacity: 1; stroke-width: 6; }
               55%, 100% { opacity: 0; stroke-width: 0; }
            }
            .d3-beam { animation: laserBeam 8s infinite; }
            
            /* UI Sparkles upon polish */
            @keyframes sparkBurst {
               0%, 45% { opacity: 0; transform: scale(0.5); }
               48% { opacity: 1; transform: scale(1.5); }
               55%, 100% { opacity: 0; transform: scale(2); }
            }
            .d3-burst { animation: sparkBurst 8s ease-out infinite; transform-origin: center; }
          `}
                </style>

                {/* --- SCENE GEOMETRY (Isometric projection faked via math) --- */}
                <g transform="translate(600, 100)">

                    {/* Main Conveyor Belt structure */}
                    <g fill="#1a1d2c" stroke="#374151" strokeWidth="2">
                        {/* Left Belt (Intake) */}
                        <path d="M -400 200 L -100 350 L -100 380 L -400 230 Z" />
                        <path d="M -400 200 L -100 350" strokeDasharray="10 10" stroke="#4B5563" className="d3-belt" />

                        {/* Right Belt (Output) */}
                        <path d="M 100 350 L 400 500 L 400 530 L 100 380 Z" />
                        <path d="M 100 350 L 400 500" strokeDasharray="10 10" stroke="#4B5563" className="d3-belt" />

                        {/* Center Workstation Base */}
                        <polygon points="0,250 150,325 0,400 -150,325" fill="#202436" stroke="#4B5563" strokeWidth="4" />
                        <polygon points="-150,325 0,400 0,450 -150,375" fill="#141724" />
                        <polygon points="0,400 150,325 150,375 0,450" fill="#1a1d2c" />
                    </g>

                    {/* AI Spawner (Left top) */}
                    <g transform="translate(-300, 100)">
                        {/* Hovering server box */}
                        <polygon points="0,0 80,40 0,80 -80,40" fill="#3B82F6" opacity="0.1" />
                        <path d="M 0,-40 L 60,-10 L 0,20 L -60,-10 Z" fill="#1E293B" stroke="#3B82F6" strokeWidth="3" />
                        <path d="M -60,-10 L 0,20 L 0,60 L -60,30 Z" fill="#0F172A" stroke="#3B82F6" strokeWidth="3" />
                        <path d="M 0,20 L 60,-10 L 60,30 L 0,60 Z" fill="#1e293b" stroke="#3B82F6" strokeWidth="3" />
                        {/* Spawn light indicator */}
                        <circle cx="0" cy="20" r="10" fill="#3B82F6" opacity="0.8" />
                        {/* Text Label */}
                        <text x="-80" y="-50" fill="#3B82F6" fontSize="12" fontWeight="bold">AI_INTAKE</text>

                        {/* Spawn drop effect */}
                        <polygon points="0,20 40,40 0,60 -40,40" fill="#3B82F6" opacity="0.6" className="d3-spawn-halo" />
                    </g>

                    {/* THE TRAVELING OBJECT (Container follows conveyor path) */}
                    <g className="d3-object-container">
                        <g transform="translate(0, 200)">

                            {/* State 1: Raw AI Output (Grey, jagged chunk) */}
                            <g className="d3-raw-obj">
                                <polygon points="0,-40 30,-20 20,20 -20,30 -40,0" fill="#4B5563" stroke="#9CA3AF" strokeWidth="2" />
                                <polygon points="-40,0 0,-10 30,-20 0,-40" fill="#6B7280" />
                                <polygon points="0,-10 20,20 -20,30" fill="#374151" />
                            </g>

                            {/* State 2: Polished Output (Glowing multifaceted gem) */}
                            <g className="d3-polish-obj">
                                <polygon points="0,-60 40,-20 0,40 -40,-20" fill="url(#d3-gem)" />
                                <polygon points="-40,-20 0,-60 0,0" fill="#fff" opacity="0.4" />
                                <polygon points="0,-60 40,-20 0,0" fill="#000" opacity="0.2" />
                                <polygon points="-40,-20 0,40 0,0" fill="#fff" opacity="0.1" />
                                <path d="M -40,-20 L 0,-60 L 40,-20 L 0,40 Z" fill="none" stroke="#fff" strokeWidth="2" />

                                {/* Sparkles around finalized asset */}
                                <g className="d3-burst">
                                    <circle cx="-30" cy="-40" r="3" fill="#fff" />
                                    <circle cx="30" cy="-30" r="4" fill="#fff" />
                                    <circle cx="0" cy="50" r="2" fill="#fff" />
                                </g>
                            </g>

                        </g>
                    </g>

                    {/* HUMAN STEERED WORKSTATION (Center hovering rig) */}
                    <g transform="translate(0, -20)">
                        {/* Rig Architecture */}
                        <path d="M 0,0 L 200,100 L 0,200 L -200,100 Z" fill="none" stroke="#4B5563" strokeWidth="2" strokeDasharray="4 8" />
                        <polygon points="0,-20 40,0 0,20 -40,0" fill="#10B981" opacity="0.2" />
                        <text x="0" y="-40" fill="#10B981" fontSize="12" fontWeight="bold" textAnchor="middle">HUMAN_POST_PROCESS_NODE</text>

                        {/* The descending laser arm that carves the asset */}
                        <g className="d3-laser-arm">
                            {/* Arm structure */}
                            <path d="M 0,20 L 0,120" stroke="#9CA3AF" strokeWidth="6" />
                            <rect x="-15" y="100" width="30" height="20" rx="4" fill="#374151" stroke="#9CA3AF" strokeWidth="2" />
                            <polygon points="-10,120 10,120 0,140" fill="#10B981" />

                            {/* Laser Beam carving the rock */}
                            <line x1="0" y1="140" x2="0" y2="200" stroke="#F43F5E" className="d3-beam" filter="url(#d3-laser-glow)" />
                        </g>
                    </g>

                </g>
            </svg>
        </div>
    );
};


export default function HeroDraftsPage() {
    return (
        <div className="min-h-screen bg-background text-foreground pb-32">
            <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border-subtle p-4">
                <div className="max-w-6xl mx-auto flex items-center justify-between">
                    <Link href="/" className="flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors">
                        <BackIcon />
                        <span className="font-medium text-sm">Back to Home</span>
                    </Link>
                    <div className="font-bold tracking-tight text-accent-primary hidden sm:block">Asset Workflow Concepts</div>
                    <div className="w-20" /> {/* Spacer */}
                </div>
            </header>

            <main className="max-w-6xl mx-auto px-6 mt-16 flex flex-col gap-24">

                {/* Intro */}
                <div className="text-center max-w-3xl mx-auto">
                    <h1 className="text-4xl md:text-5xl font-extrabold mb-6 tracking-tight">
                        AI + Human Workflow Visualized
                    </h1>
                    <p className="text-lg text-text-secondary leading-relaxed">
                        These concepts accurately represent Artkit as an <strong>Asset Post-Processing Suite</strong>.
                        They highlight how AI acts as an initiator (providing a raw foundation) while the human
                        user wields superior tools to edit, purify, and finalize the game asset or image.
                    </p>
                </div>

                {/* Draft 1 */}
                <section>
                    <div className="mb-6">
                        <h2 className="text-3xl font-bold mb-2 tracking-tight">1. The Pixel Polisher</h2>
                        <p className="text-text-secondary max-w-2xl">
                            Targeting the <strong>Sprite / Pixel Art Editor</strong> feature. An AI bot lays down a noisy, rough base for a sword. A premium digital stylus (the user) swiftly moves in, eradicating stray error pixels and confidently drawing precise highlights to create a perfect game asset.
                        </p>
                    </div>
                    <Draft1PixelPolisher />
                </section>

                {/* Draft 2 */}
                <section>
                    <div className="mb-6">
                        <h2 className="text-3xl font-bold mb-2 tracking-tight">2. The Healing Lens</h2>
                        <p className="text-text-secondary max-w-2xl">
                            Targeting the <strong>Image Editor / Artifact Cleanup</strong> feature. A base image contains obvious, distorted AI glitches. The user drags a magnificent "Healing Lens" across the canvas. Inside the lens, the art is instantly structurally repaired and perfected in real-time.
                        </p>
                    </div>
                    <Draft2HealingLens />
                </section>

                {/* Draft 3 */}
                <section>
                    <div className="mb-6">
                        <h2 className="text-3xl font-bold mb-2 tracking-tight">3. The Asset Foundry</h2>
                        <p className="text-text-secondary max-w-2xl">
                            Targeting the <strong>Overall Pipeline</strong>. An isometric, 3D-styled factory line. The AI acts as the intake, dropping raw blocks onto the belt. The central workstation (steered by human post-processing nodes) laser-carves the grey rock into a glowing, multifaceted ultimate asset.
                        </p>
                    </div>
                    <Draft3AssetFoundry />
                </section>

            </main>
        </div>
    );
}
