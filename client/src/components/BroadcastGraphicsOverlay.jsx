import React from 'react';

/* ═══════════════════════════════════════════════════════════
   AFTER EFFECTS BROADCAST MOTION GRAPHICS RENDERER (VFX SUITE)
   ═══════════════════════════════════════════════════════════
   High-end television broadcast motion graphics:
   - 3D Multi-Tier Extruded Polygon Plates (clip-path chevrons)
   - Continuous Specular Light Sweep & Laser Sheen
   - 24K Polished Gold, Carbon Fiber & Cyber Neon Textures
   - Ambient Aura Glow, Holographic HUDs & Anamorphic Flares
   - Dedicated Category Suites (Sacred Satsang, Keynote, News, Esports, Social)
   ═══════════════════════════════════════════════════════════ */

export default function BroadcastGraphicItem({ gfx, scale = 1, isPreview = false }) {
  if (!gfx) return null;
  const l = gfx.layers || {};
  const getText = (key, fallback = '') => {
    const val = l[key];
    if (val && typeof val === 'object' && val.text !== undefined) return val.text;
    if (typeof val === 'string') return val;
    return fallback;
  };

  const isReligious = gfx.category === 'religious' || gfx.id?.includes('satsang') || gfx.id?.includes('verse');
  const isEsports = gfx.category === 'esports' || gfx.id?.includes('cyber') || gfx.id?.includes('matchup');
  const isKeynote = gfx.category === 'keynote' || gfx.id?.includes('executive') || gfx.id?.includes('event');
  const isNews = gfx.category === 'news' || gfx.id?.includes('news') || gfx.id?.includes('breaking') || gfx.id?.includes('alert');
  const isSocial = gfx.category === 'social' || gfx.id?.includes('social');

  // ═══════════════════════════════════════════════════════════
  // 1. LOWER THIRDS (AFTER EFFECTS 3D MULTI-TIER SUITE)
  // ═══════════════════════════════════════════════════════════
  if (gfx.type === 'lower-third') {
    const badgeRaw = getText('badge');
    const badge = badgeRaw ? badgeRaw.replace(/^🕉️\s*/, '').trim() : '';
    const title = getText('title', 'Speaker Name');
    const subtitle = getText('subtitle', 'Title / Designation');
    const accentColor = l.accentBar?.color || (isReligious ? '#f59e0b' : isEsports ? '#06b6d4' : isNews ? '#ef4444' : isSocial ? '#38bdf8' : '#6366f1');

    return (
      <div style={{
        position: 'absolute',
        bottom: isPreview ? '8%' : '10%',
        left: isPreview ? '5%' : '5%',
        transform: `scale(${scale})`,
        transformOrigin: 'bottom left',
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
        zIndex: 50,
        animation: 'aeSpatialIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        filter: isReligious
          ? 'drop-shadow(0 15px 30px rgba(0,0,0,0.9)) drop-shadow(0 0 25px rgba(245, 158, 11, 0.5))'
          : isEsports
          ? 'drop-shadow(0 15px 30px rgba(0,0,0,0.9)) drop-shadow(0 0 25px rgba(6, 182, 212, 0.6))'
          : isSocial
          ? 'drop-shadow(0 15px 30px rgba(0,0,0,0.9)) drop-shadow(0 0 22px rgba(56, 189, 248, 0.5))'
          : isKeynote
          ? 'drop-shadow(0 15px 30px rgba(0,0,0,0.9)) drop-shadow(0 0 20px rgba(245, 158, 11, 0.3))'
          : 'drop-shadow(0 15px 30px rgba(0,0,0,0.9)) drop-shadow(0 0 20px rgba(239, 68, 68, 0.4))',
      }}>
        {/* Tier 1: Header Badge with angled cut & status beacon */}
        {badge && (
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            alignSelf: 'flex-start',
            padding: isPreview ? '3px 14px 3px 10px' : '6px 26px 6px 18px',
            background: isReligious
              ? 'linear-gradient(90deg, #b45309 0%, #78350f 100%)'
              : isEsports
              ? 'linear-gradient(90deg, #0e7490 0%, #083344 100%)'
              : isSocial
              ? 'linear-gradient(90deg, #0284c7 0%, #3b82f6 50%, #7c3aed 100%)'
              : isKeynote
              ? 'linear-gradient(90deg, #27272a 0%, #18181b 100%)'
              : 'linear-gradient(90deg, #991b1b 0%, #1e1b4b 100%)',
            clipPath: 'polygon(0 0, calc(100% - 14px) 0, 100% 100%, 0 100%)',
            borderLeft: `5px solid ${accentColor}`,
            borderTop: isReligious ? '1.5px solid #fef08a' : isKeynote ? '1px solid rgba(245, 158, 11, 0.5)' : 'none',
            color: '#ffffff',
            fontSize: isPreview ? '0.65rem' : '1rem',
            fontWeight: 900,
            letterSpacing: 2,
            textTransform: 'uppercase',
            marginBottom: -1,
            position: 'relative',
            zIndex: 2,
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
          }}>
            <span style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: accentColor,
              boxShadow: `0 0 10px ${accentColor}`,
              animation: 'pulse 1.2s infinite',
            }} />
            {isReligious && <span style={{ marginRight: 2, fontSize: '1.1em' }}>🕉️</span>}
            {isEsports && <span style={{ color: '#22d3ee', marginRight: 2 }}>⚡</span>}
            {isSocial && <span style={{ marginRight: 2 }}>📱</span>}
            {badge}
          </div>
        )}

        {/* Tier 2: Primary Name Plate with Angled Chevron & Specular Light Sweep */}
        <div className="ae-sweep-wrap" style={{
          position: 'relative',
          display: 'inline-flex',
          alignItems: 'center',
          padding: isPreview ? '8px 24px 8px 18px' : '14px 50px 14px 34px',
          background: isReligious
            ? 'linear-gradient(135deg, #78350f 0%, #451a03 50%, #1c1917 100%)'
            : isEsports
            ? 'linear-gradient(135deg, #0891b2 0%, #0e7490 40%, #083344 100%)'
            : isSocial
            ? 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 60%, #0369a1 100%)'
            : isKeynote
            ? 'linear-gradient(135deg, #18181b 0%, #09090b 100%)'
            : isNews
            ? 'linear-gradient(135deg, #dc2626 0%, #b91c1c 45%, #7f1d1d 100%)'
            : 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
          clipPath: 'polygon(0 0, calc(100% - 24px) 0, 100% 100%, 0 100%)',
          borderLeft: `6px solid ${isReligious ? '#fef08a' : isKeynote ? '#f59e0b' : '#ffffff'}`,
          borderTop: isReligious ? '2px solid #fef08a' : isKeynote ? '1px solid rgba(255,255,255,0.2)' : 'none',
          borderBottom: isReligious ? '2px solid #b45309' : 'none',
          boxShadow: isReligious
            ? '0 0 25px rgba(245, 158, 11, 0.4), inset 0 1px 2px rgba(254, 240, 138, 0.6)'
            : 'inset 0 1px 1px rgba(255,255,255,0.4), inset 0 -2px 4px rgba(0,0,0,0.5)',
          zIndex: 1,
        }}>
          {/* Background Carbon/Hex Grid Overlay */}
          <div style={{
            position: 'absolute',
            inset: 0,
            opacity: 0.15,
            backgroundImage: 'repeating-linear-gradient(45deg, #000 0, #000 2px, transparent 0, transparent 8px)',
            pointerEvents: 'none',
          }} />

          {/* Name Text — Ultra high legibility and glow */}
          <div style={{
            position: 'relative',
            zIndex: 3,
            color: isReligious ? '#fffbeb' : '#ffffff',
            fontSize: isPreview ? '1.15rem' : '2.4rem',
            fontWeight: 900,
            textTransform: 'uppercase',
            letterSpacing: isReligious ? 2.5 : 2,
            fontFamily: "'Outfit', 'Montserrat', 'Inter', sans-serif",
            textShadow: isReligious
              ? '0 0 25px rgba(254, 240, 138, 0.95), 0 0 10px rgba(245, 158, 11, 0.8), 0 2px 6px #000000'
              : isEsports
              ? '0 0 25px rgba(6, 182, 212, 0.95), 0 0 10px rgba(34, 211, 238, 0.8), 0 2px 6px #000000'
              : isSocial
              ? '0 0 20px rgba(56, 189, 248, 0.8), 0 2px 6px #000000'
              : isKeynote
              ? '0 0 20px rgba(255, 255, 255, 0.4), 0 2px 6px #000000'
              : '0 3px 12px rgba(0,0,0,0.95), 0 1px 3px rgba(0,0,0,0.9)',
            whiteSpace: 'nowrap',
          }}>
            {title}
          </div>
        </div>

        {/* Tier 3: Subtitle Designation Bar with Frosted Acrylic Glass */}
        {subtitle && (
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: isPreview ? '4px 20px 4px 14px' : '8px 40px 8px 28px',
            background: isKeynote
              ? 'rgba(9, 9, 11, 0.96)'
              : 'rgba(11, 15, 25, 0.94)',
            backdropFilter: 'blur(16px)',
            clipPath: 'polygon(0 0, 100% 0, calc(100% - 16px) 100%, 0 100%)',
            borderLeft: `6px solid ${accentColor}`,
            borderBottom: isReligious ? '1.5px solid rgba(245, 158, 11, 0.5)' : '1px solid rgba(255,255,255,0.15)',
            color: '#cbd5e1',
            fontSize: isPreview ? '0.7rem' : '1.3rem',
            fontWeight: 600,
            letterSpacing: 1,
            marginTop: -1,
            whiteSpace: 'nowrap',
            boxShadow: '0 8px 20px rgba(0,0,0,0.7)',
          }}>
            <span style={{ color: accentColor, marginRight: 8, fontWeight: 900 }}>//</span>
            {subtitle}
          </div>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // 2. BREAKING NEWS & EVENT BANNERS (AFTER EFFECTS 3D)
  // ═══════════════════════════════════════════════════════════
  if (gfx.type === 'banner') {
    const label = getText('label', 'BREAKING NEWS');
    const headline = getText('headline', 'Live Global Broadcast in Session • Watch Continuous Coverage');

    return (
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        transform: `scale(${scale})`,
        transformOrigin: 'bottom center',
        zIndex: 55,
        animation: 'aeBannerSlide 0.45s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        filter: 'drop-shadow(0 -10px 30px rgba(0,0,0,0.85))',
      }}>
        {/* Top Hazard / Laser Border Line */}
        <div style={{
          height: 4,
          background: 'linear-gradient(90deg, #f59e0b 0%, #ef4444 30%, #ffffff 50%, #ef4444 70%, #f59e0b 100%)',
          boxShadow: '0 0 15px #ef4444',
        }} />

        <div className="ae-sweep-wrap" style={{
          display: 'flex',
          alignItems: 'center',
          background: 'linear-gradient(180deg, #b91c1c 0%, #7f1d1d 60%, #450a0a 100%)',
          padding: isPreview ? '6px 14px' : '14px 40px',
          gap: isPreview ? 10 : 20,
          borderBottom: '2px solid #000',
        }}>
          {/* Embossed Alert Pill */}
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            background: '#000000',
            color: '#fef08a',
            padding: isPreview ? '4px 10px' : '10px 24px',
            clipPath: 'polygon(0 0, calc(100% - 10px) 0, 100% 100%, 0 100%)',
            borderLeft: '5px solid #ef4444',
            fontSize: isPreview ? '0.7rem' : '1.3rem',
            fontWeight: 900,
            letterSpacing: 2,
            textTransform: 'uppercase',
            boxShadow: '0 0 15px rgba(239, 68, 68, 0.5)',
            whiteSpace: 'nowrap',
          }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', animation: 'pulse 1s infinite' }} />
            {label}
          </div>

          {/* Headline with High Legibility */}
          <div style={{
            flex: 1,
            color: '#ffffff',
            fontSize: isPreview ? '0.85rem' : '1.6rem',
            fontWeight: 800,
            letterSpacing: 1,
            fontFamily: "'Outfit', 'Inter', sans-serif",
            textShadow: '0 2px 10px rgba(0,0,0,0.9)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {headline}
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // 3. SCORE BUG / HEAD-TO-HEAD CARD (AFTER EFFECTS 3D)
  // ═══════════════════════════════════════════════════════════
  if (gfx.type === 'score') {
    const team1 = getText('team1', 'MUMBAI TITANS');
    const score1 = getText('score1', '3');
    const team2 = getText('team2', 'DELHI STRIKERS');
    const score2 = getText('score2', '2');
    const clock = getText('clock', 'Q4 02:45');

    return (
      <div style={{
        position: 'absolute',
        top: isPreview ? 10 : 36,
        left: isPreview ? 10 : 36,
        transform: `scale(${scale})`,
        transformOrigin: 'top left',
        zIndex: 50,
        animation: 'aeSpatialIn 0.5s ease-out forwards',
        filter: 'drop-shadow(0 12px 25px rgba(0,0,0,0.85))',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'stretch',
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
          borderRadius: 8,
          overflow: 'hidden',
          border: '1.5px solid rgba(255,255,255,0.2)',
          boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.3)',
        }}>
          {/* Team 1 Plate */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: isPreview ? 6 : 12,
            padding: isPreview ? '4px 10px' : '10px 24px',
            background: 'linear-gradient(90deg, #1e3a8a 0%, #1e293b 100%)',
            borderRight: '1px solid rgba(255,255,255,0.15)',
          }}>
            <span style={{ fontSize: isPreview ? '0.65rem' : '1.1rem', fontWeight: 900, color: '#93c5fd', letterSpacing: 1 }}>{team1}</span>
            <span style={{ fontSize: isPreview ? '0.95rem' : '2rem', fontWeight: 900, color: '#ffffff', fontFamily: 'monospace' }}>{score1}</span>
          </div>

          {/* Center Match Clock / VS */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: isPreview ? '2px 8px' : '6px 16px',
            background: '#020617',
            borderRight: '1px solid rgba(255,255,255,0.15)',
          }}>
            <span style={{ fontSize: isPreview ? '0.5rem' : '0.75rem', fontWeight: 800, color: '#ef4444', letterSpacing: 1, fontFamily: 'monospace' }}>
              {clock}
            </span>
            <span style={{ fontSize: isPreview ? '0.45rem' : '0.65rem', color: '#64748b', fontWeight: 900 }}>MATCH</span>
          </div>

          {/* Team 2 Plate */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: isPreview ? 6 : 12,
            padding: isPreview ? '4px 10px' : '10px 24px',
            background: 'linear-gradient(90deg, #1e293b 0%, #831843 100%)',
          }}>
            <span style={{ fontSize: isPreview ? '0.95rem' : '2rem', fontWeight: 900, color: '#ffffff', fontFamily: 'monospace' }}>{score2}</span>
            <span style={{ fontSize: isPreview ? '0.65rem' : '1.1rem', fontWeight: 900, color: '#f472b6', letterSpacing: 1 }}>{team2}</span>
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // 4. NEWS & DONATIONS TICKER MARQUEE (AFTER EFFECTS)
  // ═══════════════════════════════════════════════════════════
  if (gfx.type === 'ticker') {
    const label = getText('label', 'LIVE UPDATES');
    const text = getText('text', 'Welcome to Loyadham Live Global Broadcast • Multi-Camera Production');

    return (
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        transform: `scale(${scale})`,
        transformOrigin: 'bottom center',
        zIndex: 55,
        filter: 'drop-shadow(0 -8px 25px rgba(0,0,0,0.85))',
      }}>
        <div style={{ height: 3, background: 'linear-gradient(90deg, #06b6d4, #38bdf8, #818cf8)' }} />
        <div style={{
          display: 'flex',
          alignItems: 'center',
          background: 'rgba(8, 12, 22, 0.96)',
          backdropFilter: 'blur(16px)',
        }}>
          {/* Angled High-Gloss Badge with light sheen */}
          <div className="ae-sweep-wrap" style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: isPreview ? '4px 12px' : '10px 28px',
            background: isReligious
              ? 'linear-gradient(135deg, #b45309 0%, #d97706 100%)'
              : 'linear-gradient(135deg, #0284c7 0%, #0ea5e9 100%)',
            clipPath: 'polygon(0 0, calc(100% - 12px) 0, 100% 100%, 0 100%)',
            color: '#ffffff',
            fontWeight: 900,
            fontSize: isPreview ? '0.65rem' : '1.1rem',
            letterSpacing: 2,
            textTransform: 'uppercase',
            zIndex: 2,
            whiteSpace: 'nowrap',
          }}>
            {label}
          </div>

          {/* Marquee Text Track */}
          <div style={{ flex: 1, overflow: 'hidden', whiteSpace: 'nowrap', padding: isPreview ? '4px 0' : '10px 0' }}>
            <div style={{
              display: 'inline-block',
              animation: 'tickerMarquee 24s linear infinite',
              color: '#ffffff',
              fontSize: isPreview ? '0.75rem' : '1.3rem',
              fontWeight: 600,
              letterSpacing: 1,
            }}>
              {text}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // 5. DEVOTIONAL SHLOKA / SCRIPTURE CARD (24K GOLD AURA)
  // ═══════════════════════════════════════════════════════════
  if (gfx.type === 'verse') {
    const verse = getText('verse', 'Sacred Shloka and Divine Teachings');
    const reference = getText('reference', '— Loyadham Divine Updesh');

    return (
      <div style={{
        position: 'absolute',
        bottom: isPreview ? '8%' : '14%',
        left: '50%',
        transform: `translateX(-50%) scale(${scale})`,
        transformOrigin: 'bottom center',
        width: isPreview ? '90%' : '80%',
        maxWidth: 1000,
        zIndex: 50,
        animation: 'aeSpatialIn 0.6s ease-out forwards',
      }}>
        <div style={{
          position: 'relative',
          padding: isPreview ? '14px 18px' : '30px 52px',
          background: 'linear-gradient(135deg, rgba(26, 18, 9, 0.97) 0%, rgba(12, 10, 9, 0.99) 100%)',
          backdropFilter: 'blur(20px)',
          borderRadius: 16,
          border: '2px solid #f59e0b',
          boxShadow: '0 0 45px rgba(245, 158, 11, 0.5), 0 20px 60px rgba(0,0,0,0.9)',
          textAlign: 'center',
        }}>
          {/* Top Om Jewel Header */}
          <div style={{
            position: 'absolute',
            top: isPreview ? -16 : -24,
            left: '50%',
            transform: 'translateX(-50%)',
            width: isPreview ? 32 : 52,
            height: isPreview ? 32 : 52,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #f59e0b 0%, #b45309 100%)',
            border: '2.5px solid #fef08a',
            boxShadow: '0 0 25px #f59e0b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: isPreview ? '1.1rem' : '2rem',
            color: '#fff',
            animation: 'aeGoldAura 3s ease-in-out infinite',
          }}>
            🕉️
          </div>

          {/* Shloka Text */}
          <div style={{
            marginTop: isPreview ? 6 : 14,
            fontSize: isPreview ? '0.88rem' : '1.8rem',
            fontWeight: 600,
            color: '#fffbeb',
            fontStyle: 'italic',
            lineHeight: 1.45,
            fontFamily: "'Playfair Display', Georgia, serif",
            textShadow: '0 0 20px rgba(245, 158, 11, 0.5), 0 2px 6px rgba(0,0,0,0.9)',
          }}>
            "{verse}"
          </div>

          {/* Attribution Reference */}
          {reference && (
            <div style={{
              marginTop: isPreview ? 8 : 16,
              fontSize: isPreview ? '0.68rem' : '1.2rem',
              fontWeight: 800,
              color: '#fef08a',
              letterSpacing: 2,
              textTransform: 'uppercase',
              textShadow: '0 0 10px rgba(245, 158, 11, 0.6)',
            }}>
              {reference}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // 6. FULL SCREEN TITLE CARD (AFTER EFFECTS CINEMATIC)
  // ═══════════════════════════════════════════════════════════
  if (gfx.type === 'title') {
    const title = getText('title', 'Special Broadcast Event');
    const subtitle = getText('subtitle', 'Worldwide Live Transmission');

    return (
      <div style={{
        position: 'absolute',
        inset: 0,
        transform: `scale(${scale})`,
        transformOrigin: 'center center',
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: isPreview ? 14 : 60,
        background: 'radial-gradient(ellipse at center, rgba(30, 27, 75, 0.94) 0%, rgba(2, 6, 23, 0.98) 100%)',
        backdropFilter: 'blur(20px)',
        animation: 'fadeIn 0.7s ease-out forwards',
      }}>
        {/* Anamorphic Laser Streak Flare */}
        <div style={{
          width: '70%',
          height: 2,
          background: 'linear-gradient(90deg, transparent 0%, #38bdf8 30%, #ffffff 50%, #38bdf8 70%, transparent 100%)',
          boxShadow: '0 0 20px #38bdf8',
          marginBottom: isPreview ? 8 : 20,
        }} />

        <div style={{
          fontSize: isPreview ? '1.2rem' : '4.2rem',
          fontWeight: 900,
          color: '#ffffff',
          letterSpacing: 2,
          textTransform: 'uppercase',
          fontFamily: "'Outfit', 'Montserrat', sans-serif",
          textShadow: '0 0 40px rgba(99,102,241,0.6), 0 10px 30px rgba(0,0,0,0.9)',
          maxWidth: 1200,
        }}>
          {title}
        </div>

        {subtitle && (
          <div style={{
            fontSize: isPreview ? '0.75rem' : '1.9rem',
            color: '#93c5fd',
            marginTop: isPreview ? 6 : 16,
            fontWeight: 600,
            letterSpacing: 1.5,
            maxWidth: 1000,
            textShadow: '0 2px 15px rgba(0,0,0,0.8)',
          }}>
            {subtitle}
          </div>
        )}

        <div style={{
          width: '40%',
          height: 2,
          background: 'linear-gradient(90deg, transparent 0%, #818cf8 50%, transparent 100%)',
          marginTop: isPreview ? 8 : 24,
        }} />
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // 7. DIGITAL HUD COUNTDOWN (30s & 10s AFTER EFFECTS)
  // ═══════════════════════════════════════════════════════════
  if (gfx.type === 'countdown') {
    const is10s = gfx.id?.includes('10s');
    const label = getText('label', is10s ? 'GOING LIVE IN' : 'STREAM STARTING IN');
    const subtitle = getText('subtitle', 'Loyadham Live Multi-Camera Studio');

    return (
      <div style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: `translate(-50%, -50%) scale(${scale})`,
        transformOrigin: 'center center',
        zIndex: 50,
        animation: 'aeSpatialIn 0.5s ease-out forwards',
      }}>
        <div style={{
          position: 'relative',
          background: 'rgba(8, 12, 22, 0.95)',
          backdropFilter: 'blur(20px)',
          border: '2px solid rgba(56, 189, 248, 0.6)',
          borderRadius: 24,
          padding: isPreview ? '14px 24px' : '40px 80px',
          textAlign: 'center',
          boxShadow: '0 0 50px rgba(56, 189, 248, 0.4), 0 25px 60px rgba(0,0,0,0.9)',
        }}>
          {/* Header Label */}
          <div style={{
            fontSize: isPreview ? '0.65rem' : '1.2rem',
            fontWeight: 900,
            color: '#94a3b8',
            letterSpacing: 3,
            textTransform: 'uppercase',
          }}>
            {label}
          </div>

          {/* Holographic Glowing Digital Clock */}
          <div style={{
            fontSize: isPreview ? '1.8rem' : '6rem',
            fontWeight: 900,
            color: '#38bdf8',
            fontFamily: 'monospace',
            margin: isPreview ? '4px 0' : '8px 0',
            textShadow: '0 0 35px rgba(56,189,248,0.7)',
            letterSpacing: 2,
          }}>
            {is10s ? '00:10' : '00:30'}
          </div>

          {/* Subtitle */}
          <div style={{
            fontSize: isPreview ? '0.6rem' : '1.2rem',
            color: '#cbd5e1',
            fontWeight: 600,
            letterSpacing: 1,
          }}>
            {subtitle}
          </div>
        </div>
      </div>
    );
  }

  return null;
}
