import React from 'react';

/**
 * PersonaAvatar renders an authentic, high-fidelity vector illustrated portrait
 * for each bot personality, inspired by master chess bot art.
 * Each character features distinct hair silhouettes, expressive eyes, layered shading,
 * and custom apparel.
 */
export function PersonaAvatar({ persona, size = 56, className = '' }) {
  if (!persona) return null;

  const id = persona.avatarId || persona.name?.toLowerCase() || '';

  // 1. Stockfish Max — Cybernetic Chess Knight Master
  if (id === 'stockfish' || persona.name === 'Stockfish' || persona.gender === 'Neutral') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 80 80"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`shrink-0 ${className}`}
      >
        <defs>
          <linearGradient id="sf_bg" x1="0" y1="0" x2="80" y2="80" gradientUnits="userSpaceOnUse">
            <stop stopColor="#1e222d" />
            <stop offset="1" stopColor="#0d0f15" />
          </linearGradient>
          <linearGradient id="sf_gold" x1="20" y1="20" x2="60" y2="60" gradientUnits="userSpaceOnUse">
            <stop stopColor="#fef08a" />
            <stop offset="0.5" stopColor="#f59e0b" />
            <stop offset="1" stopColor="#b45309" />
          </linearGradient>
          <linearGradient id="sf_metal" x1="30" y1="15" x2="60" y2="70" gradientUnits="userSpaceOnUse">
            <stop stopColor="#475569" />
            <stop offset="0.5" stopColor="#334155" />
            <stop offset="1" stopColor="#1e293b" />
          </linearGradient>
          <radialGradient id="sf_glow" cx="40" cy="40" r="30" gradientUnits="userSpaceOnUse">
            <stop stopColor="#f59e0b" stopOpacity="0.35" />
            <stop offset="1" stopColor="#f59e0b" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Outer Background */}
        <rect width="80" height="80" rx="14" fill="url(#sf_bg)" />
        <circle cx="40" cy="40" r="32" fill="url(#sf_glow)" />

        {/* Circuit Backdrop Grid */}
        <path d="M12 24h12l6 6v14l-6 6H12" stroke="#334155" strokeWidth="1" strokeOpacity="0.5" strokeDasharray="3 3" />
        <path d="M68 24H56l-6 6v14l6 6h12" stroke="#334155" strokeWidth="1" strokeOpacity="0.5" strokeDasharray="3 3" />

        {/* Knight Base & Pedestal */}
        <path d="M22 66h36l-3-8H25l-3 8z" fill="#0f172a" stroke="url(#sf_gold)" strokeWidth="1.2" />
        <rect x="26" y="60" width="28" height="3" rx="1" fill="#f59e0b" fillOpacity="0.8" />

        {/* Cyber Knight Head & Mane */}
        <path
          d="M32 18c6-4 16-2 20 4 3 5 4 12 4 17 0 6-3 10-6 13l2 8H28l-2-6 5-5-8-6c-2-2-3-5-3-9 0-7 6-12 12-13z"
          fill="url(#sf_metal)"
          stroke="#64748b"
          strokeWidth="1.5"
        />

        {/* Facet Shading on Knight Snout */}
        <path d="M22 36l10-4 12 6-8 12-14-14z" fill="#1e293b" fillOpacity="0.8" />
        <path d="M34 18l12 7-6 11-14-6 8-12z" fill="#475569" fillOpacity="0.5" />

        {/* Gold Armor Crest & Ears */}
        <path d="M38 14l8 6-3 6-8-6 3-6z" fill="url(#sf_gold)" />
        <path d="M48 24l8 6-4 5-8-5 4-6z" fill="url(#sf_gold)" />
        <path d="M52 36l7 5-4 5-7-5 4-5z" fill="url(#sf_gold)" />

        {/* Luminous Glowing Visor Eye */}
        <rect x="28" y="32" width="16" height="4" rx="2" fill="#fef08a" />
        <circle cx="36" cy="34" r="2" fill="#ffffff" />
        <line x1="24" y1="34" x2="48" y2="34" stroke="#fbbf24" strokeWidth="1" strokeOpacity="0.6" />

        {/* Telemetry Dots */}
        <circle cx="30" cy="50" r="1.5" fill="#38bdf8" />
        <circle cx="35" cy="50" r="1.5" fill="#38bdf8" />
        <circle cx="40" cy="50" r="1.5" fill="#38bdf8" />
      </svg>
    );
  }

  // 2. Allen — Level 1, Male, 250 ELO (Young cheerful boy with fluffy ginger curls and wide toothy grin)
  if (id === 'allen') {
    return (
      <svg width={size} height={size} viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" className={`shrink-0 ${className}`}>
        <defs>
          <linearGradient id="allen_bg" x1="0" y1="0" x2="80" y2="80" gradientUnits="userSpaceOnUse">
            <stop stopColor="#2b1a13" />
            <stop offset="1" stopColor="#180e0a" />
          </linearGradient>
          <linearGradient id="allen_hair" x1="20" y1="10" x2="60" y2="40" gradientUnits="userSpaceOnUse">
            <stop stopColor="#fb923c" />
            <stop offset="0.6" stopColor="#ea580c" />
            <stop offset="1" stopColor="#c2410c" />
          </linearGradient>
        </defs>

        <rect width="80" height="80" rx="14" fill="url(#allen_bg)" />

        {/* Orange T-Shirt & Collar */}
        <path d="M14 80c0-14 12-24 26-24s26 10 26 24H14z" fill="#f97316" />
        <path d="M30 56c4 4 16 4 20 0" stroke="#c2410c" strokeWidth="3" strokeLinecap="round" />

        {/* Neck */}
        <rect x="34" y="46" width="12" height="13" rx="3" fill="#fdba74" />
        <path d="M34 50c3 3 9 3 12 0" fill="#f97316" fillOpacity="0.25" />

        {/* Cheerful Head Shape */}
        <ellipse cx="40" cy="35" rx="18" ry="19" fill="#fed7aa" />

        {/* Ears with Inner Shadow */}
        <circle cx="21" cy="36" r="4.5" fill="#fed7aa" />
        <circle cx="21" cy="36" r="2.5" fill="#fdba74" />
        <circle cx="59" cy="36" r="4.5" fill="#fed7aa" />
        <circle cx="59" cy="36" r="2.5" fill="#fdba74" />

        {/* Voluminous Curly Ginger Hair */}
        <path
          d="M21 28c-1-12 8-18 19-18 12 0 21 6 20 18 2 2 3 6 1 9l-4-4c-2 2-6 0-8 3-3-4-8-2-11 2-2-3-6-2-8 1l-5-4c-2 3-4 5-4-7z"
          fill="url(#allen_hair)"
        />
        {/* Fluffy Curls & Tufts */}
        <circle cx="27" cy="18" r="6.5" fill="url(#allen_hair)" />
        <circle cx="38" cy="14" r="8" fill="url(#allen_hair)" />
        <circle cx="49" cy="16" r="7" fill="url(#allen_hair)" />
        <circle cx="56" cy="23" r="5.5" fill="url(#allen_hair)" />
        <circle cx="23" cy="24" r="5" fill="url(#allen_hair)" />

        {/* Cheerful Arched Eyebrows */}
        <path d="M30 27c2-2 6-2 8 0" stroke="#9a3412" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M42 27c2-2 6-2 8 0" stroke="#9a3412" strokeWidth="2.2" strokeLinecap="round" />

        {/* Happy Twinkling Eyes */}
        <circle cx="34" cy="33" r="2.8" fill="#431407" />
        <circle cx="46" cy="33" r="2.8" fill="#431407" />
        <circle cx="33" cy="32" r="1.1" fill="#ffffff" />
        <circle cx="45" cy="32" r="1.1" fill="#ffffff" />

        {/* Rosy Blush Cheeks */}
        <circle cx="28" cy="38" r="3.5" fill="#f87171" fillOpacity="0.45" />
        <circle cx="52" cy="38" r="3.5" fill="#f87171" fillOpacity="0.45" />

        {/* Button Nose */}
        <path d="M39 36c1 1 2 1 3 0" stroke="#ea580c" strokeWidth="1.8" strokeLinecap="round" />

        {/* Wide Happy Smiling Open Mouth with Teeth */}
        <path d="M34 41c0 5 3 8 6 8s6-3 6-8H34z" fill="#991b1b" />
        <path d="M35 41h10c0 2-2 3-5 3s-5-1-5-3z" fill="#ffffff" />
        <ellipse cx="40" cy="46" rx="3" ry="1.8" fill="#ef4444" />
      </svg>
    );
  }

  // 3. Lavish — Level 2, Male, 500 ELO (Confident suave young man with styled dark pompadour)
  if (id === 'lavish') {
    return (
      <svg width={size} height={size} viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" className={`shrink-0 ${className}`}>
        <defs>
          <linearGradient id="lavish_bg" x1="0" y1="0" x2="80" y2="80" gradientUnits="userSpaceOnUse">
            <stop stopColor="#132337" />
            <stop offset="1" stopColor="#0a121c" />
          </linearGradient>
          <linearGradient id="lavish_hair" x1="20" y1="10" x2="60" y2="35" gradientUnits="userSpaceOnUse">
            <stop stopColor="#38302e" />
            <stop offset="0.6" stopColor="#211a18" />
            <stop offset="1" stopColor="#120e0d" />
          </linearGradient>
        </defs>

        <rect width="80" height="80" rx="14" fill="url(#lavish_bg)" />

        {/* Sky-Blue Collared Shirt */}
        <path d="M14 80c0-14 12-24 26-24s26 10 26 24H14z" fill="#38bdf8" />
        <path d="M33 56l7 8 7-8" stroke="#0284c7" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="40" cy="69" r="1.5" fill="#f0f9ff" />

        {/* Neck */}
        <rect x="34" y="45" width="12" height="14" rx="2" fill="#fed7aa" />
        <path d="M34 49c3 3 9 3 12 0" fill="#f97316" fillOpacity="0.2" />

        {/* Head */}
        <ellipse cx="40" cy="34" rx="17" ry="18" fill="#fed7aa" />

        {/* Ears */}
        <circle cx="22" cy="35" r="4.2" fill="#fed7aa" />
        <circle cx="58" cy="35" r="4.2" fill="#fed7aa" />

        {/* Styled Modern Dark Pompadour / Side-Part */}
        <path
          d="M21 28c1-12 8-17 19-17 12 0 19 6 19 16 0 3-1 6-3 8l-5-5c-5 1-10 0-14 4-4-3-8-2-11 1l-5-7z"
          fill="url(#lavish_hair)"
        />
        <circle cx="36" cy="14" r="7.5" fill="url(#lavish_hair)" />
        <circle cx="47" cy="16" r="6.5" fill="url(#lavish_hair)" />
        {/* Subtle Hair Highlight */}
        <path d="M32 16c4-3 10-3 14 0" stroke="#78716c" strokeWidth="1.5" strokeLinecap="round" />

        {/* Confident Eyebrows */}
        <path d="M30 26l7-1" stroke="#262626" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M43 25l7 1" stroke="#262626" strokeWidth="2.2" strokeLinecap="round" />

        {/* Charming Dark Eyes with Catchlights */}
        <ellipse cx="34" cy="32" rx="2.5" ry="2.7" fill="#1c1917" />
        <ellipse cx="46" cy="32" rx="2.5" ry="2.7" fill="#1c1917" />
        <circle cx="33.2" cy="31.2" r="1" fill="#ffffff" />
        <circle cx="45.2" cy="31.2" r="1" fill="#ffffff" />

        {/* Sculpted Nose */}
        <path d="M39 33v4l3 1" stroke="#ea580c" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />

        {/* Confident Smirk / Smile */}
        <path d="M35 43c2.5 2.5 7.5 2.5 10 0" stroke="#854d0e" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  // 4. Mufty — Level 3, Female, 800 ELO (Gentle, elegant girl with wavy auburn hair & yellow knit collar)
  if (id === 'mufty') {
    return (
      <svg width={size} height={size} viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" className={`shrink-0 ${className}`}>
        <defs>
          <linearGradient id="mufty_bg" x1="0" y1="0" x2="80" y2="80" gradientUnits="userSpaceOnUse">
            <stop stopColor="#2d201c" />
            <stop offset="1" stopColor="#170f0d" />
          </linearGradient>
          <linearGradient id="mufty_hair" x1="20" y1="10" x2="60" y2="60" gradientUnits="userSpaceOnUse">
            <stop stopColor="#c2410c" />
            <stop offset="0.5" stopColor="#9a3412" />
            <stop offset="1" stopColor="#7c2d12" />
          </linearGradient>
        </defs>

        <rect width="80" height="80" rx="14" fill="url(#mufty_bg)" />

        {/* Back Hair Falling Over Shoulders */}
        <path d="M19 32c0 14 3 26 7 30l8-8c-4-6-6-14-6-22h-9z" fill="url(#mufty_hair)" />
        <path d="M61 32c0 14-3 26-7 30l-8-8c4-6 6-14 6-22h9z" fill="url(#mufty_hair)" />

        {/* Warm Golden Knitted Turtleneck */}
        <path d="M14 80c0-14 12-24 26-24s26 10 26 24H14z" fill="#eab308" />
        <rect x="31" y="52" width="18" height="9" rx="3" fill="#ca8a04" />
        <line x1="34" y1="53" x2="34" y2="60" stroke="#a16207" strokeWidth="1.2" />
        <line x1="37" y1="53" x2="37" y2="60" stroke="#a16207" strokeWidth="1.2" />
        <line x1="40" y1="53" x2="40" y2="60" stroke="#a16207" strokeWidth="1.2" />
        <line x1="43" y1="53" x2="43" y2="60" stroke="#a16207" strokeWidth="1.2" />
        <line x1="46" y1="53" x2="46" y2="60" stroke="#a16207" strokeWidth="1.2" />

        {/* Neck */}
        <rect x="35" y="44" width="10" height="12" rx="2" fill="#ffedd5" />

        {/* Head */}
        <ellipse cx="40" cy="34" rx="16" ry="17" fill="#ffedd5" />

        {/* Ears */}
        <circle cx="23" cy="35" r="3.8" fill="#ffedd5" />
        <circle cx="57" cy="35" r="3.8" fill="#ffedd5" />

        {/* Wavy Auburn Hair Front and Bangs */}
        <path
          d="M21 30c0-12 8-18 19-18s19 6 19 18c0 3-1 6-3 8-3-6-7-8-12-8-6 0-10 4-13 8-6-1-10-3-10-8z"
          fill="url(#mufty_hair)"
        />
        <circle cx="31" cy="16" r="6" fill="url(#mufty_hair)" />
        <circle cx="48" cy="17" r="6.5" fill="url(#mufty_hair)" />
        {/* Soft Front Tendrils */}
        <path d="M24 30c2 7 1 14-1 18" stroke="#9a3412" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M56 30c-2 7-1 14 1 18" stroke="#9a3412" strokeWidth="2.5" strokeLinecap="round" />

        {/* Graceful Curved Eyebrows */}
        <path d="M30 26c2-1.8 6-1.8 8 0" stroke="#7c2d12" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M42 26c2-1.8 6-1.8 8 0" stroke="#7c2d12" strokeWidth="1.8" strokeLinecap="round" />

        {/* Warm Almond Eyes with Eyelashes */}
        <ellipse cx="34" cy="32" rx="2.5" ry="2.7" fill="#291206" />
        <ellipse cx="46" cy="32" rx="2.5" ry="2.7" fill="#291206" />
        <circle cx="33.3" cy="31.2" r="1" fill="#ffffff" />
        <circle cx="45.3" cy="31.2" r="1" fill="#ffffff" />
        <path d="M31 30l-1-1.5" stroke="#431407" strokeWidth="1.2" strokeLinecap="round" />
        <path d="M49 30l1-1.5" stroke="#431407" strokeWidth="1.2" strokeLinecap="round" />

        {/* Soft Pink Cheeks */}
        <circle cx="28" cy="38" r="3.2" fill="#fda4af" fillOpacity="0.45" />
        <circle cx="52" cy="38" r="3.2" fill="#fda4af" fillOpacity="0.45" />

        {/* Delicate Nose */}
        <path d="M39 34c1 1 2 1 2 0" stroke="#ea580c" strokeWidth="1.4" strokeLinecap="round" />

        {/* Gentle Warm Smile */}
        <path d="M35 41c2.5 2 7.5 2 10 0" stroke="#e11d48" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  // 5. Wanzil — Level 4, Male, 1100 ELO (Trimmed beard, fade haircut, emerald polo)
  if (id === 'wanzil') {
    return (
      <svg width={size} height={size} viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" className={`shrink-0 ${className}`}>
        <defs>
          <linearGradient id="wanzil_bg" x1="0" y1="0" x2="80" y2="80" gradientUnits="userSpaceOnUse">
            <stop stopColor="#14261c" />
            <stop offset="1" stopColor="#0a150f" />
          </linearGradient>
          <linearGradient id="wanzil_hair" x1="20" y1="10" x2="60" y2="40" gradientUnits="userSpaceOnUse">
            <stop stopColor="#2d221e" />
            <stop offset="1" stopColor="#140f0c" />
          </linearGradient>
        </defs>

        <rect width="80" height="80" rx="14" fill="url(#wanzil_bg)" />

        {/* Emerald Green Polo */}
        <path d="M14 80c0-14 12-24 26-24s26 10 26 24H14z" fill="#10b981" />
        <path d="M32 56l8 9 8-9" stroke="#047857" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

        {/* Neck */}
        <rect x="34" y="44" width="12" height="14" rx="2" fill="#d99f73" />

        {/* Head */}
        <ellipse cx="40" cy="34" rx="17" ry="18" fill="#d99f73" />

        {/* Ears */}
        <circle cx="22" cy="35" r="4.2" fill="#d99f73" />
        <circle cx="58" cy="35" r="4.2" fill="#d99f73" />

        {/* Crisp Textured Fade Haircut */}
        <path
          d="M22 28c1-11 7-16 18-16s17 5 18 16l-5-3c-5 1-9 0-13 2-4-2-9-1-13-2l-5 3z"
          fill="url(#wanzil_hair)"
        />
        <circle cx="40" cy="14" r="8" fill="url(#wanzil_hair)" />

        {/* Strong Masculine Eyebrows */}
        <path d="M29 25h8" stroke="#18181b" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M43 25h8" stroke="#18181b" strokeWidth="2.5" strokeLinecap="round" />

        {/* Focused Intelligent Eyes */}
        <circle cx="34" cy="31" r="2.5" fill="#18181b" />
        <circle cx="46" cy="31" r="2.5" fill="#18181b" />
        <circle cx="33.2" cy="30.2" r="1" fill="#ffffff" />
        <circle cx="45.2" cy="30.2" r="1" fill="#ffffff" />

        {/* Sculpted Beard & Trimmed Mustache */}
        <path
          d="M31 38c3-1 6-1 9 0 3-1 6-1 9 0v3c-2 5-6 8-9 8s-7-3-9-8v-3z"
          fill="url(#wanzil_hair)"
        />
        {/* Jawline Beard Stubble Wrap */}
        <path
          d="M23 35c1 9 7 15 17 15s16-6 17-15l-4 2c-3 8-7 11-13 11s-10-3-13-11l-4-2z"
          fill="url(#wanzil_hair)"
        />

        {/* Nose */}
        <path d="M39 31v4l3 1" stroke="#b45309" strokeWidth="1.6" strokeLinecap="round" />

        {/* Composed Smile Inside Beard */}
        <path d="M36 43c2 1.5 6 1.5 8 0" stroke="#ffffff" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  }

  // 6. Paul Morphy — Level 5, Male, 1400 ELO (1850s Romantic master with cravat, waistcoat, & wavy hair)
  if (id === 'morphy') {
    return (
      <svg width={size} height={size} viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" className={`shrink-0 ${className}`}>
        <defs>
          <linearGradient id="morphy_bg" x1="0" y1="0" x2="80" y2="80" gradientUnits="userSpaceOnUse">
            <stop stopColor="#251633" />
            <stop offset="1" stopColor="#120a1c" />
          </linearGradient>
          <linearGradient id="morphy_hair" x1="20" y1="10" x2="60" y2="45" gradientUnits="userSpaceOnUse">
            <stop stopColor="#451a03" />
            <stop offset="1" stopColor="#1c0e08" />
          </linearGradient>
        </defs>

        <rect width="80" height="80" rx="14" fill="url(#morphy_bg)" />

        {/* Victorian Velvet Waistcoat */}
        <path d="M14 80c0-14 12-24 26-24s26 10 26 24H14z" fill="#581c87" />
        {/* White Wing Collar Shirt */}
        <path d="M30 54l10 8 10-8-5 12h-10l-5-12z" fill="#f8fafc" />
        {/* Purple Silk Cravat Tie with Gold Antique Pin */}
        <path d="M37 56h6l-1 12h-4l-1-12z" fill="#7e22ce" />
        <circle cx="40" cy="59" r="1.5" fill="#fbbf24" />

        {/* Neck */}
        <rect x="34" y="44" width="12" height="13" rx="2" fill="#fde2cd" />

        {/* Head */}
        <ellipse cx="40" cy="34" rx="16" ry="17" fill="#fde2cd" />

        {/* Ears */}
        <circle cx="23" cy="35" r="4" fill="#fde2cd" />
        <circle cx="57" cy="35" r="4" fill="#fde2cd" />

        {/* Romantic 19th-Century Wavy Dark Hair & Sideburns */}
        <path
          d="M21 31c0-12 8-18 19-18 12 0 19 6 19 16 0 4-2 8-5 10-3-3-7-5-12-5-4 1-8 4-10 6-4-2-7-5-7-9z"
          fill="url(#morphy_hair)"
        />
        <circle cx="26" cy="24" r="5.5" fill="url(#morphy_hair)" />
        <circle cx="54" cy="24" r="5.5" fill="url(#morphy_hair)" />
        <circle cx="40" cy="15" r="7.5" fill="url(#morphy_hair)" />
        {/* Romantic Sideburns */}
        <path d="M23 31v7l3-3v-4z" fill="url(#morphy_hair)" />
        <path d="M57 31v7l-3-3v-4z" fill="url(#morphy_hair)" />

        {/* Aristocratic Eyebrows */}
        <path d="M30 26c2-1.5 6-1.5 8 0" stroke="#3b1d11" strokeWidth="2" strokeLinecap="round" />
        <path d="M42 26c2-1.5 6-1.5 8 0" stroke="#3b1d11" strokeWidth="2" strokeLinecap="round" />

        {/* Deep Thoughtful Eyes */}
        <circle cx="34" cy="32" r="2.5" fill="#1c1917" />
        <circle cx="46" cy="32" r="2.5" fill="#1c1917" />
        <circle cx="33.2" cy="31.2" r="0.9" fill="#ffffff" />
        <circle cx="45.2" cy="31.2" r="0.9" fill="#ffffff" />

        {/* Nose */}
        <path d="M39 32v4l3 1" stroke="#ea580c" strokeWidth="1.5" strokeLinecap="round" />

        {/* Calm Composed Gentleman Smile */}
        <path d="M36 42c2.5 1.5 5.5 1.5 8 0" stroke="#7c2d12" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  // 7. Judit Polgár — Level 6, Female, 1700 ELO (Tactical genius, fierce dark hair, magenta blazer)
  if (id === 'polgar') {
    return (
      <svg width={size} height={size} viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" className={`shrink-0 ${className}`}>
        <defs>
          <linearGradient id="polgar_bg" x1="0" y1="0" x2="80" y2="80" gradientUnits="userSpaceOnUse">
            <stop stopColor="#311226" />
            <stop offset="1" stopColor="#180712" />
          </linearGradient>
          <linearGradient id="polgar_hair" x1="20" y1="10" x2="60" y2="60" gradientUnits="userSpaceOnUse">
            <stop stopColor="#3b1a13" />
            <stop offset="0.6" stopColor="#240f0a" />
            <stop offset="1" stopColor="#120604" />
          </linearGradient>
        </defs>

        <rect width="80" height="80" rx="14" fill="url(#polgar_bg)" />

        {/* Flowing Voluminous Back Hair */}
        <path d="M19 32c0 15 3 27 7 31l8-9c-4-6-6-14-6-22h-9z" fill="url(#polgar_hair)" />
        <path d="M61 32c0 15-3 27-7 31l-8-9c4-6 6-14 6-22h9z" fill="url(#polgar_hair)" />

        {/* Magenta Tailored Grandmaster Blazer */}
        <path d="M14 80c0-14 12-24 26-24s26 10 26 24H14z" fill="#db2777" />
        <path d="M32 56l8 10 8-10" fill="#18181b" />
        <path d="M28 56l12 14 12-14" stroke="#be185d" strokeWidth="2.5" strokeLinecap="round" />

        {/* Neck */}
        <rect x="35" y="44" width="10" height="13" rx="2" fill="#fcd9bd" />

        {/* Head */}
        <ellipse cx="40" cy="34" rx="16" ry="17" fill="#fcd9bd" />

        {/* Ears */}
        <circle cx="23" cy="35" r="3.8" fill="#fcd9bd" />
        <circle cx="57" cy="35" r="3.8" fill="#fcd9bd" />

        {/* Voluminous Swept-Back Dark Curls */}
        <path
          d="M21 29c0-12 8-18 19-18s19 6 19 18c0 4-1 7-3 9-4-6-8-8-13-8-5 0-9 4-12 8-6-1-10-4-10-9z"
          fill="url(#polgar_hair)"
        />
        <circle cx="30" cy="15" r="6.5" fill="url(#polgar_hair)" />
        <circle cx="49" cy="16" r="7" fill="url(#polgar_hair)" />
        <circle cx="39" cy="13" r="7" fill="url(#polgar_hair)" />

        {/* Sharp Determined Tactical Eyebrows */}
        <path d="M29 25l8 1" stroke="#1c1917" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M43 26l8-1" stroke="#1c1917" strokeWidth="2.2" strokeLinecap="round" />

        {/* Intense Fierce Tactical Eyes with Glisten */}
        <ellipse cx="34" cy="31" rx="2.5" ry="2.7" fill="#1c1917" />
        <ellipse cx="46" cy="31" rx="2.5" ry="2.7" fill="#1c1917" />
        <circle cx="33.2" cy="30.2" r="1" fill="#ffffff" />
        <circle cx="45.2" cy="30.2" r="1" fill="#ffffff" />

        {/* Sculpted Nose */}
        <path d="M39 31v4l3 1" stroke="#ea580c" strokeWidth="1.5" strokeLinecap="round" />

        {/* Confident Grandmaster Grin */}
        <path d="M35 41c2.5 2 7.5 2 10 0" stroke="#be123c" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    );
  }

  // 8. José Capablanca — Level 7, Male, 2000 ELO (The Chess Machine, slicked 1920s hair, suit & tie)
  if (id === 'capablanca') {
    return (
      <svg width={size} height={size} viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" className={`shrink-0 ${className}`}>
        <defs>
          <linearGradient id="capa_bg" x1="0" y1="0" x2="80" y2="80" gradientUnits="userSpaceOnUse">
            <stop stopColor="#10202f" />
            <stop offset="1" stopColor="#081018" />
          </linearGradient>
          <linearGradient id="capa_hair" x1="20" y1="10" x2="60" y2="35" gradientUnits="userSpaceOnUse">
            <stop stopColor="#262626" />
            <stop offset="1" stopColor="#0a0a0a" />
          </linearGradient>
        </defs>

        <rect width="80" height="80" rx="14" fill="url(#capa_bg)" />

        {/* Charcoal Suit & Crisp White Shirt */}
        <path d="M14 80c0-14 12-24 26-24s26 10 26 24H14z" fill="#27272a" />
        <path d="M32 56l8 11 8-11" fill="#ffffff" />
        {/* Sapphire Blue Tie with Gold Pin */}
        <path d="M38 58h4l-1 14h-2l-1-14z" fill="#1d4ed8" />
        <line x1="38" y1="64" x2="42" y2="64" stroke="#f59e0b" strokeWidth="1.2" strokeLinecap="round" />

        {/* Neck */}
        <rect x="34" y="44" width="12" height="13" rx="2" fill="#e2b48e" />

        {/* Head */}
        <ellipse cx="40" cy="34" rx="16" ry="17" fill="#e2b48e" />

        {/* Ears */}
        <circle cx="23" cy="35" r="4" fill="#e2b48e" />
        <circle cx="57" cy="35" r="4" fill="#e2b48e" />

        {/* Sleek Glossy 1920s Combed Dark Hair */}
        <path
          d="M22 28c1-11 7-16 18-16 12 0 18 5 18 15l-5-3c-5 1-9 0-14 2-4-2-9-1-13-1l-4 3z"
          fill="url(#capa_hair)"
        />
        {/* Combed Texture Lines */}
        <path d="M26 19c4-3 9-4 14-4" stroke="#52525b" strokeWidth="1.2" strokeLinecap="round" />
        <path d="M30 22c4-2 8-3 12-2" stroke="#52525b" strokeWidth="1.2" strokeLinecap="round" />

        {/* Dignified Eyebrows */}
        <path d="M30 26h7" stroke="#18181b" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M43 26h7" stroke="#18181b" strokeWidth="2.2" strokeLinecap="round" />

        {/* Calm Composed Dark Eyes */}
        <circle cx="34" cy="32" r="2.5" fill="#18181b" />
        <circle cx="46" cy="32" r="2.5" fill="#18181b" />
        <circle cx="33.2" cy="31.2" r="0.9" fill="#ffffff" />
        <circle cx="45.2" cy="31.2" r="0.9" fill="#ffffff" />

        {/* Straight Classical Nose */}
        <path d="M39 31v5l3 1" stroke="#a16207" strokeWidth="1.5" strokeLinecap="round" />

        {/* Serene Confident Expression */}
        <path d="M36 42c2.5 1.2 5.5 1.2 8 0" stroke="#713f12" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  // 9. Bobby Fischer — Level 8, Male, 2300 ELO (Laser-focused intense brows, angular jaw, red tie)
  if (id === 'fischer') {
    return (
      <svg width={size} height={size} viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" className={`shrink-0 ${className}`}>
        <defs>
          <linearGradient id="fischer_bg" x1="0" y1="0" x2="80" y2="80" gradientUnits="userSpaceOnUse">
            <stop stopColor="#301416" />
            <stop offset="1" stopColor="#18090a" />
          </linearGradient>
          <linearGradient id="fischer_hair" x1="20" y1="10" x2="60" y2="35" gradientUnits="userSpaceOnUse">
            <stop stopColor="#78350f" />
            <stop offset="0.6" stopColor="#451a03" />
            <stop offset="1" stopColor="#291206" />
          </linearGradient>
        </defs>

        <rect width="80" height="80" rx="14" fill="url(#fischer_bg)" />

        {/* 1970s Dark Suit with Crimson Red Tie */}
        <path d="M14 80c0-14 12-24 26-24s26 10 26 24H14z" fill="#1f2937" />
        <path d="M32 56l8 11 8-11" fill="#f1f5f9" />
        <path d="M38 58h4l-1 14h-2l-1-14z" fill="#dc2626" />

        {/* Neck */}
        <rect x="34" y="44" width="12" height="13" rx="2" fill="#fbd5b8" />

        {/* Head with Angular Jaw */}
        <path d="M24 30c0-9 7-16 16-16s16 7 16 16c0 10-6 17-16 17s-16-7-16-17z" fill="#fbd5b8" />

        {/* Ears */}
        <circle cx="23" cy="35" r="4" fill="#fbd5b8" />
        <circle cx="57" cy="35" r="4" fill="#fbd5b8" />

        {/* Mid-Century Comb-Over Hair */}
        <path
          d="M22 27c1-11 7-15 18-15 11 0 18 4 18 14l-5-3c-5 1-9 0-14 2-4-2-9-1-13-1l-4 3z"
          fill="url(#fischer_hair)"
        />
        <circle cx="38" cy="14" r="7.5" fill="url(#fischer_hair)" />

        {/* Deep-Set Piercing Eyebrows Angled Inwards */}
        <path d="M29 25l8 2.5" stroke="#291206" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M51 25l-8 2.5" stroke="#291206" strokeWidth="2.5" strokeLinecap="round" />

        {/* Laser-Sharp Penetrating Eyes */}
        <circle cx="34" cy="32" r="2.4" fill="#18181b" />
        <circle cx="46" cy="32" r="2.4" fill="#18181b" />
        <circle cx="33.3" cy="31.2" r="0.8" fill="#ffffff" />
        <circle cx="45.3" cy="31.2" r="0.8" fill="#ffffff" />

        {/* Sharp Angular Nose */}
        <path d="M40 29v6l-2 1" stroke="#ea580c" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />

        {/* Uncompromising Determined Line Mouth */}
        <line x1="35" y1="42" x2="45" y2="42" stroke="#713f12" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    );
  }

  // 10. Garry Kasparov — Level 9, Male, 2550 ELO (Heavy dark brows, graying temples, fierce glare)
  if (id === 'kasparov') {
    return (
      <svg width={size} height={size} viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" className={`shrink-0 ${className}`}>
        <defs>
          <linearGradient id="kasparov_bg" x1="0" y1="0" x2="80" y2="80" gradientUnits="userSpaceOnUse">
            <stop stopColor="#2c1a14" />
            <stop offset="1" stopColor="#140b08" />
          </linearGradient>
          <linearGradient id="kasparov_hair" x1="20" y1="10" x2="60" y2="35" gradientUnits="userSpaceOnUse">
            <stop stopColor="#262626" />
            <stop offset="1" stopColor="#0f172a" />
          </linearGradient>
        </defs>

        <rect width="80" height="80" rx="14" fill="url(#kasparov_bg)" />

        {/* Dark Charcoal Blazer & Open Collar Shirt */}
        <path d="M14 80c0-14 12-24 26-24s26 10 26 24H14z" fill="#1e293b" />
        <path d="M33 56l7 9 7-9" fill="#f8fafc" />

        {/* Neck */}
        <rect x="34" y="44" width="12" height="13" rx="2" fill="#e2ad84" />

        {/* Head */}
        <ellipse cx="40" cy="34" rx="16" ry="17" fill="#e2ad84" />

        {/* Ears */}
        <circle cx="23" cy="35" r="4.2" fill="#e2ad84" />
        <circle cx="57" cy="35" r="4.2" fill="#e2ad84" />

        {/* Thick Wavy Dark Hair */}
        <path
          d="M21 28c1-11 7-16 19-16 11 0 18 5 19 15 0 3-1 6-3 8l-4-4c-5 2-9 1-13 3-4-2-9-1-13-2l-5-4z"
          fill="url(#kasparov_hair)"
        />
        <circle cx="39" cy="14" r="7.5" fill="url(#kasparov_hair)" />
        {/* Silver Gray Temples */}
        <circle cx="23" cy="27" r="3.2" fill="#94a3b8" />
        <circle cx="57" cy="27" r="3.2" fill="#94a3b8" />

        {/* Trademark Heavy Dark Bushy Eyebrows */}
        <path d="M29 25h9" stroke="#0f172a" strokeWidth="3" strokeLinecap="round" />
        <path d="M42 25h9" stroke="#0f172a" strokeWidth="3" strokeLinecap="round" />

        {/* Fierce Competitive Eyes */}
        <circle cx="34" cy="31" r="2.5" fill="#0f172a" />
        <circle cx="46" cy="31" r="2.5" fill="#0f172a" />
        <circle cx="33.2" cy="30.2" r="0.9" fill="#ffffff" />
        <circle cx="45.2" cy="30.2" r="0.9" fill="#ffffff" />

        {/* Prominent Nose */}
        <path d="M39 30v5l3 1" stroke="#9a3412" strokeWidth="1.6" strokeLinecap="round" />

        {/* Commanding Firm Smile */}
        <path d="M35 42c2.5 1.5 6.5 1.5 9 0" stroke="#451a03" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  // 11. Magnus Carlsen — Level 10, Male, 2750 ELO (Tousled dirty-blonde hair, relaxed wry smirk)
  if (id === 'carlsen') {
    return (
      <svg width={size} height={size} viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" className={`shrink-0 ${className}`}>
        <defs>
          <linearGradient id="magnus_bg" x1="0" y1="0" x2="80" y2="80" gradientUnits="userSpaceOnUse">
            <stop stopColor="#152642" />
            <stop offset="1" stopColor="#0a1322" />
          </linearGradient>
          <linearGradient id="magnus_hair" x1="20" y1="10" x2="60" y2="40" gradientUnits="userSpaceOnUse">
            <stop stopColor="#b4834b" />
            <stop offset="0.6" stopColor="#8d5b2d" />
            <stop offset="1" stopColor="#633b18" />
          </linearGradient>
        </defs>

        <rect width="80" height="80" rx="14" fill="url(#magnus_bg)" />

        {/* Royal Blue Norwegian Polo */}
        <path d="M14 80c0-14 12-24 26-24s26 10 26 24H14z" fill="#2563eb" />
        <path d="M32 56l8 9 8-9" stroke="#1e3a8a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

        {/* Neck */}
        <rect x="34" y="44" width="12" height="13" rx="2" fill="#fde3ce" />

        {/* Head */}
        <ellipse cx="40" cy="34" rx="16" ry="17" fill="#fde3ce" />

        {/* Ears */}
        <circle cx="23" cy="35" r="4" fill="#fde3ce" />
        <circle cx="57" cy="35" r="4" fill="#fde3ce" />

        {/* Trademark Tousled Sandy-Brown Messy Locks with Highlights */}
        <path
          d="M21 28c1-12 7-17 19-17 11 0 19 5 19 15 0 3-1 6-3 8l-4-4c-4 2-8 1-12 3-3-2-6-1-9 2l-6-3c-3 3-4-2-4-4z"
          fill="url(#magnus_hair)"
        />
        <circle cx="32" cy="14" r="6.5" fill="url(#magnus_hair)" />
        <circle cx="45" cy="15" r="7" fill="url(#magnus_hair)" />
        {/* Blonde Front Strands */}
        <path d="M30 18c4-3 9-3 14 0" stroke="#d97706" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M38 18l3 6" stroke="#d97706" strokeWidth="1.6" strokeLinecap="round" />

        {/* Relaxed Arched Eyebrows */}
        <path d="M30 26c2-1 6-1 8 0" stroke="#57381d" strokeWidth="2" strokeLinecap="round" />
        <path d="M42 26c2-1 6-1 8 0" stroke="#57381d" strokeWidth="2" strokeLinecap="round" />

        {/* Deep Hooded Observant Eyes */}
        <ellipse cx="34" cy="31" rx="2.4" ry="2.6" fill="#1c1917" />
        <ellipse cx="46" cy="31" rx="2.4" ry="2.6" fill="#1c1917" />
        <circle cx="33.2" cy="30.2" r="0.9" fill="#ffffff" />
        <circle cx="45.2" cy="30.2" r="0.9" fill="#ffffff" />

        {/* Nose */}
        <path d="M39 31v4l3 1" stroke="#ea580c" strokeWidth="1.5" strokeLinecap="round" />

        {/* Signature Relaxed Wry Smirk */}
        <path d="M36 42c3 0 7 1.5 9-1.5" stroke="#451a03" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    );
  }

  // Fallback for any other custom persona
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" className={`shrink-0 ${className}`}>
      <rect width="80" height="80" rx="14" fill="#1e293b" />
      <path d="M14 80c0-14 12-24 26-24s26 10 26 24H14z" fill="#3b82f6" />
      <circle cx="40" cy="35" r="16" fill="#fed7aa" />
      <circle cx="34" cy="33" r="2.5" fill="#18181b" />
      <circle cx="46" cy="33" r="2.5" fill="#18181b" />
      <path d="M36 42c2 2 6 2 8 0" stroke="#18181b" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
